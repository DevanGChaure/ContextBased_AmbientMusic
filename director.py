"""
Emotion Director.

This is no longer a binary "switch / don't switch" gate. It has two jobs:

1. QA the Emotion Agent's classification. It sees the scene text/summary and
   can override the dominant emotion, sub-emotion, or intensity if it thinks
   the sub-agent got it wrong — with a reason logged either way.

2. Own playback dynamics. It picks one of a fixed set of actions and the
   fade/silence timing for that action, rather than main.py or the audio
   engine hardcoding "always crossfade" or "always cut".

Actions (this is the audio engine's entire vocabulary — the client player
should only need to implement these primitives):

  hold                  - do nothing, current track keeps playing
  cut                   - abrupt stop of current track, abrupt start of new one
                           (use for a genuine shock beat — a scream, a death,
                           a sudden reveal)
  crossfade             - current track fades out WHILE new track fades in,
                           overlapping (use for a smooth mood shift)
  fade_out_pause_fade_in- current track fades out, silence, then new track
                           fades in (use for a scene that needs a breath
                           before the next beat lands)
  fade_to_silence       - current track fades out to silence and STAYS
                           silent — no new track starts. Use for suspense,
                           a held breath, a moment the prose itself is
                           carrying. State remembers what was playing so it
                           can be resumed later.
  resume_from_silence   - fades back in, either the same track that was
                           paused or a new one if the mood has since shifted

This is the one call in the pipeline that goes to Gemini instead of Ollama —
deliberately, since this is the judgment-heavy, low-volume call, versus the
high-volume per-chunk classification work Ollama does locally.
"""

import config
import director_llm
import taxonomy
import tracks

VALID_ACTIONS = {
    "hold",
    "cut",
    "crossfade",
    "fade_out_pause_fade_in",
    "fade_to_silence",
    "resume_from_silence",
}

SYSTEM_PROMPT = """You are the Emotion Director for a novel's background music system —
final authority before playback. Two jobs:

JOB 1 — QA the emotion classification.
A smaller model already picked a dominant/sub emotion for this scene; it can
miss sarcasm, over-weight one loaded word, or ignore prior-scene context.
Read the summary and text yourself. Agree, or override with your own
judgment and a one-sentence reason either way.

Dominant emotions (exact match): {dominants}
Sub-emotions per dominant:
{sub_map}

JOB 2 — decide the playback action. Pick exactly ONE:
- hold (DEFAULT — use unless there's a real reason to act): a brief tonal
  blip, not a real scene-level shift.
- cut: abrupt stop+start. Only genuine shock beats — sudden violence, a
  scream, a death, a jump-scare reveal. Overuse ruins it.
- crossfade: smooth overlapping transition, for a real but gradual mood
  shift.
- fade_out_pause_fade_in: fade out, brief silence, fade in — the scene needs
  a breath between beats.
- fade_to_silence: fade out and STAY silent, no new track — held-breath
  suspense, a moment the prose alone should carry. Not every calm scene.
- resume_from_silence: only if currently silent. Resume the same track if
  the mood that caused silence has resolved back; a new one if the mood
  shifted while silent.

Set fade_ms (typ. 800-4000) and, only if relevant, silence_ms (typ.
1500-6000); else 0.

Prefer continuity over reactivity — switching action every chunk feels
frantic and breaks immersion.

Respond with ONLY JSON of this exact shape:
{{
  "emotion_agrees": true/false,
  "corrected_dominant_emotion": "<dominant — same as input if you agree>",
  "corrected_sub_emotion": "<sub — same as input if you agree>",
  "corrected_intensity": <0-100>,
  "emotion_reasoning": "one sentence — agreement, or what/why you corrected",
  "action": "<hold|cut|crossfade|fade_out_pause_fade_in|fade_to_silence|resume_from_silence>",
  "fade_ms": <integer>,
  "silence_ms": <integer>,
  "action_reasoning": "one or two sentences on the playback decision"
}}
"""

USER_PROMPT_TEMPLATE = """Current audio state:
- current_emotion: {current_emotion}
- current_sub_emotion: {current_sub_emotion}
- current_intensity: {current_intensity}
- trend: {trend}
- duration_chunks (how long this emotion has held): {duration_chunks}
- current_track: {current_track}
- is_silent: {is_silent}
- track that was playing before silence (if any): {pre_silence_track}

Emotion Agent's classification for the next chunk (may be wrong — QA it):
- dominant_emotion: {new_dominant}
- sub_emotion: {new_sub}
- intensity: {new_intensity}
- confidence: {confidence}

Scene summary: {scene_summary}

Scene text:
{chunk_text}
"""


def _format_sub_map() -> str:
    lines = []
    for dominant, subs in taxonomy.TAXONOMY.items():
        lines.append(f'  {dominant}: {", ".join(subs)}')
    return "\n".join(lines)


def decide(state: dict, classification: dict, scene_summary: str, chunk_text: str,
           model: str = None) -> dict:
    system = SYSTEM_PROMPT.format(
        dominants=", ".join(taxonomy.DOMINANT_EMOTIONS),
        sub_map=_format_sub_map(),
    )

    prompt = USER_PROMPT_TEMPLATE.format(
        current_emotion=state.get("current_emotion"),
        current_sub_emotion=state.get("current_sub_emotion"),
        current_intensity=state.get("current_intensity"),
        trend=state.get("trend"),
        duration_chunks=state.get("duration_chunks"),
        current_track=state.get("current_track"),
        is_silent=state.get("is_silent", False),
        pre_silence_track=state.get("pre_silence_track"),
        new_dominant=classification["dominant_emotion"],
        new_sub=classification["sub_emotion"],
        new_intensity=classification["intensity"],
        confidence=classification["confidence"],
        scene_summary=scene_summary or "(none)",
        chunk_text=chunk_text,
    )

    raw = director_llm.generate_json(
        prompt=prompt, system=system, model=model, temperature=0.3
    )

    # --- Guardrail: validate emotion correction against taxonomy ---
    corrected_dominant = raw.get("corrected_dominant_emotion", classification["dominant_emotion"])
    if corrected_dominant not in taxonomy.DOMINANT_EMOTIONS:
        corrected_dominant = classification["dominant_emotion"]

    allowed_subs = taxonomy.sub_emotions_for(corrected_dominant)
    corrected_sub = raw.get("corrected_sub_emotion", classification["sub_emotion"])
    if corrected_sub not in allowed_subs:
        corrected_sub = allowed_subs[0] if allowed_subs else classification["sub_emotion"]

    corrected_intensity = int(raw.get("corrected_intensity", classification["intensity"]))
    corrected_intensity = max(0, min(100, corrected_intensity))

    emotion_agrees = bool(raw.get("emotion_agrees", True))
    emotion_reasoning = raw.get("emotion_reasoning", "")

    # --- Guardrail: validate action against the fixed vocabulary ---
    action = raw.get("action", "hold")
    if action not in VALID_ACTIONS:
        action = "hold"

    # resume_from_silence only makes sense if we're actually silent
    if action == "resume_from_silence" and not state.get("is_silent", False):
        action = "crossfade"
    # fade_to_silence when already silent is a no-op, just hold
    if action == "fade_to_silence" and state.get("is_silent", False):
        action = "hold"

    fade_ms = int(raw.get("fade_ms", 0) or 0)
    fade_ms = max(0, min(fade_ms, 15000))
    silence_ms = int(raw.get("silence_ms", 0) or 0)
    silence_ms = max(0, min(silence_ms, 30000))

    action_reasoning = raw.get("action_reasoning", "")

    # --- Resolve the actual track id for this action ---
    final_emotion = corrected_dominant
    final_intensity = corrected_intensity

    if action in ("cut", "crossfade", "fade_out_pause_fade_in"):
        track_id = tracks.track_for(final_emotion, final_intensity)
    elif action == "resume_from_silence":
        # prefer resuming the exact track that was paused, unless the mood
        # has moved on to a different dominant emotion since then
        pre_track = state.get("pre_silence_track")
        if pre_track and final_emotion == state.get("current_emotion"):
            track_id = pre_track
        else:
            track_id = tracks.track_for(final_emotion, final_intensity)
    elif action == "fade_to_silence":
        track_id = None
    else:  # hold
        track_id = state.get("current_track")

    return {
        "emotion_agrees": emotion_agrees,
        "original_dominant_emotion": classification["dominant_emotion"],
        "original_sub_emotion": classification["sub_emotion"],
        "final_dominant_emotion": final_emotion,
        "final_sub_emotion": corrected_sub,
        "final_intensity": final_intensity,
        "emotion_reasoning": emotion_reasoning,
        "action": action,
        "fade_ms": fade_ms,
        "silence_ms": silence_ms,
        "action_reasoning": action_reasoning,
        "track_id": track_id,
    }