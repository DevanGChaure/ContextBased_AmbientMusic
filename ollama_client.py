"""
Thin wrapper around a local Ollama server.

Uses Ollama's `format: "json"` option to force valid JSON output rather than
hoping the model behaves. Also sets `keep_alive` so the model stays loaded
in memory between the several back-to-back calls each chunk makes (memory
agent, then two emotion-agent stages) — without it, Ollama can unload the
model between calls and eat the timeout budget just reloading it.
"""

import json
import requests

import config


class OllamaError(RuntimeError):
    pass


# Small local models (esp. at low temperature, which extraction tasks use
# to stay factual) can fall into a degenerate repetition loop — the same
# sentence over and over — with nothing to stop them. Left unbounded, the
# response either grows huge or gets cut off mid-JSON-string by Ollama's
# own context limit, producing an unparseable result. repeat_penalty +
# repeat_last_n discourage the loop from starting; num_predict is a hard
# ceiling so a loop that starts anyway fails fast and cheap instead of
# burning the full timeout budget generating garbage.
DEFAULT_OPTIONS = {
    "repeat_penalty": 1.3,
    "repeat_last_n": 256,
    "num_predict": 1024,
}


def _looks_repetitive(text: str, min_repeats: int = 6) -> bool:
    """Cheap heuristic: same ~10+ word chunk repeated back-to-back many
    times. Catches the degenerate-loop case before we even try to parse,
    so the retry below doesn't waste time on a response that's obviously
    junk regardless of JSON validity."""
    words = text.split()
    if len(words) < 30:
        return False
    chunk = " ".join(words[-12:])
    return text.count(chunk) >= min_repeats


def generate_json(prompt: str, system: str = "", model: str = None,
                   temperature: float = 0.2, timeout: int = None,
                   max_retries: int = 2) -> dict:
    model = model or config.DEFAULT_OLLAMA_MODEL
    timeout = timeout or config.OLLAMA_TIMEOUT_SECONDS

    last_error = None
    for attempt in range(max_retries + 1):
        payload = {
            "model": model,
            "prompt": prompt,
            "system": system,
            "format": "json",
            "stream": False,
            "keep_alive": "30m",  # keep the model resident between calls
            "options": {"temperature": temperature, **DEFAULT_OPTIONS},
        }

        try:
            resp = requests.post(
                f"{config.OLLAMA_BASE_URL}/api/generate",
                json=payload,
                timeout=timeout,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            raise OllamaError(
                f"Could not reach Ollama at {config.OLLAMA_BASE_URL} "
                f"(is `ollama serve` running, and is `{model}` pulled?): {e}\n"
                f"If this was a timeout, the model may be slow to respond on your "
                f"hardware — check Task Manager / nvidia-smi to confirm Ollama is "
                f"using your GPU rather than CPU, or try a smaller model."
            ) from e

        data = resp.json()
        raw_text = data.get("response", "")

        if _looks_repetitive(raw_text):
            last_error = "model output degenerated into a repetition loop"
            if attempt < max_retries:
                print(f"  [ollama_client] repetition loop detected, retrying "
                      f"({attempt + 1}/{max_retries})...")
                continue
            raise OllamaError(
                f"Ollama fell into a repetition loop after {max_retries} retries "
                f"and never produced usable output. Raw output (truncated):\n"
                f"{raw_text[:500]}...\n"
                f"Consider lowering temperature further or checking whether "
                f"`{model}` is a good fit for this prompt length."
            )

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError as e:
            last_error = e
            if attempt < max_retries:
                print(f"  [ollama_client] non-JSON output, retrying "
                      f"({attempt + 1}/{max_retries})... ({e})")
                continue
            raise OllamaError(
                f"Ollama returned non-JSON despite format=json after "
                f"{max_retries} retries.\nRaw output was:\n{raw_text}\nError: {e}"
            ) from e

    raise OllamaError(f"generate_json failed after {max_retries} retries: {last_error}")