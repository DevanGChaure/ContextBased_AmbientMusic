"""
Structured memory storage + retrieval (Steps 3-4).

Backed by three JSON files per book:
  memory/characters.json      character_name -> {"traits": [...], "events": [...]}
  memory/relationships.json   "nameA|nameB" (sorted) -> {"traits": [...], "events": [...]}
  memory/scene_history.json   [scene_summary, scene_summary, ...]

Facts are split into two buckets per character/relationship:
  traits — durable (appearance, backstory, personality); capped high.
  events — transient (what just happened); capped low, ages out fast.
This keeps a long book from letting early defining facts (e.g. hair color)
get silently evicted by a pile of short-term scene events.

Retrieval doesn't send the whole book — just recent scene history plus facts
for whichever characters appear in the current chunk (Step 4).
"""

import difflib
import json
import os
import re

import config
import ollama_client


def _paths(book_id: str):
    mem_dir = os.path.join(config.book_cache_dir(book_id), "memory")
    os.makedirs(mem_dir, exist_ok=True)
    return {
        "characters": os.path.join(mem_dir, "characters.json"),
        "relationships": os.path.join(mem_dir, "relationships.json"),
        "scene_history": os.path.join(mem_dir, "scene_history.json"),
    }


def _load(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def _save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _rel_key(name_a: str, name_b: str) -> str:
    return "|".join(sorted([name_a.strip(), name_b.strip()], key=str.lower))


def _normalize_name(name: str) -> str:
    """Strip stray punctuation/whitespace the model sometimes injects
    (e.g. 'Sub,aru' instead of 'Subaru')."""
    cleaned = re.sub(r"[^\w\s'-]", "", name)
    return re.sub(r"\s+", " ", cleaned).strip()


def _normalize_bucket_entry(entry):
    """
    Coerce a stored entry into {"traits": [...], "events": [...]} shape.
    Handles the legacy flat-list format from before the trait/event split —
    old facts get parked under "events" since we can't retroactively tell
    which ones were durable, so they'll simply need to be re-established
    (or you can start a fresh --book-id / clear the cache).
    """
    if isinstance(entry, list):
        return {"traits": [], "events": list(entry)}
    if isinstance(entry, dict):
        return {
            "traits": list(entry.get("traits", [])),
            "events": list(entry.get("events", [])),
        }
    return {"traits": [], "events": []}


def _append_fact(store: dict, key: str, fact: str, fact_type: str):
    entry = store.setdefault(key, {"traits": [], "events": []})
    bucket = "traits" if fact_type == "trait" else "events"
    entry[bucket].append(fact)
    cap = config.MAX_CHARACTER_TRAITS if bucket == "traits" else config.MAX_CHARACTER_EVENTS
    entry[bucket] = entry[bucket][-cap:]


def _resolve_character_names(raw_names, existing_keys, evidence=None, model=None) -> dict:
    """
    Canonicalize a batch of newly-extracted character names, merging:
      - aliases against the existing store (e.g. "the Grocer" -> a name
        already tracked), and
      - aliases WITHIN this batch itself (e.g. a chunk that introduces
        someone as "Youth" and then reveals "Natsuki Subaru" a few
        paragraphs later, before either name is in the store yet).

    `evidence` is an optional {raw_name: [fact, fact, ...]} dict built from
    this chunk's own character_updates. Bare names alone often aren't enough
    signal to tell "Youth" and "Natsuki Subaru" are the same person — the
    facts attached to each name are what actually let the model infer that.

    Returns {raw_name: canonical_name_to_store_under}. Falls back to a
    cheap deterministic cleanup if the LLM call fails or returns something
    unusable, so a flaky local-model response never blocks a memory write.
    """
    existing_keys = list(existing_keys)
    evidence = evidence or {}
    raw_names = [n for n in raw_names if n and n.strip()]
    if not raw_names:
        return {}

    resolved = {}
    ambiguous = []

    for raw in raw_names:
        cleaned = _normalize_name(raw)
        if not cleaned:
            resolved[raw] = cleaned
            continue
        match = next((k for k in existing_keys if k.lower() == cleaned.lower()), None)
        if match:
            resolved[raw] = match
            continue
        close = difflib.get_close_matches(cleaned, existing_keys, n=1, cutoff=0.85)
        if close:
            resolved[raw] = close[0]
            continue
        ambiguous.append(raw)

    if not ambiguous:
        return resolved

    system = (
        "You track character identity across a novel. You'll get a list of "
        "ALREADY-KNOWN character names (may be empty), a list of NEW names "
        "just extracted from the current chunk, and the FACTS attached to "
        "each new name (what the text said about that name).\n\n"
        "Group any new names that refer to the SAME character — including "
        "epithets/titles revealed as a proper name for the first time (e.g. "
        "'the youth' and 'Natsuki Subaru' can be the same person), nicknames, "
        "and typos. Use the attached facts as your primary evidence: if two "
        "names' facts read as a continuous description of one person (e.g. "
        "physical description under one name, biographical facts under "
        "another, with no contradiction), treat them as the same character. "
        "Also match new names against the known list where applicable.\n\n"
        "For each group referring to one character, pick ONE canonical name: "
        "prefer an existing known name if one matches; otherwise prefer the "
        "fullest proper name over a generic descriptor (e.g. prefer "
        "'Natsuki Subaru' over 'the youth').\n\n"
        "Respond with ONLY a JSON object mapping every new name (each one, "
        "even if unchanged) to its canonical name. Do not invent names that "
        "aren't in either list. Do not merge names whose facts actively "
        "contradict each other (different ages, different physical "
        "descriptions, clearly separate roles in the same scene)."
    )
    evidence_block = {name: evidence.get(name, []) for name in ambiguous}
    prompt = (
        f"Known characters: {json.dumps(existing_keys)}\n"
        f"New names to resolve, with their facts from this chunk: "
        f"{json.dumps(evidence_block, ensure_ascii=False)}"
    )

    try:
        model = model or config.DEFAULT_OLLAMA_MODEL
        result = ollama_client.generate_json(
            prompt, system=system, model=model, temperature=0.0
        )
        if not isinstance(result, dict):
            raise ValueError(f"expected dict, got {type(result).__name__}")
        for raw in ambiguous:
            mapped = result.get(raw)
            resolved[raw] = mapped.strip() if isinstance(mapped, str) and mapped.strip() else _normalize_name(raw)
    except Exception as e:
        print(f"  [memory_store] LLM name resolution failed, falling back to raw names: {e}")
        for raw in ambiguous:
            resolved[raw] = _normalize_name(raw)

    return resolved


def update_memory(book_id: str, memory_agent_output: dict):
    """Persist a memory agent's output into the structured store."""
    paths = _paths(book_id)

    def _as_dict(item):
        if isinstance(item, dict):
            return item
        print(f"  [memory_store] skipping malformed update (expected dict, got {type(item).__name__}): {item!r}")
        return {}

    def _fact_type(update: dict) -> str:
        ft = update.get("fact_type", "event")
        return "trait" if ft == "trait" else "event"  # unknown values fall back to "event" (safer)

    raw_characters = _load(paths["characters"], {})
    characters = {name: _normalize_bucket_entry(entry) for name, entry in raw_characters.items()}

    char_updates = [_as_dict(u) for u in memory_agent_output.get("character_updates", [])]
    rel_updates = [_as_dict(u) for u in memory_agent_output.get("relationship_updates", [])]

    # Gather every raw name mentioned this chunk, plus the facts attached to
    # each — that's the evidence the resolver needs to spot "Youth" and
    # "Natsuki Subaru" as one person within the same chunk.
    raw_names = set()
    evidence = {}
    for u in char_updates:
        n = u.get("character", "").strip()
        f = u.get("fact", "").strip()
        if n:
            raw_names.add(n)
            if f:
                evidence.setdefault(n, []).append(f)
    for u in rel_updates:
        for n in u.get("characters", []):
            if isinstance(n, str) and n.strip():
                raw_names.add(n.strip())

    name_map = _resolve_character_names(raw_names, characters.keys(), evidence=evidence)

    for update in char_updates:
        raw_name = update.get("character", "").strip()
        name = name_map.get(raw_name, "")
        fact = update.get("fact", "").strip()
        if not name or not fact:
            continue
        _append_fact(characters, name, fact, _fact_type(update))
    _save(paths["characters"], characters)

    raw_relationships = _load(paths["relationships"], {})
    relationships = {key: _normalize_bucket_entry(entry) for key, entry in raw_relationships.items()}

    for update in rel_updates:
        raw_pair = update.get("characters", [])
        fact = update.get("fact", "").strip()
        if len(raw_pair) != 2 or not fact:
            continue
        names = [name_map.get(n.strip(), _normalize_name(n)) for n in raw_pair]
        key = _rel_key(names[0], names[1])
        _append_fact(relationships, key, fact, _fact_type(update))
    _save(paths["relationships"], relationships)

    scene_history = _load(paths["scene_history"], [])
    summary = memory_agent_output.get("scene_summary", "").strip()
    if summary:
        scene_history.append(summary)
    _save(paths["scene_history"], scene_history)


def _guess_characters_mentioned(chunk_text: str, known_characters):
    """Cheap heuristic: check which known character names appear in the text."""
    mentioned = []
    for name in known_characters:
        if re.search(r"\b" + re.escape(name) + r"\b", chunk_text):
            mentioned.append(name)
    return mentioned


def retrieve_context(book_id: str, chunk_text: str) -> dict:
    """
    Returns a compact context block for the emotion agent / director:
    recent scene history + facts about characters present in this chunk.
    Deliberately small — Step 4's "10 memories, not 300 pages".

    Traits and events are combined into a single flat list per character/
    relationship here (traits first) so downstream consumers (emotion_agent's
    prompt formatting) don't need to know about the trait/event split —
    that distinction only matters for how facts are capped in storage.
    """
    paths = _paths(book_id)
    raw_characters = _load(paths["characters"], {})
    raw_relationships = _load(paths["relationships"], {})
    scene_history = _load(paths["scene_history"], [])

    characters = {name: _normalize_bucket_entry(entry) for name, entry in raw_characters.items()}
    relationships = {key: _normalize_bucket_entry(entry) for key, entry in raw_relationships.items()}

    mentioned = _guess_characters_mentioned(chunk_text, characters.keys())

    character_context = {
        name: characters[name]["traits"] + characters[name]["events"]
        for name in mentioned
    }

    relationship_context = {}
    for key, entry in relationships.items():
        a, b = key.split("|")
        if a in mentioned or b in mentioned:
            relationship_context[key] = entry["traits"] + entry["events"]

    recent_scenes = scene_history[-config.SCENE_HISTORY_WINDOW:]

    return {
        "recent_scene_summaries": recent_scenes,
        "characters_present": character_context,
        "relevant_relationships": relationship_context,
    }