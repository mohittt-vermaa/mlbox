#!/usr/bin/env python3
"""Generate the corpus + ground-truth token ids used by `npm test`.

Ground truth comes from the *upstream Rust* implementations:
    tiktoken   (OpenAI)   -> cl100k, o200k
    tokenizers (HF, Rust) -> llama3, qwen25, deepseek, gemma3, mistral

Output:
    tests/testdata/corpus.json          the input strings (shared with the JS test)
    tests/testdata/refs/<model>.json    per-string {count, hash} of the id sequence
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import random
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
OUTD = ROOT / "tests" / "testdata"

MOD = (1 << 31) - 1


def seq_hash(ids) -> int:
    h = 0
    for i in ids:
        h = (h * 1000003 + int(i)) % MOD
    return h


# ---------------------------------------------------------------------------
# corpus
# ---------------------------------------------------------------------------
FIXED = [
    "", " ", "  ", "   \t", "\n", "\n\n", "\r\n", "\r", "\t", "a", "A", "0", "1234567890",
    "Hello, world!", "hello world", "Hello World", "The quick brown fox jumps over the lazy dog.",
    "it's", "don't", "I'm", "I've", "we'll", "they're", "'s", "'t", "'re", "'ve", "'m", "'ll", "'d",
    "It's a test.", "DON'T DO THAT", "co-op", "e-mail", "foo_bar", "foo-bar", "foo.bar", "a/b",
    "http://example.com/path?q=1&x=2#frag", "user@example.com", "C:\\Users\\test\\file.txt",
    "  leading and trailing  ", "multiple    spaces", "tab\there", "new\nline", "a\n\n\nb",
    "1,000,000", "$3.50", "3.14159", "1e10", "-42", "+7", "0x1F600", "50%", "100°C",
    "π≈3.14159", "∑x²", "∀x∈ℝ", "2×3=6", "≤≥≠", "±5", "…", "—", "–", "“quotes”", "‘single’",
    # Indic — the whole point of the tool
    "नमस्ते दुनिया", "भारत एक विशाल देश है।", "मशीन लर्निंग क्या है?", "आप कैसे हैं?",
    "हिन्दी में टोकनाइज़ेशन महंगा है", "संस्कृतम्", "১২৩", "বাংলা ভাষা", "தமிழ் மொழி",
    "తెలుగు భాష", "ಕನ್ನಡ ಭಾಷೆ", "മലയാളം", "ગુજરાતી", "ਪੰਜਾਬੀ", "ଓଡ଼ିଆ",
    # other scripts
    "中文分词测试", "中文 分词 测试", "日本語のトークン化", "カタカナ", "한국어 토크나이저",
    "العربية لغة جميلة", "שלום עולם", "สวัสดีชาวโลก", "Привет мир", "Ελληνικά", "ქართული",
    "Հայերեն", "አማርኛ", "🇮🇳🇯🇵",
    # emoji / astral
    "😀😃😄😁", "👨‍👩‍👧‍👦 family", "🏳️‍🌈", "𝕳𝖊𝖑𝖑𝖔", "𝄞 music", "𝔘𝔫𝔦𝔠𝔬𝔡𝔢", "𓀀𓀁", "❤️", "🔥💯",
    "🇺🇸", "🈵", "㊗️",
    # combining marks / normalisation traps
    "e\u0301cole", "\u00e9cole", "a\u0301\u0302", "\u1e9b\u0323", "한\u1100\u1161",
    "\u200bzero-width\u200b", "\u2028line-sep\u2029para-sep", "\ufeffBOM", "\u0085NEL", "\u00a0nbsp\u00a0",
    "\u202fnnb\u202f", "\u3000ideographic-space", "\u061cALM", "\u200fRLM", "\u200eLRM",
    "\u202dLRO", "\u2066LRI", "\u034f combining grapheme joiner",
    # code
    "def hello(name):\n    print(f'hi {name}')\n",
    "const x = arr.map(v => v * 2).filter(Boolean);",
    "fn main() { println!(\"hi\"); }",
    "SELECT * FROM users WHERE id = 1;",
    '{"key": "value", "n": 42, "b": true}',
    "# Heading\n\n- item 1\n- item 2\n\n```py\nx = 1\n```",
    "<div class=\"a\">text</div>",
    "\\frac{a}{b} + \\sum_{i=0}^{n} x_i",
    "| a | b |\n|---|---|\n| 1 | 2 |",
    # pathological
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "!!!!!!!!!", "?????", "....", "-----", "=====",
    "aaaa bbbb cccc", "a a a a a a a a", "ab ab ab ab", "\u2581\u2581\u2581", "▁hello▁world",
    "aaaaaa\nbbbbbb\ncccccc", "\u0000\u0001\u0002", "\x7f", "\u00ff\u0100", "😀a😀",
    "\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n",
    "  \n\t  \n\t  ", "a" * 100, "abc " * 30, "1" * 50, "x" * 200,
    "The rain in Spain falls mainly on the plain. " * 3,
    "नमस्ते " * 20, "中文" * 20, "😀" * 20, "ab " * 40,
]

# special / added tokens: HF matches these literally, tiktoken (with
# disallowed_special=()) does not — both behaviours are asserted below
SPECIAL = [
    "<|begin_of_text|>", "<|end_of_text|>", "text<|end_of_text|>more",
    "<|fim_prefix|><|fim_middle|><|fim_suffix|>", "<|im_start|>system<|im_end|>",
    "<｜begin▁of▁sentence｜>", "<s>", "</s>", "<unk>", "a<s>b</s>c",
    "<start_of_turn>user<end_of_turn>", "[multimodal]", "<mask>",
    "<div></div>", "<unused7>", "<|eot_id|>", "<|start_header_id|>assistant<|end_header_id|>",
    "<s>abc", "a<s>", "<s><s>", "x</s>", "<unk>a", "abc<s>", "<s>", "</s>",
    "  <s>  ", "\u2581<s>\u2581", "a</div>b", "<div>hi</div>", "no tags here",
]

PROSE = [
    "Machine learning models don't see words — they see tokens. A tokenizer decides how your text "
    "gets chopped up, and that decision quietly determines your bill, your context window, and how "
    "well your model handles the language you actually care about.",
    "भारत में मशीन लर्निंग का विकास तेज़ी से हो रहा है। कई छात्र अब घर बैठे ही मॉडल प्रशिक्षित करना "
    "सीख रहे हैं, बिना महँगे GPU के। यह टूल उन्हीं छात्रों के लिए बना है।",
    "বাংলা, தமிழ், తెలుగు ಮತ್ತು ಕನ್ನಡ ಭಾಷೆಗಳಲ್ಲಿ ಟೋಕನೈಸೇಶನ್ ಬಹಳ ದುಬಾರಿಯಾಗಿದೆ.",
    "Large language models are trained on next-token prediction. The tokenizer is the first layer of "
    "the stack and the one nobody talks about, yet it changes everything downstream: throughput, "
    "cost, multilingual quality, even prompt-injection surface.",
    "def train(model, loader, epochs=3, lr=1e-4):\n    opt = torch.optim.AdamW(model.parameters(), lr=lr)\n"
    "    for e in range(epochs):\n        for x, y in loader:\n            loss = model(x, y)\n"
    "            loss.backward(); opt.step(); opt.zero_grad()\n",
    "中文分词对大语言模型来说至关重要。不同的分词器会显著影响 token 数量、推理成本以及模型对中文的理解能力。",
    "日本語のトークナイザーは英語とは大きく異なります。ひらがな、カタカナ、漢字が混在する文章では、"
    "トークン数が大幅に増えることがあります。",
    "العربية لغة جميلة ومعقدة، وتحتاج إلى أدوات تقطيع نصوص متقدمة للتعامل معها بشكل صحيح في نماذج اللغة.",
    "Grokking is the phenomenon where a network memorises the training set first, then — long after "
    "validation accuracy has flatlined — suddenly generalises. Weight decay is often the trigger.",
    "emoji 😀🎉🚀 and CJK 漢字 and Devanagari देवनागरी and Arabic العربية all in one line, mixed together.",
]

POOLS = {
    "ascii": [chr(c) for c in range(0x20, 0x7F)],
    "latin1": [chr(c) for c in range(0xA0, 0x180)],
    "deva": [chr(c) for c in range(0x0900, 0x097F)],
    "cjk": [chr(c) for c in range(0x4E00, 0x4E80)],
    "kana": [chr(c) for c in range(0x3040, 0x30A0)],
    "hangul": [chr(c) for c in range(0xAC00, 0xAC60)],
    "arabic": [chr(c) for c in range(0x0600, 0x0660)],
    "cyrillic": [chr(c) for c in range(0x0400, 0x0460)],
    "emoji": ["😀", "😁", "🚀", "🔥", "💯", "👨‍👩‍👧", "🇮🇳", "❤️", "🎉", "🥳"],
    "punct": list("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"),
    "space": [" ", "\t", "\n", "\r", "\u00a0", "\u2003", "\u3000", "\u200b", "\ufeff", "\u0085"],
    "math": ["∑", "∫", "≤", "≥", "≠", "≈", "×", "÷", "π", "∞", "√", "∂"],
    "marks": ["\u0300", "\u0301", "\u0302", "\u0323", "\u034f", "\u093c", "\u094d"],
}


def build_corpus() -> list[str]:
    rnd = random.Random(20260912)
    corpus = list(FIXED)
    corpus.extend(SPECIAL)
    corpus.extend(PROSE)
    # deterministic pseudo-random strings across every pool + a few mixes
    for pool_name, pool in POOLS.items():
        for _ in range(60):
            n = rnd.randint(1, 40)
            corpus.append("".join(rnd.choice(pool) for _ in range(n)))
    mixed = list(POOLS["ascii"]) + POOLS["emoji"] + POOLS["math"] + POOLS["marks"] + POOLS["space"]
    for _ in range(120):
        n = rnd.randint(1, 60)
        corpus.append("".join(rnd.choice(mixed) for _ in range(n)))
    # realistic word-salad with structure
    words = ["the", "quick", "brown", "fox", "नमस्ते", "दुनिया", "中", "文", "😀", "hello",
             "world", "foo", "bar", "42", "3.14", "\n", " ", "!", "?", ",", ".", "'", '"', "-", "_"]
    for _ in range(150):
        n = rnd.randint(1, 25)
        corpus.append("".join(rnd.choice(words) + rnd.choice(["", " ", "  ", "\n"]) for _ in range(n)))
    return corpus


# ---------------------------------------------------------------------------
# reference encoders
# ---------------------------------------------------------------------------
def refs_for(corpus: list[str]) -> dict:
    out = {}
    import tiktoken
    from tokenizers import Tokenizer

    tk = {
        "cl100k": ("tiktoken", tiktoken.get_encoding("cl100k_base")),
        "o200k": ("tiktoken", tiktoken.get_encoding("o200k_base")),
        "llama3": ("hf", Tokenizer.from_file(str(RAW / "llama3.tokenizer.json"))),
        "qwen25": ("hf", Tokenizer.from_file(str(RAW / "qwen25.tokenizer.json"))),
        "deepseek": ("hf", Tokenizer.from_file(str(RAW / "deepseek.tokenizer.json"))),
        "gemma3": ("hf", Tokenizer.from_file(str(RAW / "gemma3.tokenizer.json"))),
        "mistral": ("hf", Tokenizer.from_file(str(RAW / "mistral.tokenizer.json"))),
    }
    for mid, (kind, enc) in tk.items():
        rows = []
        for s in corpus:
            if kind == "tiktoken":
                # disallowed_special=() => treat any special-token text as ordinary
                # text, which is what the browser engine does with user input
                ids = enc.encode(s, disallowed_special=())
            else:
                ids = enc.encode(s, add_special_tokens=False).ids
            rows.append([len(ids), seq_hash(ids)])
        out[mid] = rows
        print(f"  ✓ {mid:9s} {len(rows)} strings, {sum(r[0] for r in rows):,} tokens")
    return out


def main() -> int:
    corpus = build_corpus()
    OUTD.mkdir(parents=True, exist_ok=True)
    (OUTD / "corpus.json").write_text(json.dumps(corpus, ensure_ascii=False), encoding="utf-8")
    print(f"corpus: {len(corpus)} strings, {sum(len(s) for s in corpus):,} chars")
    print(f"corpus sha256: {hashlib.sha256(json.dumps(corpus, ensure_ascii=False).encode()).hexdigest()[:16]}")
    refs = refs_for(corpus)
    refdir = OUTD / "refs"
    refdir.mkdir(exist_ok=True)
    for mid, rows in refs.items():
        (refdir / f"{mid}.json").write_text(json.dumps(rows), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
