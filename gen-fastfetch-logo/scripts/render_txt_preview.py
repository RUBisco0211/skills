#!/usr/bin/env python3
"""把生成好的 ANSI logo txt 渲染成 PNG 预览(所见即所得)
用法: python render_txt_preview.py <logo.txt> [out.png] [bg_rgb]

终端工具输出会剥掉 ANSI 颜色码, 所以要看颜色必须渲染成 PNG。
"""
import re
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Menlo.ttc"
FONT_SIZE = 20
PAD = 10
ESC = re.compile(r"(\x1b\[[0-9;]*m)")


def main():
    txt = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else txt.rsplit(".", 1)[0] + ".png"
    bg = eval(sys.argv[3]) if len(sys.argv) > 3 else (30, 30, 30)
    lines = open(txt).read().splitlines()
    font = ImageFont.truetype(FONT, FONT_SIZE)
    asc, desc = font.getmetrics()
    ch = asc + desc
    cw = int(font.getlength("M"))
    # 宽度必须按"去掉 ANSI 后的可见字符数"算。
    # 直接 len(line) 会把每个彩色格约 19 字节的转义码也算成可见字符,
    # 画布宽度虚胖十几倍(实测 1041 字节 vs 60 个可见字符 -> 放大 17.4 倍)。
    ncol = max(len(ESC.sub("", l)) for l in lines)
    w = ncol * cw + PAD * 2
    h = len(lines) * ch + PAD * 2
    canvas = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(canvas)
    for r, l in enumerate(lines):
        x = PAD
        fg = bgc = None
        # 按转义码切分, 维护当前前景/背景色状态
        for part in ESC.split(l):
            if not part:
                continue
            if part.startswith("\x1b["):
                code = part[2:-1]
                if code.startswith("38;2;"):
                    fg = tuple(int(v) for v in code.split(";")[2:5])
                elif code.startswith("48;2;"):
                    bgc = tuple(int(v) for v in code.split(";")[2:5])
                elif code == "49":
                    bgc = None
                elif code == "39":
                    fg = None
                elif code in ("0", ""):
                    fg = bgc = None
                continue
            # 逐个可见字符推进 x。透明格是无色码的裸空格, 也必须推进,
            # 否则后续字形会被挤在一起, 整行图形错位。
            for glyph in part:
                if bgc:
                    d.rectangle([x, PAD + r * ch, x + cw, PAD + (r + 1) * ch], fill=bgc)
                if fg and glyph != " ":
                    d.text((x, PAD + r * ch), glyph, font=font, fill=fg)
                x += cw
    canvas.save(out)
    print(f"{len(lines)}行 x {ncol}列 -> {out}")


if __name__ == "__main__":
    main()
