#!/usr/bin/env python3
"""用半块字符(▀/▄/█)逐像素渲染 fastfetch logo —— 像素画风格, 而非 ASCII 疏密阵

与 gen_fastfetch_logo.py 的区别
--------------------------------
* ASCII 版: 1 个字符 = 1 个采样点, 用字符疏密 + 颜色共同表达明暗。
* 本脚本: 1 个字符 = **2 个竖直堆叠的方形像素**(半块字符),
  纯用颜色表达, 不做字符疏密映射 -> 真正的像素画观感, 纵向分辨率翻倍。

透明处理
--------
透明半边不打背景色, 而是用对应方向的半块字符让终端背景透出来:
    上半有/下半无 -> ▀ (fg=上, 背景重置为默认)
    下半有/上半无 -> ▄ (fg=下, 背景重置为默认)
    两半同色      -> █ (只发一个颜色码, 更短且不会被字体接缝割开)
    两半都透明    -> 空格

原生分辨率
----------
脚本会自动探测源图的原生像素块大小(最大的 k, 使每个 k x k 块都是单色),
再从原生网格渲染 —— 像素画因此能逐像素无损还原, 不做插值。

**注意**: 探测到 k=1 说明这不是像素画, 或者裁切偏移没对齐原生网格(见 SKILL.md
"裁切必须对齐原生网格")。此时会按 1:1 全分辨率输出, 通常过宽, 靠 MAX_COLS 兜底。

用法
----
    gen_fastfetch_logo_pixel.py <image> [out.txt] [scale] [gamma] [sat]

    scale  整数放大倍数(最近邻), 默认 1 = 原生分辨率
    gamma  默认 1.0 = 原始颜色; <1 提亮暗部
           **像素风格通常不要提亮**: 提亮只压缩色调范围, 反而降低对比
    sat    默认 1.0 = 原始饱和度
"""
import sys

from PIL import Image

BLOCK_MAX = 16          # 原生像素块探测上限
MAX_COLS = 120          # 安全上限: 原生宽度超过此值视为非像素画, 缩到该宽度
FG = "\x1b[38;2;{};{};{}m"
BG = "\x1b[48;2;{};{};{}m"
BG_DEFAULT = "\x1b[49m"
RESET = "\x1b[0m"


def detect_native(img):
    """返回原生像素块大小 k(最大且整个图像在 k x k 上单色)。无则返回 1。"""
    w, h = img.size
    px = img.load()
    best = 1
    for k in range(2, BLOCK_MAX + 1):
        if w % k or h % k:
            continue
        ok = True
        for by in range(0, h, k):
            for bx in range(0, w, k):
                c0 = px[bx, by]
                if any(px[bx + i, by + j] != c0
                       for j in range(k) for i in range(k)):
                    ok = False
                    break
            if not ok:
                break
        if ok:
            best = k
    return best


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
        sys.exit("用法: gen_fastfetch_logo_pixel.py <image> [out.txt] [scale] [gamma] [sat]")
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "/tmp/logo.txt"
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    gamma = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    sat = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0

    raw = Image.open(src)
    if raw.mode != "RGBA":
        raw = raw.convert("RGBA")

    k = detect_native(raw)
    nw, nh = raw.size[0] // k, raw.size[1] // k
    print(f"native block {k}px -> {nw}x{nh} px")
    if k == 1:
        print("warn: 未探测到原生像素网格(没有 >=2px 的单色块) —— 要么这不是像素画,"
              " 要么裁切偏移没对齐原生网格。将按 1:1 全分辨率输出, 通常过宽;"
              " 建议改用 ASCII 风格, 或把裁切对齐到原生块。")
    if nw > MAX_COLS:
        print(f"warn: 原生宽度 {nw} > MAX_COLS {MAX_COLS}, 缩到 {MAX_COLS} 列 "
              f"(要更高保真请调大脚本里的 MAX_COLS)")
        nh = max(1, round(nh * MAX_COLS / nw))
        nw = MAX_COLS

    img = raw.resize((nw, nh), Image.NEAREST)       # 网格对齐时无损
    if scale != 1:
        img = img.resize((nw * scale, nh * scale), Image.NEAREST)

    w, h = img.size
    ident = len({img.getpixel((x, y)) for y in range(h) for x in range(w)})
    print(f"output grid {w}x{h} px -> {w} cols x {(h + 1) // 2} rows, "
          f"distinct colors={ident}")

    def resolve(c):
        """RGBA -> 颜色元组, 或 None 表示透明"""
        if c[3] < 40:
            return None
        return boost(c[:3], gamma, sat) if (gamma != 1.0 or sat != 1.0) else c[:3]

    cell = [[resolve(img.getpixel((x, y))) for x in range(w)] for y in range(h)]

    lines = []
    for cy in range((h + 1) // 2):
        y0, y1 = cy * 2, cy * 2 + 1
        parts = []
        bg_active = False          # 当前是否已设置非默认背景色
        for x in range(w):
            top = cell[y0][x]
            bot = cell[y1][x] if y1 < h else None
            if top is None and bot is None:
                if bg_active:
                    parts.append(BG_DEFAULT)
                    bg_active = False
                parts.append(" ")
            elif top is not None and bot is None:
                parts.append(FG.format(*top))
                if bg_active:
                    parts.append(BG_DEFAULT)
                    bg_active = False
                parts.append("\u2580")             # ▀
            elif top is None and bot is not None:
                parts.append(FG.format(*bot))
                if bg_active:
                    parts.append(BG_DEFAULT)
                    bg_active = False
                parts.append("\u2584")             # ▄
            elif top == bot:
                parts.append(FG.format(*top))
                if bg_active:
                    parts.append(BG_DEFAULT)
                    bg_active = False
                parts.append("\u2588")             # █
            else:
                parts.append(FG.format(*top))
                parts.append(BG.format(*bot))
                bg_active = True
                parts.append("\u2580")             # ▀
        lines.append("".join(parts) + RESET)

    with open(out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
