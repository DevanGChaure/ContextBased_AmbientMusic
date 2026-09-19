"""
Maps (dominant_emotion, intensity_bucket) -> track id.

Placeholder mapping (Step 9 from your design doc: same emotion, different
intensity, different track, so it doesn't sound identical every time).

Edit TRACK_MAP to point at your actual audio library. Track ids are just
strings for now — swap in real filenames/paths once you have audio assets.
"""

INTENSITY_BUCKETS = [
    (0, 33, "low"),
    (34, 66, "medium"),
    (67, 100, "high"),
]


def intensity_bucket(intensity: int) -> str:
    for lo, hi, label in INTENSITY_BUCKETS:
        if lo <= intensity <= hi:
            return label
    return "medium"


# (dominant_emotion, bucket) -> track id. Fill in real ones as you get audio.
TRACK_MAP = {
    ("Joy", "low"): "joy_01_soft",
    ("Joy", "medium"): "joy_02_warm",
    ("Joy", "high"): "joy_03_bright",
    ("Sadness", "low"): "sadness_01_quiet",
    ("Sadness", "medium"): "sadness_02_ache",
    ("Sadness", "high"): "sadness_03_grief",
    ("Fear", "low"): "fear_01_unease",
    ("Fear", "medium"): "fear_02_tension",
    ("Fear", "high"): "fear_03_panic",
    ("Anger", "low"): "anger_01_simmer",
    ("Anger", "medium"): "anger_02_sharp",
    ("Anger", "high"): "anger_03_rage",
    ("Romance", "low"): "romance_01_gentle",
    ("Romance", "medium"): "romance_02_warm",
    ("Romance", "high"): "romance_03_swell",
    ("Interest", "low"): "interest_01_curious",
    ("Interest", "medium"): "interest_02_building",
    ("Interest", "high"): "interest_03_urgent",
    ("Surprise", "low"): "surprise_01_blip",
    ("Surprise", "medium"): "surprise_02_sting",
    ("Surprise", "high"): "surprise_03_shock",
    ("Neutral", "low"): "neutral_01_ambient",
    ("Neutral", "medium"): "neutral_02_ambient",
    ("Neutral", "high"): "neutral_03_ambient",
}


def track_for(dominant_emotion: str, intensity: int) -> str:
    bucket = intensity_bucket(intensity)
    return TRACK_MAP.get((dominant_emotion, bucket), "neutral_02_ambient")
