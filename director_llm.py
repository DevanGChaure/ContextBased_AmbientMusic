"""
Routes the Director's LLM calls to whichever cloud provider is configured
(config.DIRECTOR_PROVIDER = "gemini" or "groq"), so director.py doesn't need
to know or care which one is active.
"""

import config
import gemini_client
import groq_client


def generate_json(prompt: str, system: str = "", model: str = None,
                   temperature: float = 0.3) -> dict:
    if config.DIRECTOR_PROVIDER == "groq":
        return groq_client.generate_json(
            prompt=prompt, system=system,
            model=model or config.DEFAULT_GROQ_MODEL,
            temperature=temperature,
        )
    else:
        return gemini_client.generate_json(
            prompt=prompt, system=system,
            model=model or config.DEFAULT_GEMINI_MODEL,
            temperature=temperature,
        )
