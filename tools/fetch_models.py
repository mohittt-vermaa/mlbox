#!/usr/bin/env python3
"""Download the upstream tokenizer files used to build data/tok/*.json.

Nothing here is redistributed by mlbox: run this script yourself, then run
tools/build_tokenizers.py to generate the compact browser bundles.

    python3 tools/fetch_models.py
    python3 tools/build_tokenizers.py
"""
from __future__ import annotations

import pathlib
import sys
import urllib.request

RAW = pathlib.Path(__file__).resolve().parent / "raw"

TIKTOKEN_FILES = {
    "cl100k_base": "https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken",
    "o200k_base": "https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken",
}

HF_TOKENIZERS = {
    "llama3": "https://huggingface.co/NousResearch/Meta-Llama-3.1-8B/resolve/main/tokenizer.json",
    "qwen25": "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/resolve/main/tokenizer.json",
    "mistral": "https://huggingface.co/mistralai/Mistral-7B-v0.1/resolve/main/tokenizer.json",
    "deepseek": "https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json",
    "gemma3": "https://huggingface.co/unsloth/gemma-3-4b-it/resolve/main/tokenizer.json",
}


def get(url: str, dest: pathlib.Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  = {dest.name} ({dest.stat().st_size:,} bytes, cached)")
        return
    print(f"  ↓ {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "mlbox/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    print(f"  ✓ {dest.name} ({dest.stat().st_size:,} bytes)")


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    print("tiktoken vocab files:")
    for name, url in TIKTOKEN_FILES.items():
        get(url, RAW / f"{name}.tiktoken")
    print("Hugging Face tokenizer.json files:")
    for name, url in HF_TOKENIZERS.items():
        get(url, RAW / f"{name}.tokenizer.json")
    print("\nDone. Next: python3 tools/build_tokenizers.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
