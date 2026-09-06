#!/usr/bin/env python3
"""生成 fastfetch 用的 ANSI 彩色 ASCII logo 文本文件

alpha 预乘(ALPHA_PREMULTIPLY)是白色/彩色 logo 获得边缘层次感的关键:
    rgb' = rgb * alpha/255
白字 logo 的抗锯齿边缘像素会从 255 平滑衰减到 0(灰度渐变),
RAMP 全部档位被用满, 而不是全部饱和到 '@' 的白色平板。

SVG/PNG 无所谓: 只要带透明通道, 预乘就有效(rsvg-convert 转换后同样处理)。
"""
import sys
from PIL import Image

COLS = 40  # 可被第 3 个命令行参数覆盖
GAMMA = 0.25
SAT = 2.0
EDGE_WHITE = False
WHITE_BG_TO_SPACE = False  # 预乘模式下必须关(会误删白色前景)
ALPHA_PREMULTIPLY = True   # 核心: alpha 预乘, 白字 logo 边缘 -> 灰度渐变
ALPHA_CUT = 40             # 低于此 alpha 视为背景; 预乘模式下用 40, 非预乘用 100
FONT = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 20
RAMP = "@%#*+=-:. "

def ramp_index(lum):
    return min(int((255 - lum) / 256 * len(RAMP)), len(RAMP) - 1)

def boost(color, gamma, sat):
    r, g, b = color
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    r = min(255, max(0, lum + (r - lum) * sat))
    g = min(255, max(0, lum + (g - lum) * sat))
    b = min(255, max(0, lum + (b - lum) * sat))
    r = 255 * (r / 255) ** gamma
    g = 255 * (g / 255) ** gamma
    b = 255 * (b / 255) ** gamma
    return (min(255, int(r)), min(255, int(g)), min(255, int(b)))

def main():
    if len(sys.argv) < 2:
        sys.exit("用法: gen_fastfetch_logo.py <image> [out.txt] [cols]")
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/logo.txt"
    COLS = int(sys.argv[3]) if len(sys.argv) > 3 else globals()["COLS"]
    img = Image.open(src)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    elif img.mode == "RGB":
        img = img.convert("RGBA")
    from PIL import ImageFont
    font = ImageFont.truetype(FONT, FONT_SIZE)
    asc, desc = font.getmetrics()
    ch = asc + desc
    cw = font.getlength("M")
    rows = max(1, int(COLS * (img.height / img.width) * (cw / ch)))
    img = img.resize((COLS, rows), Image.LANCZOS)
    px = img.load()

    lines = []
    for r in range(rows):
        cells = []
        for c in range(COLS):
            raw = px[c, r]
            if len(raw) == 4 and raw[3] < ALPHA_CUT:
                cells.append(" ")
                continue
            if ALPHA_PREMULTIPLY and len(raw) == 4:
                # 预乘: 边缘像素按 alpha 衰减 -> 灰度渐变
                a = raw[3]
                raw = (raw[0] * a // 255, raw[1] * a // 255, raw[2] * a // 255)
            else:
                raw = raw[:3]
            if WHITE_BG_TO_SPACE and raw[0] >= 240 and raw[1] >= 240 and raw[2] >= 240:
                cells.append(" ")
                continue
            p = boost(raw, GAMMA, SAT)
            lum = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
            ch_ = RAMP[ramp_index(lum)]
            cells.append(f"\x1b[38;2;{p[0]};{p[1]};{p[2]}m{ch_}")
        # 可选文字覆盖: 默认关闭
        # if r in (rows // 2 - 1, rows // 2):
        #     text = "Sakanaction" if r == rows // 2 - 1 else "834.194"
        #     text_col = (COLS - len(text)) // 2
        #     for i, ch_ in enumerate(text):
        #         cells[text_col + i] = f"\x1b[38;2;255;255;255m{ch_}"
        lines.append("".join(cells) + "\x1b[0m")
    with open(out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{COLS}x{rows} -> {out}")

if __name__ == "__main__":
    main()
