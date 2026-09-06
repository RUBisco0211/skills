#!/usr/bin/env python3
"""把生成好的 ANSI logo txt 渲染成 PNG 预览(所见即所得)
用法: python render_txt_preview.py <logo.txt> [out.png] [bg_rgb]
"""
import re
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 20
PAD = 10


def main():
    txt = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else txt.rsplit(".", 1)[0] + ".png"
    bg = eval(sys.argv[3]) if len(sys.argv) > 3 else (30, 30, 30)
    lines = open(txt).read().splitlines()
    font = ImageFont.truetype(FONT, FONT_SIZE)
    asc, desc = font.getmetrics()
    ch = asc + desc
    cw = int(font.getlength("M"))
    w = int(len(max(lines, key=len)) * cw) + PAD * 2
    h = len(lines) * ch + PAD * 2
    canvas = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(canvas)
    for r, l in enumerate(lines):
        x = PAD
        # 支持 背景色+前景色 与 纯前景色 两种格式
        for m in re.finditer(r"((?:\x1b\[48;2;\d+;\d+;\d+m)?)\x1b\[38;2;(\d+);(\d+);(\d+)m(.)", l):
            bgc = None
            if m.group(1):
                parts = m.group(1).strip("\x1b[m").split(";")
                bgc = (int(parts[2]), int(parts[3]), int(parts[4]))
            col = (int(m.group(2)), int(m.group(3)), int(m.group(4)))
            if bgc:
                d.rectangle([x, PAD + r * ch, x + cw, PAD + (r + 1) * ch], fill=bgc)
            d.text((x, PAD + r * ch), m.group(5), font=font, fill=col)
            x += cw
    canvas.save(out)
    print(f"{len(lines)}行 -> {out}")


if __name__ == "__main__":
    main()
