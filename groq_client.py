"""
Thin wrapper around the Groq API (OpenAI-compatible chat completions).

Requires GROQ_API_KEY to be set in the environment (see config.py).
"""

import json

import config
import http_retry


class GroqError(RuntimeError):
    pass


def generate_json(prompt: str, system: str = "", model: str = None,
                   temperature: float = 0.3, timeout: int = 60) -> dict:
    if not config.GROQ_API_KEY:
        raise GroqError(
            "GROQ_API_KEY is not set. Run: export GROQ_API_KEY='your-key'"
        )

    model = model or config.DEFAULT_GROQ_MODEL
    headers = {
        "Authorization": f"Bearer {config.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    try:
        resp = http_retry.post_with_retry(
            config.GROQ_BASE_URL, headers=headers, json_payload=payload, timeout=timeout
        )
    except http_retry.RateLimitExceeded as e:
        raise GroqError(str(e)) from e

    data = resp.json()
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise GroqError(f"Unexpected Groq response shape: {data}") from e

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise GroqError(
            f"Groq returned non-JSON despite response_format=json_object.\n"
            f"Raw output was:\n{text}\nError: {e}"
        ) from e