"""
Two-stage emotion taxonomy.

Stage 1: model picks exactly one DOMINANT emotion (the keys below).
Stage 2: model picks exactly one SUB emotion from that dominant emotion's list.

This is a placeholder taxonomy sized to land around 25 total sub-emotions,
matching the shape of the Kindle app's classifier. Replace the contents with
your actual 25-label taxonomy — keep the same dict-of-lists shape so the rest
of the pipeline doesn't need to change.
"""

TAXONOMY = {
    "Joy": ["Contentment", "Excitement", "Relief", "Pride"],
    "Sadness": ["Empathy", "Nostalgia", "Regret", "Loneliness", "Acceptance"],
    "Fear": ["Anxiety", "Dread", "Panic"],
    "Anger": ["Frustration", "Resentment", "Indignation"],
    "Romance": ["Longing", "Tenderness", "Infatuation"],
    "Interest": ["Curiosity", "Suspense", "Anticipation"],
    "Surprise": ["Shock", "Confusion"],
    "Neutral": ["Calm", "Matter-of-fact"],
}

DOMINANT_EMOTIONS = list(TAXONOMY.keys())


def sub_emotions_for(dominant: str):
    return TAXONOMY.get(dominant, [])
