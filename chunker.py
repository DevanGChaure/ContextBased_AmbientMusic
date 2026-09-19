"""
Scene-aware chunking (Step 1).

Rules, in priority order:
1. Never split in the middle of a paragraph.
2. Always start a new chunk at a chapter heading.
3. Prefer to start a new chunk at an explicit scene-break marker
   (***, ---, ###, * * *, a lone "*", etc.) if the current chunk already
   has a reasonable amount of content.
4. Otherwise accumulate paragraphs until the soft word cap is hit, then
   close the chunk at the next paragraph boundary.

This is a heuristic, not a semantic scene detector — it's deliberately kept
dependency-free and fast so it can run over a whole novel in under a second.
It's designed to feed a Step 2 LLM semantic pass: each Chunk exposes
`break_reason` (why this boundary was cut) and `paragraph_word_counts`
(internal paragraph offsets), so an LLM classifier can later re-split any
oversized "word_cap" chunk at a real paragraph boundary without needing to
touch this module's logic.
"""

import re
from dataclasses import dataclass, field

import config

CHAPTER_RE = re.compile(r"^\s*(chapter|arc|part)\s+\w+", re.IGNORECASE)

# Matches scene-break marker lines, including spaced variants like "* * *"
# or "- - -", not just contiguous runs like "***" or "---".
SCENE_BREAK_RE = re.compile(
    r"^\s*(?:[*\-#◆~※.]\s*){1,}$"
)


@dataclass
class Chunk:
    index: int
    text: str
    is_new_chapter: bool
    word_count: int
    break_reason: str = "end_of_text"  # "chapter" | "scene_marker" | "word_cap" | "end_of_text"
    paragraph_word_counts: list = field(default_factory=list)


def _split_paragraphs(raw_text: str):
    # Split on blank lines; keep paragraph text trimmed but intact.
    paras = re.split(r"\n\s*\n", raw_text.strip())
    return [p.strip() for p in paras if p.strip()]


def chunk_novel(raw_text: str, max_chunk_words: int = None):
    max_chunk_words = max_chunk_words or config.DEFAULT_MAX_CHUNK_WORDS
    paragraphs = _split_paragraphs(raw_text)

    chunks = []
    current_paras = []
    current_para_words = []
    current_words = 0
    current_is_new_chapter = False
    pending_scene_break = False  # a marker was seen but chunk was too small to close yet

    def flush(reason, force=False):
        nonlocal current_paras, current_para_words, current_words
        nonlocal current_is_new_chapter, pending_scene_break
        if not current_paras:
            return
        if not force and current_words < config.MIN_CHUNK_WORDS:
            return  # too small to stand alone yet, keep accumulating
        text = "\n\n".join(current_paras)
        chunks.append(Chunk(
            index=len(chunks),
            text=text,
            is_new_chapter=current_is_new_chapter,
            word_count=current_words,
            break_reason=reason,
            paragraph_word_counts=list(current_para_words),
        ))
        current_paras = []
        current_para_words = []
        current_words = 0
        current_is_new_chapter = False
        pending_scene_break = False

    for para in paragraphs:
        is_chapter_heading = bool(CHAPTER_RE.match(para))
        is_scene_break = bool(SCENE_BREAK_RE.match(para))

        if is_chapter_heading and current_paras:
            flush(reason="chapter", force=True)

        if is_scene_break:
            # Defer rather than drop: apply as soon as the chunk is big
            # enough to stand alone, instead of losing the boundary if the
            # chunk is currently under MIN_CHUNK_WORDS.
            if current_words >= config.MIN_CHUNK_WORDS:
                flush(reason="scene_marker", force=True)
            else:
                pending_scene_break = True
            continue  # don't include the marker line itself in chunk text

        # A deferred marker becomes applicable once we cross the minimum,
        # but only at the next paragraph boundary (rule 1: never split
        # mid-paragraph), so we check it here, before appending the new para.
        if pending_scene_break and current_words >= config.MIN_CHUNK_WORDS:
            flush(reason="scene_marker", force=True)

        para_words = len(para.split())

        if is_chapter_heading:
            current_is_new_chapter = True

        current_paras.append(para)
        current_para_words.append(para_words)
        current_words += para_words

        if current_words >= max_chunk_words:
            flush(reason="word_cap", force=True)

    flush(reason="end_of_text", force=True)  # trailing content, even if under MIN_CHUNK_WORDS

    return chunks