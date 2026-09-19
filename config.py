"""
Central config. Edit these values before running.
"""

import os

# Load variables from a .env file in this directory, if one exists.
# Real environment variables (export / $env:) still take priority over
# anything in .env, so this never silently overrides something you set
# deliberately in your shell.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed — .env just won't be read; env vars still work

# --- Ollama (local) ---
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "qwen3:8b"   # must already be pulled: `ollama pull qwen3:8b`
OLLAMA_TIMEOUT_SECONDS = 1000   # 5 min — local inference on CPU can be slow

# --- Gemini (cloud, director option A) ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# --- Groq (cloud, director option B) ---
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"

# --- Which provider the Director uses. "gemini" or "groq". ---
DIRECTOR_PROVIDER = os.environ.get("DIRECTOR_PROVIDER", "gemini")

# --- Chunking ---
DEFAULT_MAX_CHUNK_WORDS = 600     # soft cap; chunker still won't split mid-paragraph
MIN_CHUNK_WORDS = 120             # avoid absurdly tiny chunks from short scenes

# --- Retrieval ---
SCENE_HISTORY_WINDOW = 3          # how many recent scene summaries to feed back in
# Durable facts (appearance, backstory, personality, permanent relationships)
# rarely go stale, so they get a generous cap. Transient facts (what just
# happened, current mood/situation) are only useful near-term, so they're
# capped low and aged out aggressively rather than crowding out traits.
MAX_CHARACTER_TRAITS = 15
MAX_CHARACTER_EVENTS = 5

# --- Continuity filter (Step 7) ---
MIN_CHUNKS_BEFORE_SWITCH = 2      # need N consecutive chunks agreeing before a
                                   # non-director fallback would switch (director
                                   # can still override this via its own judgement)
CONFIDENCE_SWITCH_THRESHOLD = 0.75

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
NOVELS_DIR = os.path.join(BASE_DIR, "novels")
CACHE_DIR = os.path.join(BASE_DIR, "cache")


def book_cache_dir(book_id: str) -> str:
    return os.path.join(CACHE_DIR, book_id)
