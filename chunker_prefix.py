"""
Scene-aware chunking (Step 1).

Rules, in priority order:
1. Never split in the middle of a paragraph.
2. Always start a new chunk at a chapter heading.
3. Prefer to start a new chunk at an explicit scene-break marker
   (***, ---, ###, a lone "*", etc.) if the current chunk already has a
   reasonable amount of content.
4. Otherwise accumulate paragraphs until the soft word cap is hit, then
   close the chunk at the next paragraph boundary.

This is a heuristic, not a semantic scene detector — it's deliberately kept
dependency-free and fast so it can run over a whole novel in under a second.
If you want true semantic scene boundaries later, swap this module for an
LLM call, but keep the same return shape.
"""

import re
from dataclasses import dataclass

import config

CHAPTER_RE = re.compile(r"^\s*(chapter|arc|part)\s+\w+", re.IGNORECASE)
SCENE_BREAK_RE = re.compile(r"^\s*([*\-#◆~※]{1,}|\.{3,})\s*$")

@dataclass
class Chunk:
    index: int
    text: str
    is_new_chapter: bool
    word_count: int


def _split_paragraphs(raw_text: str):
    # Split on blank lines; keep paragraph text trimmed but intact.
    paras = re.split(r"\n\s*\n", raw_text.strip())
    return [p.strip() for p in paras if p.strip()]


def chunk_novel(raw_text: str, max_chunk_words: int = None):
    max_chunk_words = max_chunk_words or config.DEFAULT_MAX_CHUNK_WORDS
    paragraphs = _split_paragraphs(raw_text)

    chunks = []
    current_paras = []
    current_words = 0
    current_is_new_chapter = False

    def flush(force=False):
        nonlocal current_paras, current_words, current_is_new_chapter
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
        ))
        current_paras = []
        current_words = 0
        current_is_new_chapter = False

    for para in paragraphs:
        is_chapter_heading = bool(CHAPTER_RE.match(para))
        is_scene_break = bool(SCENE_BREAK_RE.match(para))

        if is_chapter_heading and current_paras:
            flush(force=True)

        if is_scene_break:
            if current_words >= config.MIN_CHUNK_WORDS:
                flush(force=True)
            continue  # don't include the marker line itself in chunk text

        para_words = len(para.split())

        if is_chapter_heading:
            current_is_new_chapter = True

        current_paras.append(para)
        current_words += para_words

        if current_words >= max_chunk_words:
            flush(force=True)

    flush(force=True)  # trailing content, even if under MIN_CHUNK_WORDS

    return chunks
