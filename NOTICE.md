# Data provenance & upstream licenses

All mlbox *code* is MIT (see `LICENSE`). The browser bundles in `data/tok/` are
derived from upstream model artifacts and remain governed by their original
licenses. They are redistributed here only so the site works offline on GitHub
Pages; `tools/fetch_models.py` and `tools/build_tokenizers.py` reproduce them
from the primary sources.

| Bundle | Derived from | Upstream license |
|---|---|---|
| `cl100k.json` | OpenAI `cl100k_base.tiktoken` (openaipublic.blob.core.windows.net) | MIT (tiktoken) |
| `o200k.json` | OpenAI `o200k_base.tiktoken` | MIT (tiktoken) |
| `llama3.json` | `NousResearch/Meta-Llama-3.1-8B/tokenizer.json` (Hugging Face) | Llama 3.1 Community License |
| `qwen25.json` | `Qwen/Qwen2.5-7B-Instruct/tokenizer.json` | Apache-2.0 |
| `deepseek.json` | `deepseek-ai/DeepSeek-V3/tokenizer.json` | MIT |
| `mistral.json` | `mistralai/Mistral-7B-v0.1/tokenizer.json` | Apache-2.0 |
| `gemma3.json` | `unsloth/gemma-3-4b-it/tokenizer.json` (mirror of Google Gemma 3) | Gemma Terms of Use |

Model and provider names are trademarks of their respective owners. mlbox is an
independent educational tool and is not affiliated with, endorsed by, or
sponsored by any of them.

Pricing figures in `data/pricing.json` were transcribed from each provider's
official pricing page on the date listed per row; they are facts, not code, and
are provided for reference only.
