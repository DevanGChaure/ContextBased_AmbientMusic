"""
Orchestrator. Run this.

Usage:
    python main.py --book novels/rezero_arc1.txt --book-id rezero_arc1

Resumable: re-running with the same --book-id skips chunks that already
have a completed timeline entry.
"""

import argparse
import json
import os
import sys
import time

import config
import chunker
import memory_agent
import memory_store
import emotion_agent
import director
import state_machine


def _chunk_path(book_id, idx, subdir):
    d = os.path.join(config.book_cache_dir(book_id), subdir)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"chunk_{idx:04d}.json")


def _load_json(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _load_timeline(book_id):
    path = os.path.join(config.book_cache_dir(book_id), "timeline.json")
    return _load_json(path) or []


def _save_timeline(book_id, timeline):
    path = os.path.join(config.book_cache_dir(book_id), "timeline.json")
    _save_json(path, timeline)


def _append_director_log(book_id, entry):
    path = os.path.join(config.book_cache_dir(book_id), "director_log.jsonl")
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def process_chunk(book_id, chunk, ollama_model, director_model, state):
    idx = chunk.index

    # --- Memory agent (resumable) ---
    mem_path = _chunk_path(book_id, idx, "chunks")
    mem_result = _load_json(mem_path)
    if mem_result is None:
        mem_result = memory_agent.run_memory_agent(chunk.text, model=ollama_model)
        mem_result["_chunk_text"] = chunk.text
        mem_result["_word_count"] = chunk.word_count
        _save_json(mem_path, mem_result)
        memory_store.update_memory(book_id, mem_result)
    scene_summary = mem_result.get("scene_summary", "")

    # --- Retrieval ---
    context = memory_store.retrieve_context(book_id, chunk.text)

    # --- Emotion agent (resumable) ---
    emo_path = _chunk_path(book_id, idx, "emotions")
    classification = _load_json(emo_path)
    if classification is None:
        classification = emotion_agent.classify_emotion(
            chunk.text, scene_summary, context, model=ollama_model
        )
        _save_json(emo_path, classification)

    # --- Director (Gemini or Groq): QAs the emotion AND decides the playback action ---
    decision = director.decide(
        state, classification, scene_summary, chunk.text, model=director_model
    )
    _append_director_log(book_id, {
        "chunk_index": idx,
        "classification": classification,
        "decision": decision,
    })

    # --- Advance state machine ---
    new_state = state_machine.advance_state(state=state, chunk_index=idx, decision=decision)
    state_machine.save_state(book_id, new_state)

    timeline_entry = {
        "chunk_index": idx,
        "is_new_chapter": chunk.is_new_chapter,
        "scene_summary": scene_summary,

        # what the emotion agent said vs what the director settled on
        "raw_dominant_emotion": decision["original_dominant_emotion"],
        "raw_sub_emotion": decision["original_sub_emotion"],
        "emotion_agent_confidence": classification["confidence"],
        "director_agreed_with_emotion": decision["emotion_agrees"],
        "emotion_reasoning": decision["emotion_reasoning"],

        "dominant_emotion": decision["final_dominant_emotion"],
        "sub_emotion": decision["final_sub_emotion"],
        "intensity": decision["final_intensity"],

        # playback instructions for the audio engine
        "action": decision["action"],
        "fade_ms": decision["fade_ms"],
        "silence_ms": decision["silence_ms"],
        "track_id": decision["track_id"],
        "action_reasoning": decision["action_reasoning"],
    }

    return timeline_entry, new_state


def main():
    parser = argparse.ArgumentParser(description="Emotion-aware music POC pipeline")
    parser.add_argument("--book", required=True, help="Path to novel .txt file")
    parser.add_argument("--book-id", required=True, help="Unique id for cache folder")
    parser.add_argument("--ollama-model", default=config.DEFAULT_OLLAMA_MODEL)
    parser.add_argument("--director-provider", choices=["gemini", "groq"],
                         default=config.DIRECTOR_PROVIDER,
                         help="Which cloud LLM the Director uses")
    parser.add_argument("--director-model", default=None,
                         help="Overrides the default model for whichever "
                              "--director-provider is chosen")
    parser.add_argument("--max-chunk-words", type=int, default=config.DEFAULT_MAX_CHUNK_WORDS)
    parser.add_argument("--limit", type=int, default=None,
                         help="Only process the first N chunks (for testing)")
    args = parser.parse_args()

    config.DIRECTOR_PROVIDER = args.director_provider

    if not os.path.exists(args.book):
        print(f"Book file not found: {args.book}", file=sys.stderr)
        sys.exit(1)

    with open(args.book, "r", encoding="utf-8") as f:
        raw_text = f.read()

    print(f"Chunking {args.book} ...")
    chunks = chunker.chunk_novel(raw_text, max_chunk_words=args.max_chunk_words)
    print(f"  -> {len(chunks)} chunks")

    if args.limit:
        chunks = chunks[: args.limit]

    timeline = _load_timeline(args.book_id)
    already_done = {entry["chunk_index"] for entry in timeline}
    state = state_machine.load_state(args.book_id)

    remaining = [c for c in chunks if c.index not in already_done]
    if not remaining:
        print("Nothing to do — all requested chunks are already in timeline.json.")
        return
    print(f"Resuming: {len(already_done)} chunks already done, "
          f"{len(remaining)} remaining.")

    for chunk in remaining:
        t0 = time.time()
        entry, state = process_chunk(
            args.book_id, chunk, args.ollama_model, args.director_model, state
        )
        timeline.append(entry)
        timeline.sort(key=lambda e: e["chunk_index"])
        _save_timeline(args.book_id, timeline)

        elapsed = time.time() - t0
        qa_flag = "" if entry["director_agreed_with_emotion"] else " [emotion OVERRIDDEN]"
        action_str = entry["action"].upper().ljust(22)
        print(f"[{chunk.index:04d}] {action_str} "
              f"{entry['dominant_emotion']}/{entry['sub_emotion']} "
              f"(intensity={entry['intensity']}, "
              f"agent_conf={entry['emotion_agent_confidence']:.2f}){qa_flag} "
              f"-> {entry['track_id']}  ({elapsed:.1f}s)")

    print(f"\nDone. Timeline written to "
          f"{os.path.join(config.book_cache_dir(args.book_id), 'timeline.json')}")


if __name__ == "__main__":
    main()
