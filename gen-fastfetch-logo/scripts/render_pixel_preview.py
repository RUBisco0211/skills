#!/usr/bin/env python3
"""把半块字符像素 logo 渲染成 PNG 预览(所见即所得)

终端工具输出会剥掉 ANSI 颜色码, 所以要渲染成 PNG 才能在聊天里看到颜色。

用法: render_pixel_preview.py <logo.txt> <out.png> [bg_r,g,b] [scale]

    bg_r,g,b  预览底色, 默认 30,30,30(深色终端)
    scale     放大倍数, 默认 4
"""
import re
import sys

from PIL import Image, ImageFont

FONT = "/System/Library/Fonts/Menlo.ttc"
FS = 20
ESC = re.compile(r"(\x1b\[[0-9;]*m)")


def main():
    if len(sys.argv) < 3:
        sys.exit("用法: render_pixel_preview.py <logo.txt> <out.png> [bg_r,g,b] [scale]")
    txt, out = sys.argv[1], sys.argv[2]
    bgc = tuple(int(v) for v in sys.argv[3].split(",")) if len(sys.argv) > 3 else (30, 30, 30)
    sc = int(sys.argv[4]) if len(sys.argv) > 4 else 4

    font = ImageFont.truetype(FONT, FS)
    asc, desc = font.getmetrics()
    ch, cw = asc + desc, int(font.getlength("M"))

    lines = open(txt).read().splitlines()
    ncol = max(len(re.sub(r"\x1b\[[0-9;]*m", "", l)) for l in lines)
    canvas = Image.new("RGB", (ncol * cw * sc, len(lines) * ch * sc), bgc)
    px = canvas.load()

    for r, line in enumerate(lines):
        fg = bg = None
        x = 0
        for part in ESC.split(line):
            if not part:
                continue
            if part.startswith("\x1b["):
                code = part[2:-1]
                if code.startswith("38;2;"):
                    fg = tuple(int(v) for v in code.split(";")[2:5])
                elif code.startswith("48;2;"):
                    bg = tuple(int(v) for v in code.split(";")[2:5])
                elif code == "49":
                    bg = None
                elif code == "39":
                    fg = None
                elif code in ("0", ""):
                    fg = bg = None
                continue
            for glyph in part:
                if glyph == " ":
                    x += 1
                    continue
                if glyph == "\u2588":            # █ 上下同色
                    top = bot = fg
                elif glyph == "\u2580":          # ▀ 上=f g, 下=bg
                    top, bot = fg, bg
                elif glyph == "\u2584":          # ▄ 上=bg, 下=fg
                    top, bot = bg, fg
                else:
                    x += 1
                    continue
                x0, x1 = x * cw * sc, (x + 1) * cw * sc
                y0 = r * ch * sc
                ymid, y1 = y0 + (ch * sc) // 2, (r + 1) * ch * sc
                if top:
                    for yy in range(y0, ymid):
                        for xx in range(x0, x1):
                            px[xx, yy] = top
                if bot:
                    for yy in range(ymid, y1):
                        for xx in range(x0, x1):
                            px[xx, yy] = bot
                x += 1
    canvas.save(out)
    print(f"{len(lines)} rows x {ncol} cols -> {out}")


if __name__ == "__main__":
    main()
