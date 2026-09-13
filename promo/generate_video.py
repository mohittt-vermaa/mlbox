#!/usr/bin/env python3
"""
generate_video.py — build a ~30s vertical (1080x1920 @30fps) promo video for the
mlbox repository, entirely from the repo's own content and screenshots.

Output: promo/renders/mlbox_promo_30s.mp4  (+ thumb.jpg, preview stills)

Everything is generated procedurally with Pillow + numpy; the only inputs are
the repo's docs/*.png screenshots and data/*.json. Music is synthesized.
"""
import json, math, os, subprocess, sys, wave, struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMO = os.path.join(ROOT, "promo")
ASSETS = os.path.join(PROMO, "assets")
OUTDIR = os.path.join(PROMO, "renders")
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(OUTDIR, exist_ok=True)

W, H, FPS = 1080, 1920, 30
DUR = 30.5
N_FRAMES = int(DUR * FPS)

# ---------------------------------------------------------------- palette ---
BG_TOP    = (11, 14, 20)
BG_BOT    = (6, 8, 12)
MINT      = (74, 222, 128)
MINT_DIM  = (52, 160, 96)
BLUE      = (110, 168, 254)
PINK      = (244, 114, 182)
AMBER     = (251, 191, 36)
INK       = (16, 20, 26)
PANEL     = (22, 26, 33)
PANEL_HI  = (30, 36, 45)
TXT_DIM   = (148, 160, 175)

FDIR = os.path.join(PROMO, "fonts")
def F(name, size):
    return ImageFont.truetype(os.path.join(FDIR, name), size)
def black(sz): return F("Roboto-Black.ttf", sz)
def bold(sz): return F("Roboto-Bold.ttf", sz)
def med(sz):  return F("Roboto-Medium.ttf", sz)
def reg(sz):  return F("Roboto-Regular.ttf", sz)
def mono(sz, b=False): return F("DejaVuSansMono-Bold.ttf" if b else "DejaVuSansMono.ttf", sz)

# ---------------------------------------------------------------- easing ----
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(t):  t = clamp(t); return 1 - (1 - t) ** 3
def ease_in(t):   t = clamp(t); return t ** 3
def ease_io(t):   t = clamp(t); return t*t*(3-2*t)
def spring(t, d=0.55):          # damped spring 0->1 with overshoot
    t = clamp(t / d, 0, 1) if d > 0 else 1.0
    return 1.0 - math.exp(-6.5*t) * math.cos(9.0*t) * (1-t) - 0.0 if t < 1 else 1.0
def ov(t):  # overshoot scale 0->1
    t = clamp(t)
    return 1 - (1-t)**2 * math.cos(2*math.pi*0.35*(1-t)) if t < 1 else 1.0

# ========================================================== 1. ASSET CROPS ==
def build_assets():
    tk  = Image.open(os.path.join(ROOT, "docs/screenshot-tokenizer.png")).convert("RGB")
    pr  = Image.open(os.path.join(ROOT, "docs/screenshot-prices.png")).convert("RGB")
    pg  = Image.open(os.path.join(ROOT, "docs/screenshot-playground.png")).convert("RGB")
    crops = {
        "tkwide":   tk.crop((60, 240, 1220, 710)),     # chips + textarea + share link
        "chips":    tk.crop((95, 286, 1185, 362)),     # tokenizer model chips
        "url":      tk.crop((95, 646, 1190, 702)),     # share-link bar
        "counts":   tk.crop((85, 722, 535, 796)),      # 13 / 37 / 2 counters
        "pieces":   tk.crop((85, 1218, 575, 1274)),    # Devanagari token pieces
        "race":     pr.crop((60, 140, 1220, 782)),     # cost calculator + bars
        "table":    pr.crop((60, 1608, 1220, 2478)),   # full price table
        "canvas":   pg.crop((107, 243, 611, 776)),     # playground decision boundary
        "loss":     pg.crop((668, 533, 1162, 668)),    # training-loss chart
    }
    for k, im in crops.items():
        im.save(os.path.join(ASSETS, f"crop_{k}.png"))
    # QR code (mint on dark), logo-punched
    import qrcode
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=14, border=1)
    qr.add_data("https://github.com/mohittt-vermaa/mlbox")
    qr.make(fit=True)
    qim = qr.make_image(fill_color=(230, 245, 235), back_color=(10, 13, 18)).convert("RGB")
    qim.save(os.path.join(ASSETS, "qr.png"))
    return crops

# ====================================================== 2. SPRITE HELPERS ===
_text_cache = {}
def text_img(s, font, fill, pad=6, tracking=0):
    """render text -> tightly cropped RGBA"""
    key = (s, id(font), fill, tracking)
    if key in _text_cache: return _text_cache[key]
    dummy = Image.new("RGBA", (10, 10))
    d = ImageDraw.Draw(dummy)
    box = d.textbbox((0, 0), s, font=font)
    w = box[2] - box[0] + tracking*max(0, len(s)-1) + pad*2
    h = box[3] - box[1] + pad*2
    im = Image.new("RGBA", (int(w)+2, int(h)+2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x = pad - box[0]
    if tracking:
        for ch in s:
            d.text((x, pad - box[1]), ch, font=font, fill=fill)
            cb = d.textbbox((0,0), ch, font=font)
            x += (cb[2]-cb[0]) + tracking
    else:
        d.text((x, pad - box[1]), s, font=font, fill=fill)
    _text_cache[key] = im
    return im

def paste_text(canvas, s, font, fill, center, scale=1.0, rot=0.0, alpha=1.0, anchor="mm"):
    im = text_img(s, font, tuple(fill) + (int(255*alpha),) if alpha < 1 else tuple(fill) + (255,))
    im = text_img(s, font, tuple(fill)+(255,))
    if scale != 1.0:
        im = im.resize((max(1,int(im.width*scale)), max(1,int(im.height*scale))), Image.LANCZOS)
    if rot:
        im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    x, y = int(center[0]), int(center[1])
    if anchor == "mm": x -= im.width//2; y -= im.height//2
    canvas.alpha_drop(im, (x, y))

def rrect(draw, box, r, **kw):
    draw.rounded_rectangle(box, radius=r, **kw)

class Canvas:
    def __init__(self, t=0.0):
        bg = compose_bg(t) if t is not None else np.zeros((H, W, 3), np.float32)
        self.im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    def drop(self, im, pos):
        self.im.alpha_composite(im, dest=(int(pos[0]), int(pos[1])))
    def alpha_drop(self, im, pos):
        self.im.alpha_composite(im, dest=(int(pos[0]), int(pos[1])))
    def np(self):
        return np.asarray(self.im.convert("RGB")).astype(np.float32)

def rounded_shadow(w, h, r, blur, alpha):
    im = Image.new("RGBA", (w + blur*4, h + blur*4), (0,0,0,0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([blur*2, blur*2, blur*2+w, blur*2+h], radius=r, fill=(0,0,0,alpha))
    return im.filter(ImageFilter.GaussianBlur(blur))

def glow_rrect(w, h, r, color, width=3, blur=14, alpha=160):
    im = Image.new("RGBA", (w + blur*4, h + blur*4), (0,0,0,0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([blur*2, blur*2, blur*2+w, blur*2+h], radius=r,
                        outline=color + (alpha,), width=width)
    return im.filter(ImageFilter.GaussianBlur(blur))

def make_screen_sprite(img, disp_w, radius=26, border=MINT, glow=True, border_w=3):
    """screenshot -> RGBA sprite with rounded corners, dark border, glow halo"""
    scale = disp_w / img.width
    disp_h = int(img.height * scale)
    im = img.resize((int(disp_w), disp_h), Image.LANCZOS)
    from PIL import ImageEnhance
    im = ImageEnhance.Brightness(im).enhance(1.30)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    mask = Image.new("L", (disp_w, disp_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, disp_w-1, disp_h-1], radius=radius, fill=255)
    sprite = Image.new("RGBA", (disp_w, disp_h), (0,0,0,0))
    sprite.paste(im, (0,0), mask)
    d = ImageDraw.Draw(sprite)
    d.rounded_rectangle([0, 0, disp_w-1, disp_h-1], radius=radius,
                        outline=(70, 82, 96, 255), width=2)
    if border:
        d.rounded_rectangle([1, 1, disp_w-2, disp_h-2], radius=radius-1,
                            outline=border + (230,), width=border_w)
    if glow:
        halo = glow_rrect(disp_w, disp_h, radius, border or (120,140,160), width=4, blur=22, alpha=120)
        base = Image.new("RGBA", (halo.width, halo.height), (0,0,0,0))
        base.alpha_composite(halo)
        base.alpha_composite(sprite, (halo.width//2 - disp_w//2, halo.height//2 - disp_h//2))
        off = (halo.width//2 - disp_w//2, halo.height//2 - disp_h//2)
        return base, off
    return sprite, (0, 0)

def drop_shadow_on(canvas, w, h, cx, cy, blur=30, alpha=140):
    key = ("sh", w, h, blur, alpha)
    if key not in _text_cache:
        _text_cache[key] = rounded_shadow(w, h, 26, blur, alpha)
    sh = _text_cache[key]
    canvas.alpha_drop(sh, (int(cx - sh.width/2), int(cy - sh.height/2)))

# ------------------------------------------------------------ backgrounds ---
_xx, _yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
def base_bg():
    g = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    bg = (np.array(BG_TOP) * (1-g) + np.array(BG_BOT) * g)
    return np.broadcast_to(bg, (H, W, 3)).copy()

def radial_glow(color, radius, alpha):
    size = radius*2
    y, x = np.ogrid[:size, :size]
    d = np.sqrt((x-radius)**2 + (y-radius)**2) / radius
    a = np.clip(1-d, 0, 1)**2.2 * alpha
    a = a + np.random.RandomState(11).rand(size, size)*1.6   # dither kills banding
    im = np.zeros((size, size, 4), np.uint8)
    im[..., 0], im[..., 1], im[..., 2] = color
    im[..., 3] = (np.clip(a, 0, 255)).astype(np.uint8)
    return Image.fromarray(im, "RGBA")

GRIDS = None
def noise_grid():
    global GRIDS
    if GRIDS is None:
        rs = np.random.RandomState(7)
        GRIDS = [rs.rand(H//6, W//6, 1).astype(np.float32)*10-5 for _ in range(6)]
    return GRIDS

def compose_bg(t, glow_amp=1.0):
    """bg gradient + drifting glows + vignette + faint noise -> float32 img"""
    img = base_bg()
    glows = [
        (MINT,  0.9*math.sin(t*0.45)+0.0, -0.35+0.18*math.sin(t*0.31+1.7), 620, 46),
        (BLUE,  -0.85+0.2*math.cos(t*0.36), 0.55+0.16*math.sin(t*0.27+4.0), 700, 40),
        (PINK,  0.75+0.25*math.sin(t*0.22+2.6), 0.8+0.2*math.cos(t*0.4+0.8), 520, 26),
    ]
    for color, gx, gy, rad, amp in glows:
        spr = radial_glow(color, rad, int(amp*glow_amp))
        arr = np.asarray(spr, np.float32)
        cx, cy = int(W/2 + gx*W/2 - rad), int(H/2 + gy*H/2 - rad)
        x0, y0 = max(0, cx), max(0, cy)
        x1, y1 = min(W, cx+2*rad), min(H, cy+2*rad)
        if x1 <= x0 or y1 <= y0: continue
        sub = arr[y0-cy:y1-cy, x0-cx:x1-cx, :3]
        a = (arr[y0-cy:y1-cy, x0-cx:x1-cx, 3:4] / 255.0)
        img[y0:y1, x0:x1] += sub * a
    # faint grid
    step = 72
    img[::step, :, :] += 3.0
    img[:, ::step, :] += 3.0
    # noise (grain)
    n = noise_grid()[int(t*30) % 6]
    img += n.repeat(6, 0)[:H].repeat(6, 1, )[:, :W]
    # vignette
    vx = (_xx - W/2) / (W/2); vy = (_yy - H/2) / (H/2)
    v = 1.0 - 0.20*np.clip(vx*vx + vy*vy, 0, 1.4)
    img *= v[:, :, None]
    return img

# ------------------------------------------------------------ chip sprite ---
def chip_sprite(text, fg, bgc, border, font, padx=26, pady=14, r=999, alpha=255):
    t = text_img(text, font, fg)
    w, h = t.width + padx*2, t.height + pady*2
    im = Image.new("RGBA", (w+8, h+8), (0,0,0,0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([2, 2, w+4, h+4], radius=r, fill=bgc + (alpha,), outline=border + (alpha,), width=3)
    im.alpha_composite(t, (2+padx, 2+pady))
    return im

def check_sprite(color, w=44, h=40, lw=9):
    im = Image.new("RGBA", (w, h), (0,0,0,0))
    d = ImageDraw.Draw(im)
    d.line([(4, h*0.55), (w*0.36, h-6), (w-6, 6)], fill=color+(255,), width=lw, joint="curve")
    d.ellipse([0, h*0.55-lw//2, lw, h*0.55+lw//2], fill=color+(255,))
    return im

def star_sprite(color, size=54):
    im = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(im)
    pts = []
    for i in range(10):
        ang = -math.pi/2 + i*math.pi/5
        r = size*0.48 if i % 2 == 0 else size*0.21
        pts.append((size/2 + r*math.cos(ang), size/2 + r*math.sin(ang)))
    d.polygon(pts, fill=color+(255,))
    return im

# ============================================================= 3. SCENES ====
CROPS = None
SCR = {}   # screen sprites (lazy)

def get_screen(key, w, border=MINT, glow=True):
    key2 = (key, int(w))
    if key2 not in SCR:
        SCR[key2] = make_screen_sprite(CROPS[key], w, border=border, glow=glow)
    return SCR[key2]

def drop_screen(canvas, key, w, center, zoom=1.0, rot=0.0, alpha=255, border=MINT, t_local=None, kp=(0,0)):
    """drop screenshot sprite with zoom-pan sample window"""
    sprite, off = get_screen(key, w, border=border)
    cx, cy = center
    if alpha < 255:
        sprite = sprite.copy(); sprite.putalpha(sprite.getchannel("A").point(lambda a: a*alpha//255))
    ox, oy = off
    px, py = int(cx - sprite.width/2), int(cy - sprite.height/2)
    if zoom != 1.0 or kp != (0, 0):
        zw = int(sprite.width/zoom); zh = int(sprite.height/zoom)
        zcx = sprite.width//2 + int(kp[0]*(sprite.width/2 - zw/2)*zoom)
        zcy = sprite.height//2 + int(kp[1]*(sprite.height/2 - zh/2)*zoom)
        zcx = int(np.clip(zcx, zw//2, sprite.width - zw//2)); zcy = int(np.clip(zcy, zh//2, sprite.height - zh//2))
        crop = sprite.crop((zcx-zw//2, zcy-zh//2, zcx+zw//2, zcy+zh//2))
        crop = crop.resize((sprite.width, sprite.height), Image.LANCZOS)
        if rot: crop = crop.rotate(rot, expand=False, resample=Image.BICUBIC)
        canvas.alpha_drop(crop, (px, py))
    else:
        if rot: sprite = sprite.rotate(rot, expand=True, resample=Image.BICUBIC)
        canvas.alpha_drop(sprite, (px, py))

def stamp_caption(canvas, big, small, cy, t, bigcol=(235, 245, 240), smallcol=TXT_DIM,
                  bigsz=86, smallsz=40, delay=0.12):
    s1 = spring(t - 0.0, 0.5); s2 = spring(t - delay, 0.5)
    if s1 > 0.01:
        sc = 0.6 + 0.4*s1
        paste_text(canvas, big, black(bigsz), bigcol, (W/2, cy), scale=sc,
                   alpha=min(1, s1*1.4), rot=(1-s1)*3.0)
    if s2 > 0.01:
        paste_text(canvas, small, bold(smallsz), smallcol, (W/2, cy + bigsz*0.72),
                   scale=0.7+0.3*s2, alpha=min(1, s2*1.5))

def side_tag(canvas, txt, t, color=BLUE, right=True, y=1490):
    """small floating label chip near screen edge"""
    s = spring(t, 0.5)
    if s <= 0.02: return
    spr = chip_sprite(txt, (225, 235, 245), (24, 30, 38), color, med(34), padx=22, pady=10)
    spr = spr.resize((int(spr.width*(0.5+0.5*s)), int(spr.height*(0.5+0.5*s))), Image.LANCZOS)
    x = (W - spr.width - 40) if right else 40
    x += int((1-s) * (60 if right else -60))
    drop_shadow_on(canvas, spr.width-16, spr.height-16, x+spr.width/2, y+spr.height/2, 18, 120)
    canvas.alpha_drop(spr, (int(x), int(y - (1-s)*18)))

# ------------------------------------------------- S0: hook ----------------
HOOK_Q = "user: why is my hindi prompt 3x more expensive?"
S0_DUR = 3.6
HOOK_CHIPS = ["o200k", "cl100k", "llama3", "mistral", "gemma3", "qwen25", "deepseek",
              "218,877 tokens", "BPE", "verified vs Rust"]
def scene_hook(t, canvas):
    d = ImageDraw.Draw(canvas.im)
    # typed question
    n = int(len(HOOK_Q) * ease_io((t - 0.15) / 1.05))
    shown = HOOK_Q[:n]
    if t > 0.05:
        f = mono(34, True)
        paste_text(canvas, shown, f, MINT, (90, 260), anchor="lm")
        cw = text_img(shown, f, MINT).width if shown else 0
        if int(t*2.6) % 2 == 0:
            d.rounded_rectangle([92+cw+8, 240, 92+cw+14, 288], radius=3, fill=MINT + (230,))
    # headline stamps
    for line, col, yy, tt in [("SAME TEXT.", (235, 245, 240), 660, 1.05),
                              ("3× THE BILL.", MINT, 820, 1.38)]:
        s = spring(t - tt, 0.42)
        if s > 0.01:
            sc = 0.55 + 0.45*s
            drop_shadow_on(canvas, 640, 120, W/2, yy, 26, 130)
            paste_text(canvas, line, black(118), col, (W/2, yy), scale=sc,
                       alpha=min(1, s*1.5), rot=(1-s)*4.0*(1 if col == MINT else -1))
    # flash ring on second stamp
    s2 = spring(t - 1.38, 0.3)
    if 0 < t - 1.38 < 0.5:
        k = (t - 1.38) / 0.5
        r = int(40 + 460*k)
        a = int(150 * (1-k))
        d.ellipse([W/2-r, 820-r*0.62, W/2+r, 820+r*0.62], outline=MINT + (a,), width=max(1, int(10*(1-k))))
    # flying tokenizer chips
    rs = np.random.RandomState(3)
    for i, name in enumerate(HOOK_CHIPS):
        t0 = 1.9 + i*0.11
        s = spring(t - t0, 0.5)
        if s <= 0.02: continue
        col = [MINT, BLUE, PINK, AMBER][i % 4]
        spr = chip_sprite(name, (228, 238, 246), (24, 30, 38), col, bold(40))
        ang = rs.uniform(0, 2*math.pi); rad = rs.uniform(200, 350)
        tx = W/2 + math.cos(ang)*rad*1.25; ty = 1250 + math.sin(ang)*rad*0.62
        x = int(np.clip(W/2 + (tx - W/2)*s, 225, 855)); y = 900 + (ty - 900)*s
        rot = rs.uniform(-16, 16)
        spr = spr.rotate(rot*s, expand=True, resample=Image.BICUBIC)
        sc = 0.4 + 0.6*s
        spr = spr.resize((int(spr.width*sc), int(spr.height*sc)), Image.LANCZOS)
        drop_shadow_on(canvas, spr.width, spr.height, x, y, 14, 110)
        canvas.alpha_drop(spr, (int(x - spr.width/2), int(y - spr.height/2)))
    # bottom prompt
    s3 = spring(t - 3.05, 0.4)
    if s3 > 0.02:
        paste_text(canvas, "mlbox measures it — locally, in your browser", bold(40),
                   (200, 214, 226), (W/2, 1700), scale=0.7+0.3*s3, alpha=s3)

# ------------------------------------------------- S1: tokenizer -----------
S1_DUR = 7.6
def scene_tokenizer(t, canvas):
    zoom = 1.0 + 0.030*t
    kp = (0.0 + 0.12*t, 0.0)
    drop_shadow_on(canvas, 960, 420, W/2, 640, 34, 150)
    drop_screen(canvas, "tkwide", 960, (W/2, 640), zoom=zoom, kp=kp, alpha=255, t_local=t)
    stamp_caption(canvas, "7 REAL TOKENIZERS", "one paste · verified vs Rust, token-for-token",
                  270, t - 0.30, bigsz=84, smallsz=38)
    # pieces crop pops
    s = spring(t - 1.9, 0.5)
    if s > 0.02:
        drop_shadow_on(canvas, 640, 130, W/2, 1105, 20, 130)
        drop_screen(canvas, "pieces", 640, (W/2, 1105), alpha=int(255*min(1, s*1.3)),
                    zoom=1.0, border=BLUE)
        paste_text(canvas, "how it actually cuts  ›  9 pieces", bold(34), TXT_DIM,
                   (W/2, 1245), alpha=s)
    # counts crop pops
    s2 = spring(t - 2.6, 0.5)
    if s2 > 0.02:
        drop_shadow_on(canvas, 520, 110, 340, 1470, 18, 120)
        drop_screen(canvas, "counts", 520, (340, 1470), alpha=int(255*min(1, s2*1.3)),
                    border=(120, 134, 150))
    # big comparison numbers
    s3 = spring(t - 3.3, 0.5); s4 = spring(t - 3.55, 0.5)
    if s3 > 0.02:
        paste_text(canvas, "5", black(130), MINT, (665, 1435), scale=0.6+0.4*s3, alpha=min(1, s3*1.4))
        paste_text(canvas, "o200k tokens", bold(34), (200, 214, 226), (665, 1558), alpha=s3)
    if s4 > 0.02:
        paste_text(canvas, "13", black(130), PINK, (895, 1508), scale=0.6+0.4*s4, alpha=min(1, s4*1.4))
        paste_text(canvas, "cl100k tokens", bold(34), (200, 214, 226), (895, 1631), alpha=s4)
    paste_text(canvas, "same 13 characters", bold(36), TXT_DIM, (W/2, 1700), alpha=spring(t-4.1, 0.4))
    paste_text(canvas, "boundary diff · shareable comparison links", bold(33), (150, 164, 180),
               (W/2, 1772), alpha=spring(t-4.4, 0.4))
    # 2.6x slam
    s5 = spring(t - 5.15, 0.32)
    if s5 > 0.01:
        k = clamp((t - 5.15)/0.28)
        drop_shadow_on(canvas, 420, 150, W/2, 1880, 30, 150)
        paste_text(canvas, "2.6× the bill", black(96), AMBER, (W/2, 1880),
                   scale=(1.35 - 0.35*ease_out(k)) * (0.5+0.5*s5) + 0.0,
                   alpha=min(1, s5*1.6), rot=(1-ease_out(k))*-3)

# ------------------------------------------------- S2: playground ----------
S2_DUR = 5.8
def scene_playground(t, canvas):
    drop_shadow_on(canvas, 700, 1000, W/2, 1000, 34, 150)
    zoom = 1.02 + 0.020*t
    drop_screen(canvas, "canvas", 700, (W/2, 960), zoom=zoom, kp=(0, 0.06*t))
    stamp_caption(canvas, "A NEURAL NET", "trained live, right in your browser",
                  300, t - 0.25, bigsz=92, smallsz=40)
    # loss curve drawing
    s = spring(t - 1.25, 0.5)
    if s > 0.02:
        drop_shadow_on(canvas, 620, 190, W/2, 1610, 20, 130)
        loss, off = get_screen("loss", 620, border=BLUE, glow=True)
        px, py = int(W/2 - loss.width/2), int(1610 - loss.height/2)
        prog = ease_io((t - 1.35) / 1.6)
        if prog >= 0.999:
            canvas.alpha_drop(loss, (px, py))
        else:
            part = loss.crop((0, 0, loss.width, max(2, int(loss.height*prog))))
            mask = Image.new("L", part.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, part.width-1, part.height-1],
                                                   radius=24, fill=255)
            canvas.im.paste(part, (px, py), mask)
        d = ImageDraw.Draw(canvas.im)
        d.rounded_rectangle([px, py, px+loss.width, py+int(loss.height*min(1,prog+0.02))],
                            radius=24, outline=MINT + (200,), width=3)
        # epoch / acc readouts
        ep = int(564 * clamp((t - 1.5) / 2.4))
        paste_text(canvas, f"epoch {ep}", mono(36, True), MINT, (200, 1698), anchor="lm", alpha=s)
        acc = 100.0 * clamp((t - 1.5) / 2.4) ** 0.6
        paste_text(canvas, f"acc {acc:5.1f}%", mono(36, True), BLUE, (W-200, 1698), anchor="rm", alpha=s)
    for i, (txt, col, dy) in enumerate([("pure-JS backprop · ~80 lines", MINT, 0),
                                        ("0 dependencies · 0 GPU", BLUE, 64),
                                        ("XOR ✓   spiral ✗", PINK, 128)]):
        si = spring(t - 3.15 - i*0.28, 0.5)
        if si > 0.02:
            spr = chip_sprite(txt, (228, 238, 246), (24, 30, 38), col, med(32), pady=8)
            x = W/2 - spr.width/2 + (1-si)*(60 if i % 2 else -60)
            y = 1758 + dy - (1-si)*26
            drop_shadow_on(canvas, spr.width, spr.height, x+spr.width/2, y+spr.height/2, 14, 110)
            canvas.alpha_drop(spr, (int(x), int(y)))
    side_tag(canvas, "hand-written gradient descent", t - 1.0, MINT, right=False)

# ------------------------------------------------- S3: recipes -------------
S3_DUR = 4.6
RECIPES = ["train a 10M-param GPT from scratch",
           "LoRA a 0.5B model — on CPU",
           "tiny diffusion on MNIST",
           "DQN on CartPole, 5 seeds",
           "backprop from scratch in NumPy"]
def scene_recipes(t, canvas):
    stamp_caption(canvas, "12 NO-GPU RECIPES", "laptop · free Colab · Kaggle — each with its one gotcha",
                  300, t - 0.25, bigsz=92, smallsz=38, bigcol=(240, 246, 250))
    for i, item in enumerate(RECIPES):
        t0 = 0.75 + i*0.30
        s = spring(t - t0, 0.42)
        if s <= 0.02: continue
        y = 700 + i*150
        x = W/2 - 430
        chk = check_sprite(MINT, 52, 46, 10)
        cs = 0.4 + 0.6*s
        chk = chk.resize((int(52*cs), int(46*cs)), Image.LANCZOS)
        canvas.alpha_drop(chk, (int(x - 20), int(y - 24 + (1-s)*20)))
        paste_text(canvas, item, bold(46), (226, 236, 244), (x + 70, y), anchor="lm",
                   alpha=min(1, s*1.4), scale=0.85+0.15*s)
        d = ImageDraw.Draw(canvas.im)
        a = int(70 * s)
        d.line([(x + 66, y + 42), (x + 66 + int(620*ease_out(s*1.2)), y + 42)],
               fill=(120, 140, 150, a), width=2)
    # gotcha card
    s2 = spring(t - 2.55, 0.5)
    if s2 > 0.02:
        wcard, hcard = 880, 250
        x0, y0 = W/2 - wcard/2, 1560
        drop_shadow_on(canvas, wcard, hcard, W/2, y0 + hcard/2, 22, 140)
        card = Image.new("RGBA", (wcard, hcard), (0,0,0,0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, wcard-1, hcard-1], radius=30, fill=(30, 26, 16, 242),
                             outline=AMBER + (235,), width=3)
        cd.text((36, 26), "the one gotcha, spelled out", font=bold(36), fill=AMBER + (255,))
        cd.text((36, 92), "\u201cSessions die. Checkpoint to Drive every N\n steps — save optimizer state, not just weights.\u201d",
                font=med(33), fill=(226, 232, 238, 255))
        card = card.resize((int(wcard*(0.7+0.3*s2)), int(hcard*(0.7+0.3*s2))), Image.LANCZOS)
        canvas.alpha_drop(card, (int(W/2 - card.width/2), int(y0 + hcard/2 - card.height/2)))
    side_tag(canvas, "genuinely finishes on a laptop", t - 1.8, AMBER, right=False)
    side_tag(canvas, "no GPU. no excuse.", t - 2.1, MINT, right=True)

# ------------------------------------------------- S4: prices --------------
S4_DUR = 5.0
PRICES = [("DeepSeek Flash (V4.1)", 270), ("GPT-5.6 Luna", 440), ("DeepSeek V4 Pro", 1056),
          ("Gemini 3.8 Flash", 1500), ("Claude Haiku 4.5", 2000), ("Grok 4.6", 3200),
          ("Claude Sonnet 5", 4000), ("GPT-5.6 Terra", 4400), ("GPT-5.6 Sol", 8000),
          ("Claude Opus 5", 10000), ("GPT-6 Astra", 20000), ("Claude Fable 5.1", 20000)]
def scene_prices(t, canvas):
    stamp_caption(canvas, "13 MODELS · 5 PROVIDERS", "prices from the source — checked 2026-09-12",
                  290, t - 0.25, bigsz=72, smallsz=36)
    drop_shadow_on(canvas, 860, 560, W/2, 800, 32, 150)
    drop_screen(canvas, "race", 860, (W/2, 790), zoom=1.02 + 0.018*t, kp=(0.0, 0.10*t))
    # animated race bars (real monthly costs)
    top, bot = 1150, 1700
    maxv, maxw = 20000.0, 325.0
    for i, (name, cost) in enumerate(PRICES):
        t0 = 0.55 + i*0.115
        s = ease_out((t - t0) / 0.5)
        if s <= 0.01: continue
        y = top + i*(bot-top)//len(PRICES)
        bw = int(maxw * (cost/maxv) * (0.15 + 0.85*s)) + 6
        col = MINT if cost < 1000 else (BLUE if cost < 8000 else PINK)
        d = ImageDraw.Draw(canvas.im)
        d.rounded_rectangle([560, y, 560+bw, y+22], radius=11, fill=col + (235,))
        paste_text(canvas, name, med(27), (206, 218, 230), (118, y+11), anchor="lm", alpha=s)
        paste_text(canvas, f"${cost:,}", mono(27, True), col, (560+bw+14, y+11), anchor="lm", alpha=s)
    # total counter + spread slam
    s2 = spring(t - 1.6, 0.5)
    if s2 > 0.02:
        lo, hi = 270, 20000
        cur = int(lo + (hi-lo)*clamp((t - 1.7)/2.6)**0.8)
        paste_text(canvas, "${:,}/mo spread".format(cur), black(64), AMBER, (W/2, 1745),
                   scale=0.7+0.3*s2, alpha=s2)
    s3 = spring(t - 3.35, 0.3)
    if s3 > 0.01:
        k = clamp((t - 3.35)/0.26)
        drop_shadow_on(canvas, 360, 130, W/2, 1870, 26, 150)
        paste_text(canvas, "74× SPREAD", black(108), PINK, (W/2, 1870),
                   scale=(1.4-0.4*ease_out(k))*(0.5+0.5*s3), alpha=min(1, s3*1.6), rot=(1-ease_out(k))*2.5)
    side_tag(canvas, "real-prompt estimator", t - 2.3, MINT, right=False, y=1062)

# ------------------------------------------------- S5: CTA -----------------
S5_DUR = 3.9
def draw_logo(canvas, cx, cy, scale=1.0):
    """little 'token blocks' logo: three rounded squares"""
    s = 60*scale
    cols = [MINT, BLUE, PINK]
    for i in range(3):
        d = ImageDraw.Draw(canvas.im)
        x = cx - 1.5*s + i*s*1.05
        d.rounded_rectangle([x, cy - s*0.5, x + s*0.9, cy + s*0.5], radius=int(s*0.28),
                            fill=cols[i] + (255,))
def scene_cta(t, canvas):
    # headline
    s0 = spring(t - 0.05, 0.45)
    if s0 > 0.02:
        paste_text(canvas, "RUN IT IN YOUR BROWSER", black(84), (238, 246, 250), (W/2, 330),
                   scale=0.6+0.4*s0, alpha=min(1, s0*1.4))
    s1 = spring(t - 0.30, 0.5)
    if s1 > 0.02:
        paste_text(canvas, "no install · no API key · no GPU · MIT", bold(38), TXT_DIM,
                   (W/2, 430), scale=0.7+0.3*s1, alpha=s1)
    # QR card
    s2 = spring(t - 0.55, 0.5)
    if s2 > 0.02:
        cw = 760; ch = 760
        x0, y0 = W/2 - cw/2, 640
        drop_shadow_on(canvas, cw, ch, W/2, y0 + ch/2, 36, 170)
        card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, cw-1, ch-1], radius=44, fill=(13, 17, 23, 250),
                             outline=MINT + (255,), width=4)
        qim = Image.open(os.path.join(ASSETS, "qr.png")).resize((600, 600), Image.NEAREST)
        card.paste(qim, (80, 90))
        # logo punchout
        d2 = ImageDraw.Draw(card)
        d2.rounded_rectangle([cw/2-105, 90+300-105, cw/2+105, 90+300+105], radius=38,
                             fill=(13, 17, 23, 255), outline=MINT + (255,), width=5)
        for i, c in enumerate([MINT, BLUE, PINK]):
            bx = cw/2 - 1.5*46 + i*46*1.05
            d2.rounded_rectangle([bx, 90+300-23, bx + 46*0.9, 90+300+23], radius=14, fill=c + (255,))
        # pulse ring
        k = (t*0.9) % 1.0
        r = 300 + 60*k
        a = int(120*(1-k))
        d2.rounded_rectangle([cw/2-r, ch/2-r, cw/2+r, ch/2+r], radius=60, outline=MINT + (a,), width=3)
        sc = 0.65 + 0.35*s2
        card = card.resize((int(cw*sc), int(ch*sc)), Image.LANCZOS)
        canvas.alpha_drop(card, (int(W/2 - card.width/2), int(y0 + ch/2 - card.height/2)))
    # url + star
    s3 = spring(t - 0.95, 0.5)
    if s3 > 0.02:
        d = ImageDraw.Draw(canvas.im)
        uw = 880
        d.rounded_rectangle([W/2-uw/2, 1510, W/2+uw/2, 1600], radius=24, fill=(20, 26, 33, 245),
                            outline=(90, 106, 122, 255), width=2)
        paste_text(canvas, "github.com/mohittt-vermaa/mlbox", mono(44, True), MINT,
                   (W/2, 1555), alpha=min(1, s3*1.4), scale=0.7+0.3*s3)
    s4 = spring(t - 1.45, 0.5)
    if s4 > 0.02:
        st = star_sprite(AMBER, 56)
        st = st.resize((int(56*(0.5+0.5*s4)),)*2, Image.LANCZOS)
        txtw = text_img("star the repo", bold(48), (240, 246, 250)).width
        total = st.width + 18 + txtw
        x = W/2 - total/2
        y = 1700 - (1-s4)*30
        canvas.alpha_drop(st, (int(x), int(y - st.height/2)))
        paste_text(canvas, "star the repo", bold(48), (240, 246, 250), (x + st.width + 18 + text_img("star the repo", bold(48), (240,246,250)).width/2, y),
                   alpha=min(1, s4*1.4), scale=0.7+0.3*s4)
    if t > 2.4:
        k = math.sin((t-2.4)*6.0)
        st = star_sprite(AMBER, 56)
        canvas.alpha_drop(st, (int(W/2 - 460 + 6*k), 1700-28))

SCENES = [
    (0.0,  scene_hook,       S0_DUR),
    (3.6,  scene_tokenizer,  S1_DUR),
    (11.2, scene_playground, S2_DUR),
    (17.0, scene_recipes,    S3_DUR),
    (21.6, scene_prices,     S4_DUR),
    (26.6, scene_cta,        S5_DUR),
]
TRANS = 0.42   # cross transition duration

def render_scene_frame(gi):
    """returns float32 RGB for global time gi (seconds)"""
    t = gi
    # find active scene(s)
    cur = None
    for idx, (st, fn, du) in enumerate(SCENES):
        if st <= t < st + du + 0.6:
            cur = idx
            break
    st, fn, du = SCENES[cur]
    tl = t - st
    canvas = Canvas(t)
    fn(min(tl, du + 0.55), canvas)
    img = canvas.np()
    # transition blending
    if cur + 1 < len(SCENES):
        nst = SCENES[cur+1][0]
        if t > nst - TRANS/2:
            p = clamp((t - (nst - TRANS/2)) / TRANS)
            nxt = SCENES[cur+1]
            c2 = Canvas(t)
            nxt[1](t - nxt[0], c2)
            img2 = c2.np()
            # whip blur horizontal: outgoing exits left, incoming arrives from right
            sh = int((0.5 + 6*p*(1-p)*4) * 6)
            acc = np.zeros_like(img); ws2 = 0
            for k in range(-2, 3):
                wgt = 1.0 - 0.18*abs(k)
                acc += np.roll(img2, int(k*sh*0.35) + int((1-p)*(1-p)*W*1.4), axis=1) * wgt
                ws2 += wgt
            img2b = acc / ws2
            acc0 = np.zeros_like(img); ws = 0
            for k in range(-2, 3):
                wgt = 1.0 - 0.18*abs(k)
                acc0 += np.roll(img, int(k*sh*0.35) - int(p*p*W*1.4), axis=1) * wgt
                ws += wgt
            img0b = acc0 / ws
            img = img0b*(1-p) + img2b*p
            # speed flash
            img += (np.sin(math.pi*p)**2) * 26
    # global fade in/out
    if t < 0.18: img *= t/0.18
    if t > DUR - 0.45: img *= clamp((DUR - t)/0.45)
    return np.clip(img, 0, 255).astype(np.uint8)

# ============================================================ 4. AUDIO ======
SR = 44100
def adsr(n, a=0.01, d=0.05, s=0.7, r=0.08, sus_len=None):
    a_n, d_n, r_n = int(a*SR), int(d*SR), int(r*SR)
    sus = n - a_n - d_n - r_n
    if sus < 0: sus = 0
    env = np.concatenate([
        np.linspace(0, 1, max(1, a_n)),
        np.linspace(1, s, max(1, d_n)),
        np.full(max(0, sus), s),
        np.linspace(s, 0, max(1, r_n))])
    return env[:n] if len(env) >= n else np.pad(env, (0, n-len(env)))

def lowpass_fft(x, cutoff):
    Xf = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1/SR)
    Xf *= 1/(1 + (freqs/max(20, cutoff))**4)
    return np.fft.irfft(Xf, len(x))

def tone(freq, dur, kind="sine", detune=0.0):
    n = int(dur*SR)
    tt = np.arange(n)/SR
    if kind == "sine": x = np.sin(2*np.pi*freq*tt)
    elif kind == "saw": x = np.tanh(2.2*np.sin(2*np.pi*(freq*(1+detune))*tt)) + np.tanh(2.2*np.sin(2*np.pi*(freq*(1-detune))*tt + 0.7))
    elif kind == "square": x = np.tanh(3.0*np.sin(2*np.pi*freq*tt))
    elif kind == "tri": x = 2/np.pi*np.arcsin(np.sin(2*np.pi*freq*tt))
    return x

def place(buf, x, at, gain=1.0):
    i = int(at*SR)
    j = min(len(buf), i+len(x))
    if i < 0:
        x = x[-i:]; i = 0; j = min(len(buf), i+len(x))
    if j <= i: return
    buf[i:j] += x[:j-i]*gain

def kick(dur=0.32, f0=150, f1=44):
    n = int(dur*SR); tt = np.arange(n)/SR
    f = f0*(f1/f0)**np.clip(tt/dur, 0, 1)
    x = np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*11)
    x += np.random.RandomState(1).randn(n)*np.exp(-tt*90)*0.4
    return x*0.9

def snare():
    n = int(0.22*SR); tt = np.arange(n)/SR
    x = np.random.randn(n)*np.exp(-tt*26)
    x += tone(190, 0.22)*np.exp(-tt*34)*0.5
    return lowpass_fft(x, 5200)

def hat(open_=False):
    n = int((0.14 if open_ else 0.05)*SR); tt = np.arange(n)/SR
    x = np.random.randn(n)*np.exp(-tt*(28 if open_ else 90))
    return x - lowpass_fft(x, 7000)  # highpass-ish

def whoosh(dur=0.9, up=True):
    rs = np.random.RandomState(9)
    n = int(dur*SR); tt = np.arange(n)/SR
    x = rs.randn(n)
    out = np.zeros(n)
    chunk = 2048
    for i in range(0, n-chunk, chunk):
        seg = x[i:i+chunk]*1.0
        Xf = np.fft.rfft(seg)
        fr = np.fft.rfftfreq(chunk, 1/SR)
        c = (300 + (3800-300)*((i/n) if up else (1-i/n)))**1.15
        Xf *= np.exp(-0.5*((fr-c)/(c*0.55+120))**2)
        out[i:i+chunk] = np.fft.irfft(Xf, chunk)
    env = np.sin(np.pi*tt/dur)**1.6
    return out*env

def boom(dur=1.1):
    n = int(dur*SR); tt = np.arange(n)/SR
    f = 82*0.45**np.clip(tt/dur*1.3, 0, 1)
    x = np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-tt*4.4)
    x += lowpass_fft(np.random.randn(n), 300)*np.exp(-tt*17)*0.7
    return np.tanh(x*2.1)

def riser(dur=0.7):
    n = int(dur*SR); tt = np.arange(n)/SR
    rs = np.random.RandomState(4)
    x = rs.randn(n)
    # chunked time-varying lowpass: cutoff opens over time
    out = np.zeros(n); chunk = 4096
    for i in range(0, n, chunk):
        seg = x[i:i+chunk]
        c = 900*(0.2 + (i/n)*2.2)
        out[i:i+len(seg)] = lowpass_fft(seg, c)
    x = x - out
    env = (tt/dur)**2.1
    f = 220*2**(tt/dur*2.1)
    x = 0.55*x*env + 0.45*np.sin(2*np.pi*np.cumsum(f)/SR)*env
    return x

def sparkle():
    out = np.zeros(int(0.8*SR))
    for i, f in enumerate([1568, 2093, 2637, 3136]):
        place(out, tone(f, 0.3, "tri")*adsr(int(0.3*SR), 0.004, 0.05, 0.25, 0.2), i*0.07, 0.32)
    return out

NOTE = lambda name: 440.0*2**(({'C':-9,'C#':-8,'D':-7,'D#':-6,'E':-5,'F':-4,'F#':-3,'G':-2,'G#':-1,'A':0,'A#':1,'B':2}[name[:-1]] + (int(name[-1])-4)*12)/12)

def build_music(total):
    buf = np.zeros(int(total*SR)+SR, np.float64)
    BPM = 126.0; B = 60.0/BPM
    chords = [("A2", ["A3","C4","E4"]), ("F2", ["F3","A3","C4"]),
              ("C3", ["E3","G3","C4"]), ("G2", ["G3","B3","D4"])]
    # pads (very low, dark)
    for ci in range(int(total/(B*8))+1):
        root, triad = chords[ci % 4]
        at = ci*B*8
        if at > total-0.3: break
        dur = min(B*8.4, total-at+0.4)
        pad = sum(tone(NOTE(n), dur, "saw", detune=0.004) for n in triad)/3
        pad = lowpass_fft(pad, 750)
        env = np.sin(np.pi*np.clip(np.arange(len(pad))/SR/dur, 0, 1))**0.8
        place(buf, pad*env, at, 0.10)
    # bass 8ths
    beat = 0
    while beat*B < total-0.2:
        root = chords[(beat//8) % 4][0]
        f = NOTE(root)/2
        at = beat*B + (B/2 if beat % 2 else 0)
        if beat >= 7 and beat % 1 == 0:
            b = tone(f, B*0.42, "square")
            b = lowpass_fft(b, 260)
            g = 0.30 if 3.4 < at < 28.7 else (0.16 if at > 26.6 else 0.0)
            if beat >= 56: g *= 0.5
            place(buf, b*adsr(len(b), 0.008, 0.05, 0.65, 0.1), at, g)
        beat += 1
    # arp 16ths with echo
    seq = ["A4","C5","E5","G5","A5","E5","C5","G4"]
    for step in range(int(total/(B/2))+40):
        at = step*(B/2)
        if at < 5.2 or at > 27.6: continue
        name = seq[step % len(seq)]
        x = tone(NOTE(name), 0.16, "tri")*adsr(int(0.16*SR), 0.003, 0.04, 0.3, 0.08)
        g = 0.10 + 0.05*((step % 4) == 0)
        if at > 24.8: g *= 1.35
        place(buf, x, at, g)
        place(buf, x, at+B/3, g*0.4); place(buf, x, at+2*B/3, g*0.2)
    # drums
    beat = 0
    while beat*B < total:
        at = beat*B
        if 3.4 <= at <= 28.75:
            place(buf, kick(), at, 0.85 if at < 26.6 else 0.6)
            if at > 7.0 and beat % 2 == 1:
                place(buf, snare(), at, 0.30)
        if 3.4 <= at <= 28.9 and beat % 1 == 0:
            place(buf, hat(open_=(beat % 4 == 3)), at, 0.10)
            if at + B/2 < total: place(buf, hat(), at+B/2, 0.07)
        beat += 1
    return buf[:int(total*SR)]

def build_audio(total=DUR):
    buf = build_music(total)
    # transition whooshes
    for tc in [3.6, 11.2, 17.0, 21.6, 26.6]:
        place(buf, whoosh(0.85), tc-0.42, 0.5)
    # booms
    place(buf, boom(), 1.42, 0.6)     # 3x THE BILL stamp
    place(buf, boom(), 9.02, 0.85)    # 2.6x
    place(buf, boom(), 25.0, 0.9)     # 74x
    place(buf, boom(), 26.62, 0.5)    # cta morph
    # risers into the slams
    place(buf, riser(0.62), 8.42, 0.34)
    place(buf, riser(0.62), 24.40, 0.40)
    place(buf, riser(0.60), 26.02, 0.30)
    # sparkle on QR
    place(buf, sparkle(), 27.18, 0.8)
    place(buf, sparkle(), 28.35, 0.5)
    # master
    x = buf.copy()
    x = np.tanh(x*1.25)
    x /= max(1e-6, np.max(np.abs(x)))
    x *= 0.92
    n = len(x)
    fade_in = int(0.15*SR); fade_out = int(0.4*SR)
    x[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]**0.7 if x.ndim>1 else np.linspace(0,1,fade_in)
    x[-fade_out:] *= np.linspace(1, 0, fade_out)
    x = x[:int(total*SR)]
    wav_path = os.path.join(OUTDIR, "audio.wav")
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(SR)
        wf.writeframes((x*32767).astype(np.int16).tobytes())
    return wav_path

# ============================================================ 5. RENDER =====
def main():
    global CROPS
    only_audio = "--audio-only" in sys.argv
    CROPS = build_assets()
    print("[1/3] assets ok")
    wav = build_audio()
    print("[2/3] audio ok:", wav)
    if only_audio: return
    mp4 = os.path.join(OUTDIR, "mlbox_promo_30s.mp4")
    enc = subprocess.Popen(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-i", wav,
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
         mp4],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    import time
    t0 = time.time()
    for i in range(N_FRAMES):
        fr = render_scene_frame(i/FPS)
        enc.stdin.write(fr.tobytes())
        if i % 150 == 0:
            print(f"  frame {i}/{N_FRAMES}  ({time.time()-t0:.0f}s)", flush=True)
    enc.stdin.close(); enc.wait()
    print("[3/3] video:", mp4, os.path.getsize(mp4)//1024, "KB")
    # thumbnail + stills for QA
    for name, tt in [("thumb", 9.05), ("still_hook", 2.4), ("still_tok", 8.0),
                     ("still_pg", 14.6), ("still_rec", 19.6), ("still_pr", 24.9), ("still_cta", 28.6)]:
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-ss", str(tt), "-i", mp4,
                        "-frames:v", "1", "-q:v", "3", os.path.join(OUTDIR, f"{name}.jpg")],
                       check=False, capture_output=True)
    print("stills + thumb written")

if __name__ == "__main__":
    main()
