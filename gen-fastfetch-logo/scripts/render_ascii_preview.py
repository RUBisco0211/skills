#!/usr/bin/env python3
"""渲染 ASCII 预览图: block(半块彩色) / ascii-mono(黑白字符疏密) / ascii-color(彩色字符)"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 20
RAMP = "@%#*+=-:. "  # 亮 -> 暗（索引 0 最亮）

def ramp_index(lum):
    """亮度 0-255 -> 字符索引: 亮->'@'(0), 暗->' '(9)"""
    return min(int((255 - lum) / 256 * len(RAMP)), len(RAMP) - 1)

def cell_metrics(font):
    asc, desc = font.getmetrics()
    return asc + desc

def boost(color, gamma, sat=1.0):
    """提亮: gamma<1 提亮阴影, sat>1 增强饱和度"""
    r, g, b = color
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    r = min(255, max(0, lum + (r - lum) * sat))
    g = min(255, max(0, lum + (g - lum) * sat))
    b = min(255, max(0, lum + (b - lum) * sat))
    r = 255 * (r / 255) ** gamma
    g = 255 * (g / 255) ** gamma
    b = 255 * (b / 255) ** gamma
    return (min(255, int(r)), min(255, int(g)), min(255, int(b)))

def render(img_path, cols, mode, out_path, gamma=1.0, sat=1.0, edge_white=False):
    img = Image.open(img_path)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    elif img.mode == "RGB":
        img = img.convert("RGBA")
    font = ImageFont.truetype(FONT, FONT_SIZE)
    ch = cell_metrics(font)
    cw = font.getlength("M")
    rows = max(1, int(cols * (img.height / img.width) * (cw / ch)))

    if mode == "block":
        # 半块字符: 每格 = 上/下 2 个像素
        img = img.resize((cols, rows * 2), Image.LANCZOS)
        px = img.load()
    else:
        img = img.resize((cols, rows), Image.LANCZOS)
        px = img.load()

    canvas = Image.new("RGB", (int(cols * cw), int(rows * ch)), (10, 10, 10))
    draw = ImageDraw.Draw(canvas)
    for r in range(rows):
        for c in range(cols):
            x, y = int(c * cw), int(r * ch)
            if mode == "block":
                top, bot = px[c, r * 2], px[c, r * 2 + 1]
                draw.rectangle([x, y, x + cw - 1, y + ch - 1], fill=bot)
                draw.text((x, y), "\u2580", font=font, fill=top)
            else:
                raw = px[c, r]
                if len(raw) == 4:
                    if raw[3] < 100:  # 透明背景 -> 不画
                        continue
                    raw = raw[:3]
                p = raw
                if edge_white and (r == 0 or r == rows - 1 or c == 0 or c == cols - 1):
                    p = (255, 255, 255)
                p = boost(p, gamma, sat)
                lum = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
                ch_ = RAMP[ramp_index(lum)]
                fill = p if mode == "ascii-color" else (235, 235, 235)
                draw.text((x, y), ch_, font=font, fill=fill)
    canvas.save(out_path)
    print(f"{mode}: cols={cols} rows={rows} gamma={gamma} sat={sat} -> {out_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("用法: render_ascii_preview.py <image>")
    src = sys.argv[1]
    render(src, 40, "ascii-color", "/tmp/qw.png", gamma=0.25, sat=2.0)
    render(src, 40, "ascii-color", "/tmp/nb.png", gamma=0.25, sat=2.0)
