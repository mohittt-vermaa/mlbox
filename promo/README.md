# mlbox promo video

A ~30-second, 1080×1920 (9:16) promo for the repo, generated **entirely from this
repository's own content** — `docs/*.png` screenshots and `data/*.json` — with
procedural graphics, transitions, and a synthesized soundtrack. No stock footage,
no external assets except fonts (Apache-2.0 Roboto + system DejaVu, both
redistributable).

![poster](renders/thumb.jpg)

## Regenerate it

```bash
pip install pillow numpy imageio-ffmpeg qrcode   # fonts are already in ./fonts
python3 generate_video.py
```

Output lands in `renders/`:

| file | what |
|---|---|
| `mlbox_promo_30s.mp4` | the video (H.264 + AAC, faststart, ~30.5 s @ 30 fps) |
| `thumb.jpg` | poster frame (the "2.6× the bill" slam) |
| `still_*.jpg` | one still per scene |
| `audio.wav` | the synthesized soundtrack (126 BPM, synthwave-ish) |

Everything is deterministic: same inputs → same video (the only randomness is
seeded).

## What's in the 30 seconds

| time | scene | content |
|---|---|---|
| 0:00–0:03.6 | Hook | typed prompt, "SAME TEXT. 3× THE BILL.", 7 tokenizer names fly in |
| 0:03.6–0:11.2 | Tokenizer lens | real UI crop (chips + share link), Devanagari token pieces, the 5-vs-13 token count on "नमस्ते दुनिया", 2.6× cost slam |
| 0:11.2–0:17 | Playground | decision-boundary canvas zoom, loss curve drawing itself, epoch/acc counters |
| 0:17–0:21.6 | No-GPU recipes | checklist of real recipe titles + the Colab gotcha quote |
| 0:21.6–0:26.6 | Price bench | animated race of the real monthly costs ($270 → $20,000, 74× spread) from `data/pricing.json` |
| 0:26.6–0:30.5 | CTA | QR code to the repo, URL bar, "star the repo" |

Whip-pan transitions with motion blur, screen flashes on the number slams, and
whoosh/boom/riser SFX synced to the cuts.

## License notes

- Code: MIT (same as the repo).
- `fonts/`: Roboto (Apache License 2.0) — included for reproducibility.
- All product names, prices, and numbers shown are taken from the repo's own
  `data/` on 2026-09-13; prices move — re-check before you budget.
