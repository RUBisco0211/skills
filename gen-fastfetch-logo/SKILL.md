---
name: gen-fastfetch-logo
description: "把图片(封面/logo/像素画)转成 ANSI 24-bit 彩色 fastfetch logo，可选 ASCII 疏密阵或半块字符像素画两种风格。Use when converting an image to a fastfetch logo."
version: 1.1.0
author: RUBisco0211
license: MIT
dependencies: [pillow]
platforms: [macos, linux]
---

# gen-fastfetch-logo: 图片 → fastfetch 彩色 logo

把任意图片（专辑封面、logo、像素画等）转成 ANSI 24-bit 彩色 logo，生成 `logo_<name>.txt` 并配置到 fastfetch。

**两种风格，第 3 步必须询问用户选哪种**：

| | ASCII 疏密阵 | 像素画（半块字符） |
|---|---|---|
| 原理 | 1 字符 = 1 采样点，字符疏密 + 颜色共同表达明暗 | 1 字符 = **2 个竖直堆叠的方形像素**（`▀`/`▄`/`█`），纯颜色表达 |
| 纵向分辨率 | 受字符集限制（RAMP 共 10 档明暗） | **翻倍**，像素画可逐像素无损还原 |
| 适合 | 照片、渐变、插画、线条复杂的 logo | 像素画、卡通角色、纯色块图形 |
| 提亮 | **必须**（`GAMMA=0.25`），否则暗部退化成稀疏字符、形状丢失 | **不要**（保持原色），提亮只压缩色调范围、反而降低对比 |
| 宽度 | 自定（宽幅图常需 60 列） | 原生像素宽度，通常更窄更紧凑 |
| 透明背景 | 靠空格表现 | 半块字符让终端背景透出，任何终端配色都能融 |

ASCII 版另支持：纯字符疏密 / 白色背景清除 / 透明背景清除 / 指定行覆盖居中文字 / gamma-饱和提亮 / 四周 padding。

## 何时用

- 用户想把自己的图片（封面、logo、像素画）作为 fastfetch 的 logo 显示
- 需要生成/重新生成/切换 fastfetch logo 文件

## 环境准备

脚本只依赖 `pillow`。建议用独立临时 venv，避免污染已有 Python 环境：

```bash
python3 -m venv /tmp/asciivenv
/tmp/asciivenv/bin/pip install -q pillow
```

- 若终端会话设了全局 `PYTHONPATH` 导致导入到错误的 PIL，用 `env -u PYTHONPATH <python> ...` 清掉再跑（`pip install` 同理，否则可能误判已装而跳过安装）。
- 运行脚本统一用：`/tmp/asciivenv/bin/python <script>`
- 等宽字体需支持半块字符和 ANSI 彩色（macOS 自带 Menlo 即可）。

## 工作流

### 1. 查图片

```bash
sips -g pixelWidth -g pixelHeight <img>        # 尺寸
# 主色调 + alpha 分布（决定背景处理方式）:
env -u PYTHONPATH /tmp/asciivenv/bin/python -c "
from PIL import Image
from collections import Counter
img = Image.open('<img>'); print('mode:', img.mode, img.size)
img2 = img.convert('RGBA').resize((40,40)); px = img2.load()
acnt=Counter(); ccnt=Counter()
for y in range(40):
  for x in range(40):
    p=px[x,y]; acnt[p[3]//64*64]+=1
    if p[3]>100: ccnt[p[:3]]+=1
print('alpha:', acnt.most_common(3), 'fg:', ccnt.most_common(3))
"
```

- 纯白背景（RGB≈255,255,255 占多数）→ 用 `WHITE_BG_TO_SPACE`
- 透明背景（alpha=0 占多数）→ 用 `ALPHA_BG_TO_SPACE`（脚本默认已开）
- 没有背景 → 关掉两个开关

**顺便探测原生像素块大小**（决定像素风格能否逐像素还原）：

```bash
env -u PYTHONPATH /tmp/asciivenv/bin/python -c "
import sys; sys.path.insert(0, '$HOME/.agents/skills/gen-fastfetch-logo/scripts')
import gen_fastfetch_logo_pixel as G
from PIL import Image
img = Image.open('<img>').convert('RGBA')
k = G.detect_native(img)
print('native block:', k, 'px ->', img.size[0]//k, 'x', img.size[1]//k, 'px')
"
```

- `k >= 2` → 是像素画，像素风格能逐像素还原
- `k == 1` → 不是像素画（或裁切偏移没对齐原生网格）→ 建议引导用户选 ASCII

### 2. 处理 SVG（PIL 不能直接读）

SVG 常带 `fill="currentColor"`，rsvg-convert 默认转成**黑色**（深色终端里看不见）。先替换成白色再转：

```bash
sed 's/fill="currentColor"/fill="#ffffff"/' <src>.svg > /tmp/x_white.svg
rsvg-convert -w 512 -h 512 -o /tmp/x_white.png /tmp/x_white.svg
```

### 3. 询问用户选 ASCII 还是像素（**必做，不要替用户默认**）

用 `ask_user` 询问，把上表的取舍讲清楚：

- **ASCII 疏密阵**：通用性最强，照片/渐变/复杂线条都能处理；形状靠字符档位表达
- **像素画**：像素画/卡通角色还原度极高，能逐像素无损还原，通常更窄；但对非像素画（照片）不适用

### 4a. 生成 ASCII logo

```bash
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/gen_fastfetch_logo.py \
  <image.png> ~/.config/fastfetch/logo_<name>.txt
```

脚本内可调参数（改文件顶部）：

| 参数 | 默认 | 说明 |
|------|------|------|
| `COLS` | 40 | 字符宽度（终端字符高≈宽 2 倍，方形图 40 列 → 20 行）；可用第 3 个命令行参数覆盖，如宽幅 logo 用 60 |
| `GAMMA` | 0.25 | <1 提亮暗部，越小越亮（0.15 很亮 / 0.4 自然） |
| `SAT` | 2.0 | >1 增强饱和度 |
| `ALPHA_PREMULTIPLY` | True | **核心开关**：alpha 预乘 `rgb' = rgb×alpha/255`，白字/彩字 logo 边缘像素变成灰度渐变，RAMP 全部档位用满 → “边缘层次感”（openai 就是这种效果）。**必须搭配 `WHITE_BG_TO_SPACE=False`**（否则白色前景全变空格） |
| `ALPHA_CUT` | 40 | 低于此 alpha 视为背景（预乘模式下用 40，否则边缘细节会被阈值 100 切掉） |
| `WHITE_BG_TO_SPACE` | False | 白色背景(RGB≥240) → 空格；**预乘模式必须关**，白色前景 logo 才会保留 |
| 文字覆盖块 | 注释掉 | 取消注释可指定行居中覆盖白色文字 |

**裁剪空行**：生成后把首尾全空行裁掉，logo 更紧凑（脚本不自动做，见第 5 步命令里的裁剪逻辑）。

**裁剪透明边距**：把 alpha bbox 裁掉能让 logo 更紧凑，但**必须对齐原生网格**（见关键坑 10）——ASCII 版无此限制。

### 4b. 生成像素 logo

```bash
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/gen_fastfetch_logo_pixel.py \
  <image.png> ~/.config/fastfetch/logo_<name>.txt
```

用法：`gen_fastfetch_logo_pixel.py <image> [out.txt] [scale] [gamma] [sat]`

| 参数 | 默认 | 说明 |
|------|------|------|
| `scale` | 1 | 整数放大倍数（最近邻）。1 = 原生分辨率，即已经逐像素无损，放大不增加信息量 |
| `gamma` | 1.0 | **保持 1.0**。像素风格靠颜色表达形状，提亮只会压缩色调范围、降低对比 |
| `sat` | 1.0 | 同上，保持 1.0 |
| `MAX_COLS` | 120 | 脚本内常量。原生宽度超此值时告警并缩小兜底（防非像素画输出上千列） |

脚本会自动探测原生像素块大小（`detect_native`），再从原生网格最近邻采样，因此**像素画能逐像素无损还原**，不做插值。

透明处理：透明半边不打背景色，用对应方向的半块字符让终端背景透出——上半有下半无 → `▀`，反之 → `▄`，上下同色 → `█`，两半都透明 → 空格。

### 5. 预览（必做！让用户先看）

**ASCII 版**——裁掉首尾空行并打印字符阵：

```bash
env -u PYTHONPATH /tmp/asciivenv/bin/python -c "
import re
path = '$HOME/.config/fastfetch/logo_<name>.txt'
lines = open(path).read().splitlines()
def blank(ln): return re.sub(r'\x1b\[[0-9;]*m','',ln).strip()==''
s = next(i for i,l in enumerate(lines) if not blank(l))
e = len(lines)-1 - next(i for i,l in enumerate(reversed(lines)) if not blank(l))
trim = lines[s:e+1]
open(path,'w').write('\n'.join(trim)+'\n')
print(f'{len(lines)}行 -> {len(trim)}行')
for i,l in enumerate(trim):
    print(f'{i:2d} [{re.sub(chr(27)+r\"\[[0-9;]*m\",\"\",l)}]')
"
```

肉眼检查：形状是否可辨、文字是否居中、行数是否合理（20 行内）。

终端工具输出会剥掉 ANSI 颜色码，所以要**渲染成 PNG 才能看到颜色**：

```bash
# ASCII 版：从 ANSI txt 渲染（所见即所得）
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/render_txt_preview.py \
  ~/.config/fastfetch/logo_<name>.txt /tmp/preview.png

# 像素版：从半块字符 txt 渲染（所见即所得）
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/render_pixel_preview.py \
  ~/.config/fastfetch/logo_<name>.txt /tmp/preview.png 30,30,30 4

# 调 gamma/sat 对比用：改 render_ascii_preview.py 底部 __main__ 的 src/out/gamma/sat 后
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/render_ascii_preview.py <image>
```

- **黑字 logo 要先反色**：黑色前景在深色终端看不见。反色后再预乘：
  ```bash
  env -u PYTHONPATH /tmp/asciivenv/bin/python -c "
  from PIL import Image, ImageOps
  img = Image.open('src.png').convert('RGBA')
  r,g,b,a = img.split()
  Image.merge('RGBA', (ImageOps.invert(r), ImageOps.invert(g), ImageOps.invert(b), a)).save('/tmp/x_white.png')
  "
  ```
- **SVG 不决定层次感**：SVG 转 PNG 后同样处理，透明 PNG 就能出预乘渐变效果（github/moonshot 已实测）。SVG 唯一坑是 `fill="currentColor"` 转黑（见第 2 步）。
- **白字 logo 生成后**：边缘应有 `@`→`%`→`#`→`*` 的明暗过渡（5 档左右）；如果只剩纯 `@`，说明预乘没生效（检查 ALPHA_PREMULTIPLY 和 WHITE_BG_TO_SPACE=False）。

### 6. 配置 fastfetch

`~/.config/fastfetch/config.jsonc`（没有就新建）：

```jsonc
{
  "$schema": "https://github.com/fastfetch-cli/fastfetch/raw/master/doc/json_schema.json",
  "logo": {
    "type": "file",
    "source": "~/.config/fastfetch/logo_<name>.txt",
    "padding": { "top": 2, "left": 2, "right": 4 }
  },
  "modules": [ "title", "separator", "os", ... ]
}
```

- `padding` 支持 top/left/right；**没有 bottom**——底部留白就在 txt 文件末尾加空行（通常不需要）。
- ANSI 24-bit 彩色（`\x1b[38;2;R;G;Bm` 与 `\x1b[48;2;R;G;Bm`）fastfetch 自动识别，无需额外配置。
- 换 logo = 只改 `source` 一行，文件保留随时切回。ASCII 和像素两版可各存一个文件，随时切换。

### 7. 验证

```bash
fastfetch | sed 's/\x1b\[[0-9;]*m//g' | head -22   # 去看色字符阵+布局
```

## 关键坑（踩过）

1. **RAMP 映射方向**：`RAMP="@%#*+=-:. "` 索引 0=`@`(最亮)、9=` `(最暗)。映射必须 `idx = int((255-lum)/256*10)`——**亮像素→`@`**。写反了会亮部变空格、暗部变 `@`，图几乎全黑，白边"消失"。
2. **boost 提亮先 clamp**：饱和度增强后某通道可能变负值，负数的 0.75 次方 = 复数 → `int()` 崩溃。必须先 `min(255,max(0,...))` 再算 gamma。
3. **alpha 阈值**：半透明前景（P 模式 PNG 常见 alpha≈192）别用 200 的阈值删，会删掉整个前景。100 安全。
4. **居中文字**：覆盖行文字要**相对整行 40 列绝对居中**：`text_col = (COLS - len(text)) // 2`。如果左侧另有装饰字符（如 `.-=-`），文字起始列仍按绝对居中算，装饰独立占位，否则文字会偏右。
5. **`-l` 不覆盖 type**：config 里 `logo.type: "file"` 时，`fastfetch -l windows` 只改 source 不改 type → 把 `windows` 当文件名找，找不到静默回退默认 macOS logo。要看内置 logo 必须：
   ```bash
   fastfetch -l "Windows 11" --logo-type builtin   # 内置名大小写敏感!
   ```
6. **P 模式图片**：`Image.open` 后先判断 mode，非 RGB/RGBA 先 `.convert("RGBA")`，否则 resize 后取到的 px 是调色板索引。
7. **SVG 黑色填充**：见第 2 步，`fill="currentColor"` 不处理就是黑的。
8. 用户可能手动改过 config（padding 等），patch 前先重读文件。
9. **像素风格不要提亮**：ASCII 版必须提亮（暗部会退化成稀疏字符、形状丢失），但像素版完全靠颜色表达形状，提亮只压缩色调范围。实测同一张像素图：`gamma=1.0` 保留原色对比最好，`gamma=0.25` 反而让深色细节变灰、对比下降。
10. **裁切必须对齐原生网格**：裁 alpha bbox 时，偏移量必须是原生块 `k` 的整数倍，否则网格被破坏，`detect_native` 退化到 `k=1`，输出变成 1:1 全分辨率（实测 45 列暴涨到 180 列）。例如 `k=4` 时裁 `(40,20,220,96)` ✅、裁 `(41,21,221,97)` ❌。
11. **半块字符的透明半边要重置背景色**：上半有下半无 → `▀`，下半有上半无 → `▄`，都必须发 `\x1b[49m` 把背景重置为默认，否则会串上一个格子的背景色。
12. **上下同色用 `█`**：只发一个颜色码，更短，也避免某些字体在半块接缝处露出 1px 线。
13. **预览渲染器把半块画成无缝实心方块**，真实终端在非整数倍行高下 `▀` 上下半块之间可能露出接缝——最终以真终端 `fastfetch` 为准。

## 脚本文件

- `scripts/gen_fastfetch_logo.py` — ASCII 疏密阵生成（默认开 alpha 预乘）
- `scripts/gen_fastfetch_logo_pixel.py` — 像素画生成（半块字符，自动探测原生像素块）
- `scripts/render_ascii_preview.py` — 从源图渲染彩色 PNG 预览（调 gamma/sat 对比用）
- `scripts/render_txt_preview.py` — 从 ASCII txt 渲染彩色 PNG 预览（所见即所得）
- `scripts/render_pixel_preview.py` — 从像素 txt 渲染彩色 PNG 预览（所见即所得）
