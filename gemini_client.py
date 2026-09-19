"""
Thin wrapper around the Gemini REST API. Used only by the Director agent
(the piece that decides "should the soundtrack actually change?").

Requires GEMINI_API_KEY to be set in the environment (see config.py).
"""

import json
import requests

import config


class GeminiError(RuntimeError):
    pass


def generate_json(prompt: str, system: str = "", model: str = None,
                   temperature: float = 0.3, timeout: int = 60) -> dict:
    if not config.GEMINI_API_KEY:
        raise GeminiError(
            "GEMINI_API_KEY is not set. Run: export GEMINI_API_KEY='your-key'"
        )

    model = model or config.DEFAULT_GEMINI_MODEL
    url = f"{config.GEMINI_BASE_URL}/{model}:generateContent?key={config.GEMINI_API_KEY}"

    full_prompt = f"{system}\n\n{prompt}" if system else prompt

    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        resp.raise_for_status()
    except requests.RequestException as e:
        raise GeminiError(f"Gemini API call failed: {e}") from e

    data = resp.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise GeminiError(f"Unexpected Gemini response shape: {data}") from e

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise GeminiError(
            f"Gemini returned non-JSON despite responseMimeType=json.\n"
            f"Raw output was:\n{text}\nError: {e}"
        ) from e
