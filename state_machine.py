"""
Emotional + audio state machine.

Two concerns tracked separately:

1. Emotional continuity — current/previous emotion, intensity trend, and how
   many consecutive chunks the current emotion has held. This exists so the
   Director can tell "still building tension" from "brand new mood", and is
   updated from the Director's *final* (QA'd) emotion, not the raw
   classifier output.

2. Audio state — what's actually playing right now, and whether we're in a
   deliberate silence (from a "fade_to_silence" action) with a track parked
   to potentially resume later via "resume_from_silence".
"""

import json
import os

import config

DEFAULT_STATE = {
    # emotional continuity
    "current_emotion": None,
    "current_sub_emotion": None,
    "current_intensity": 0,
    "previous_emotion": None,
    "trend": "stable",         # "increasing" | "decreasing" | "stable"
    "duration_chunks": 0,      # consecutive chunks current_emotion has held

    # audio state
    "current_track": None,
    "is_silent": False,
    "pre_silence_track": None, # track parked for a possible resume_from_silence
    "last_action": None,

    "last_chunk_index": -1,
}


def _state_path(book_id: str) -> str:
    return os.path.join(config.book_cache_dir(book_id), "state.json")


def load_state(book_id: str) -> dict:
    path = _state_path(book_id)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return dict(DEFAULT_STATE)


def save_state(book_id: str, state: dict):
    path = _state_path(book_id)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def advance_state(state: dict, chunk_index: int, decision: dict) -> dict:
    """
    Applies a Director decision (see director.decide()'s return shape) to
    the current state and returns the new state.
    """
    final_emotion = decision["final_dominant_emotion"]
    final_sub_emotion = decision["final_sub_emotion"]
    final_intensity = decision["final_intensity"]
    action = decision["action"]
    track_id = decision["track_id"]

    # --- emotional continuity, independent of the audio action taken ---
    same_emotion = (final_emotion == state.get("current_emotion"))
    if same_emotion:
        prev_intensity = state.get("current_intensity", 0)
        if final_intensity > prev_intensity:
            trend = "increasing"
        elif final_intensity < prev_intensity:
            trend = "decreasing"
        else:
            trend = "stable"
        duration = state.get("duration_chunks", 0) + 1
    else:
        trend = "stable"
        duration = 1

    # --- audio state, driven by the action ---
    current_track = state.get("current_track")
    is_silent = state.get("is_silent", False)
    pre_silence_track = state.get("pre_silence_track")

    if action == "hold":
        pass  # current_track / is_silent / pre_silence_track all unchanged
    elif action in ("cut", "crossfade", "fade_out_pause_fade_in"):
        current_track = track_id
        is_silent = False
        pre_silence_track = None
    elif action == "fade_to_silence":
        pre_silence_track = current_track
        current_track = None
        is_silent = True
    elif action == "resume_from_silence":
        current_track = track_id
        is_silent = False
        pre_silence_track = None

    return {
        "current_emotion": final_emotion,
        "current_sub_emotion": final_sub_emotion,
        "current_intensity": final_intensity,
        "previous_emotion": state.get("current_emotion"),
        "trend": trend,
        "duration_chunks": duration,
        "current_track": current_track,
        "is_silent": is_silent,
        "pre_silence_track": pre_silence_track,
        "last_action": action,
        "last_chunk_index": chunk_index,
    }
