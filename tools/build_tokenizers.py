#!/usr/bin/env python3
"""Build the compact, browser-loadable tokenizer bundles in data/tok/.

Input : tools/raw/*.tiktoken  and  tools/raw/*.tokenizer.json  (see fetch_models.py)
Output: data/tok/<id>.json     +   data/models.json  (manifest used by the UI)

The output format is deliberately dumb so the browser side needs zero deps:

    {
      "id": "llama3",
      "kind": "bytelevel" | "tiktoken" | "metaspace",
      "normalizer": "nfc" | null,
      "patterns": ["<js regex source>", ...],   // applied left-to-right, "Isolated"
      "vocab":  ["tok0", "tok1", ...],          // index == token id (rank order for tiktoken)
      "merges": "a b\\nc d\\n...",                 // merge priority order (HF models only)
      "byteFallback": false,
      "unkId": null
    }
"""
from __future__ import annotations

import base64
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
OUT = ROOT / "data" / "tok"

# ---------------------------------------------------------------------------
# tiktoken patterns, hand-translated to JavaScript (ES2018 unicode) syntax.
#
#   (?i:X)  -> explicit character classes (JS has no inline flags pre-ES2025)
#   X++ *+ {n,m}+ ?+  -> greedy quantifiers (JS has no possessive quantifiers)
#
# Both rewrites are verified against the upstream Rust patterns by
# tools/verify_tokenizers.py on a large generated corpus.
# ---------------------------------------------------------------------------
CONTRACTIONS_CL100K = r"'(?:[sdmtSDMT]|[lL][lL]|[vV][eE]|[rR][eE])"
CONTRACTIONS_O200K = r"(?:'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD])?"

JS_PATTERNS = {
    "cl100k": [
        CONTRACTIONS_CL100K
        + r"|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s+$|\s*[\r\n]|\s+(?!\S)|\s"
    ],
    "o200k": [
        r"[^\r\n\p{L}\p{N}]?[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{M}]*[\p{Ll}\p{Lm}\p{Lo}\p{M}]+"
        + CONTRACTIONS_O200K
        + r"|[^\r\n\p{L}\p{N}]?[\p{Lu}\p{Lt}\p{Lm}\p{Lo}\p{M}]+[\p{Ll}\p{Lm}\p{Lo}\p{M}]*"
        + CONTRACTIONS_O200K
        + r"|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n/]*|\s*[\r\n]+|\s+(?!\S)|\s+"
    ],
    # --- Hugging Face tokenizers: patterns copied verbatim from tokenizer.json ---
    "llama3": [
        CONTRACTIONS_CL100K
        + r"|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+"
    ],
    "qwen25": [
        CONTRACTIONS_CL100K
        + r"|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+"
    ],
    "deepseek": [
        r"\p{N}{1,3}",
        "[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff]+",
        "[!\"#$%&'()*+,\\-./:;<=>?@\\[\\\\\\]^_`{|}~][A-Za-z]+"
        r"|[^\r\n\p{L}\p{P}\p{S}]?[\p{L}\p{M}]+| ?[\p{P}\p{S}]+[\r\n]*|\s*[\r\n]+|\s+(?!\S)|\s+",
    ],
}

MODELS = [
    # id, kind, source file, display name, org, family note
    ("cl100k", "tiktoken", "cl100k_base.tiktoken", "GPT-3.5 / GPT-4 (cl100k_base)", "OpenAI", "100,277 vocab · the classic ChatGPT tokenizer"),
    ("o200k", "tiktoken", "o200k_base.tiktoken", "GPT-4o / GPT-4.1 / GPT-5 (o200k_base)", "OpenAI", "200,019 vocab · much better at non-English"),
    ("llama3", "bytelevel", "llama3.tokenizer.json", "Llama 3.1 / 3.3", "Meta", "128,256 vocab · byte-level BPE"),
    ("qwen25", "bytelevel", "qwen25.tokenizer.json", "Qwen2.5 / Qwen3", "Alibaba", "151,665 vocab · strong on Chinese + Hindi"),
    ("deepseek", "bytelevel", "deepseek.tokenizer.json", "DeepSeek V3 / R1", "DeepSeek", "129,280 vocab · digit-splitting pre-tokenizer"),
    ("gemma3", "metaspace", "gemma3.tokenizer.json", "Gemma 3 / Gemini 2.x", "Google", "262,144 vocab · SentencePiece-style, byte fallback"),
    ("mistral", "metaspace", "mistral.tokenizer.json", "Mistral 7B / Ministral", "Mistral AI", "32,768 vocab · small, byte fallback"),
]


def byte_to_unicode() -> dict[int, int]:
    """GPT-2's reversible byte -> printable-unicode map."""
    bs = list(range(0x21, 0x7F)) + list(range(0xA1, 0xAD)) + list(range(0xAE, 0x100))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return dict(zip(bs, cs))


B2U = byte_to_unicode()


def load_tiktoken(path: pathlib.Path) -> list[str]:
    """`.tiktoken` files store *raw UTF-8 bytes* per token. We remap them into
    GPT-2's byte-level char space so every model shares one representation."""
    ranks: list[tuple[int, bytes]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            b64, rank = line.split()
            ranks.append((int(rank), base64.b64decode(b64)))
    ranks.sort()
    assert [r for r, _ in ranks] == list(range(len(ranks))), "ranks are not contiguous"
    return ["".join(chr(B2U[b]) for b in tok) for _, tok in ranks]


def load_hf(path: pathlib.Path) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    model = d["model"]
    assert model["type"] == "BPE", model["type"]

    vocab = model["vocab"]
    ordered = sorted(vocab.items(), key=lambda kv: kv[1])
    ids = [i for _, i in ordered]
    assert ids == list(range(len(ids))), "vocab ids are not contiguous"
    vocab_list = [tok for tok, _ in ordered]

    merges: list[int] = []
    missing = 0
    for m in model["merges"]:
        pair = m if isinstance(m, list) else m.split(" ")
        assert len(pair) == 2, pair
        a, b = pair
        # SentencePiece-family vocabs contain literal spaces/newlines inside
        # tokens, so merges are stored as *id pairs* rather than text.
        ia, ib = vocab.get(a), vocab.get(b)
        if ia is None or ib is None:
            missing += 1
            continue
        merges.extend((ia, ib))

    unk = model.get("unk_token")
    unk_id = vocab.get(unk) if unk else None

    return {
        "vocab": vocab_list,
        "merges": merges,
        "missingMergeOperands": missing,
        "byteFallback": bool(model.get("byte_fallback")),
        "unkId": unk_id,
    }


def main() -> None:
    global raw_added
    raw_added = {}
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    total = 0
    for mid, kind, src, label, org, note in MODELS:
        path = RAW / src
        if kind != "tiktoken":
            raw_added[src] = json.loads(path.read_text(encoding="utf-8")).get("added_tokens", [])
        if kind == "tiktoken":
            vocab = load_tiktoken(path)
            payload = {
                "id": mid,
                "kind": kind,
                "normalizer": None,
                "patterns": JS_PATTERNS[mid],
                "vocab": vocab,
                "merges": [],
                "byteFallback": False,
                "unkId": None,
            }
        else:
            hf = load_hf(path)
            payload_added = [
                {"id": a["id"], "content": a["content"], "special": bool(a.get("special"))}
                for a in raw_added.get(src, [])
                if isinstance(a.get("content"), str) and a["content"]
            ]
            normalizer = "nfc" if mid == "qwen25" else None
            if mid == "gemma3":
                normalizer = "space-to-underscore"
            payload = {
                "id": mid,
                "kind": kind,
                "normalizer": normalizer,
                "patterns": JS_PATTERNS.get(mid, []),
                "vocab": hf["vocab"],
                "merges": hf["merges"],
                "byteFallback": hf["byteFallback"],
                "unkId": hf["unkId"],
                "addedTokens": payload_added,
            }

        dest = OUT / f"{mid}.json"
        dest.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        size = dest.stat().st_size
        total += size
        manifest.append({
            "id": mid,
            "label": label,
            "org": org,
            "note": note,
            "kind": kind,
            "vocab": len(payload["vocab"]),
            "file": f"data/tok/{mid}.json",
            "bytes": size,
        })
        extra = f" (dropped {hf['missingMergeOperands']} merges)" if kind != "tiktoken" and hf.get("missingMergeOperands") else ""
        print(f"  ✓ {mid:9s} vocab={len(payload['vocab']):7,d} merges={len(payload['merges'])//2:7,d} -> {size/1e6:.2f} MB{extra}")

    manifest.sort(key=lambda m: -m["vocab"])
    (ROOT / "data" / "models.json").write_text(
        json.dumps({"generated": __import__("datetime").date.today().isoformat(), "models": manifest}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\n  total tokenizer payload: {total/1e6:.2f} MB across {len(manifest)} models")


if __name__ == "__main__":
    main()
