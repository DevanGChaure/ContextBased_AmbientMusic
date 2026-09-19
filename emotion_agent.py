"""
Emotion Agent (Steps 5-6): two-stage classification.

Stage 1: pick exactly one dominant emotion from the fixed taxonomy.
Stage 2: pick exactly one sub-emotion, constrained to that dominant
emotion's allowed list — the model literally cannot combine two dominant
emotions unless you explicitly allow it.

Both stages use JSON mode; stage 2's prompt embeds only the allowed
sub-emotion list for the stage-1 result, which is the actual constraint
mechanism here (Ollama's format=json guarantees valid JSON, not which
labels are in it — the allowed-list-in-prompt is what keeps it in bounds).

Calibration note: an early test run on ReZero showed this agent
systematically reaching for the most dramatic sub-emotion available
(Shock, Shock, Regret) and inflating intensity by 15-20 points versus
what the Director settled on after reading the same text — not random
noise, a consistent bias toward drama. Stage 2's prompt below was
rewritten with explicit anchors to correct for that; if you swap in a
different local model or a substantially different taxonomy, it's worth
re-checking director_log.jsonl for the agreement rate again.
"""

import ollama_client
import taxonomy

STAGE1_SYSTEM = """You are an Emotion Agent classifying the dominant emotion of a
scene from a novel, for the purpose of driving background music selection.

You must pick exactly ONE dominant emotion from this fixed list, nothing else:
{emotions}

Respond with ONLY JSON of this shape:
{{"dominant_emotion": "<one of the list above>", "confidence": <0.0-1.0>}}
"""

STAGE2_SYSTEM = """You are an Emotion Agent picking the specific sub-emotion within
a scene from a novel. The dominant emotion has already been decided as
"{dominant}". You must pick exactly ONE sub-emotion from this fixed list,
nothing outside it:
{sub_emotions}

Also estimate intensity (0-100, how strongly this emotion registers in the scene).

CALIBRATION — read this carefully, it corrects a known bias in this task:
past runs show a tendency to over-dramatize both fields. Correct for that
deliberately:

Sub-emotion: reserve the most intense-sounding label in the list (e.g. terms
like Shock, Panic, Dread, Rage) for scenes with unambiguous, strong textual
evidence — actual violence, a genuine surprise attack, explicit panic
described in the prose. If the scene is really about a character processing,
puzzling over, or adjusting to something — even something momentous — prefer
the calmer, more specific label (e.g. Confusion instead of Shock, Anxiety
instead of Dread, Acceptance instead of Regret) unless the text clearly says
otherwise. When genuinely unsure between a dramatic option and a measured
one, default to the measured one.

Intensity: use this as a rubric, not a free guess:
  0-20   barely present, a passing note in the scene
  20-40  mild — noticeable, but the character is composed
  40-60  clear and central to the scene, but the character is still in control
  60-80  strong — hard for the character to hide or ignore
  80-100 overwhelming and reflexive — the character has lost control of their reaction

Most ordinary dramatic scenes land in the 40-70 range. Reserve 80+ for
moments of genuine crisis — real physical danger, devastating loss,
violence — not everyday tension, curiosity, or a character being startled.

Respond with ONLY JSON of this shape:
{{"sub_emotion": "<one of the list above>", "intensity": <0-100>}}
"""

USER_PROMPT_TEMPLATE = """Scene summary (facts only, no emotion labels):
{scene_summary}

Scene text:
{chunk_text}

Recent context:
{context}
"""


def _format_context(context: dict) -> str:
    lines = []
    if context.get("recent_scene_summaries"):
        lines.append("Recent scenes: " + " | ".join(context["recent_scene_summaries"]))
    if context.get("characters_present"):
        for name, facts in context["characters_present"].items():
            lines.append(f"{name}: " + "; ".join(facts))
    if context.get("relevant_relationships"):
        for key, facts in context["relevant_relationships"].items():
            lines.append(f"{key.replace('|', ' & ')}: " + "; ".join(facts))
    return "\n".join(lines) if lines else "(no prior context)"


def classify_emotion(chunk_text: str, scene_summary: str, context: dict,
                      model: str = None) -> dict:
    user_prompt = USER_PROMPT_TEMPLATE.format(
        scene_summary=scene_summary or "(none)",
        chunk_text=chunk_text,
        context=_format_context(context),
    )

    # Stage 1: dominant emotion
    stage1_system = STAGE1_SYSTEM.format(emotions=", ".join(taxonomy.DOMINANT_EMOTIONS))
    stage1 = ollama_client.generate_json(
        prompt=user_prompt, system=stage1_system, model=model, temperature=0.2
    )
    dominant = stage1.get("dominant_emotion", "Neutral")
    if dominant not in taxonomy.DOMINANT_EMOTIONS:
        dominant = "Neutral"  # guardrail against a stray label sneaking through
    confidence = float(stage1.get("confidence", 0.5))

    # Stage 2: sub-emotion + intensity, constrained to the chosen dominant emotion
    allowed_subs = taxonomy.sub_emotions_for(dominant)
    stage2_system = STAGE2_SYSTEM.format(
        dominant=dominant, sub_emotions=", ".join(allowed_subs)
    )
    stage2 = ollama_client.generate_json(
        prompt=user_prompt, system=stage2_system, model=model, temperature=0.2
    )
    sub_emotion = stage2.get("sub_emotion", allowed_subs[0] if allowed_subs else "Calm")
    if sub_emotion not in allowed_subs:
        sub_emotion = allowed_subs[0] if allowed_subs else "Calm"
    intensity = int(stage2.get("intensity", 50))
    intensity = max(0, min(100, intensity))

    return {
        "dominant_emotion": dominant,
        "sub_emotion": sub_emotion,
        "intensity": intensity,
        "confidence": confidence,
    }