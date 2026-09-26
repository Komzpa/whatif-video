"""Display token -> pronunciation spelling used for CTC alignment.

Each display token (lyric line split on spaces) maps to one or more
pronunciation sub-words made of plain letters (and internal apostrophes).

pdoom's version of this file had a PRON/ALT dict of manual spellings for
acronyms and odd words (AGI, P(doom), NVDA, ChatGPT, ...). "What if"'s lyrics
have none of those (no acronyms, no parenthesised words), so the dicts are
gone and every token falls through to the generic rule below.
"""
import re


def pron(token: str) -> list[str]:
    w = token.lower()
    w = w.replace("’", "'")
    w = re.sub(r"[^a-z' ]", " ", w)
    w = w.strip("' ")
    return [p.strip("'") for p in w.split() if p.strip("'")]


if __name__ == "__main__":
    import common
    for _, _, t in common.load_lyrics_src():
        print(t, "->", " | ".join(" ".join(pron(w)) for w in t.split(" ")))
