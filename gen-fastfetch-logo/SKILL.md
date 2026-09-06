---
name: gen-fastfetch-logo
description: "把图片(封面/logo)转成 ANSI 彩色 ASCII 字符阵并配置为 fastfetch logo。Use when converting an image to fastfetch logo."
version: 1.0.0
author: RUBisco0211
license: MIT
dependencies: [pillow, chafa]
platforms: [macos, linux]
---

# gen-fastfetch-logo: 图片 → fastfetch ANSI logo

把任意图片（专辑封面、AI 公司 logo 等）转成 ANSI 24-bit 彩色 ASCII 字符阵，生成 `logo_<name>.txt` 并配置到 fastfetch。支持：纯字符疏密 / 彩色字符 / 白色背景清除 / 透明背景清除 / 指定行覆盖居中文字 / gamma-饱和提亮 / 四周 padding。

## 何时用

- 用户想把自己的图片（封面、logo）作为 fastfetch 的 logo 显示
- 需要生成/重新生成/切换 fastfetch logo 文件

## 环境准备

依赖 `pillow`（PNG 渲染另需 `chafa`）。建议用独立临时 venv，避免污染已有 Python 环境：

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

### 2. 处理 SVG（PIL 不能直接读）

SVG 常带 `fill="currentColor"`，rsvg-convert 默认转成**黑色**（深色终端里看不见）。先替换成白色再转：

```bash
sed 's/fill="currentColor"/fill="#ffffff"/' <src>.svg > /tmp/x_white.svg
rsvg-convert -w 512 -h 512 -o /tmp/x_white.png /tmp/x_white.svg
```

### 3. 生成 logo 文件

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

**裁剪空行**：生成后把首尾全空行裁掉，logo 更紧凑（脚本不自动做，见第 4 步命令里的裁剪逻辑）。

### 4. 预览字符阵（必做！用户要求自己先看）

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

- **黑字 logo 要先反色**：黑色前景在深色终端看不见。反色后再预乘（如 nousresearch）：
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

### 5. 渲染彩色 PNG 预览（可选，聊天里看颜色）

终端工具输出会剥掉 ANSI 颜色码，两种预览：

```bash
# 从源图渲染（调 gamma/sat 对比用）: 改脚本底部 __main__ 的 src/out/gamma/sat，然后:
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/render_ascii_preview.py <image>

# 从 ANSI txt 渲染（所见即所得，终端显示的就是这个）:
env -u PYTHONPATH /tmp/asciivenv/bin/python \
  ~/.agents/skills/gen-fastfetch-logo/scripts/render_txt_preview.py ~/.config/fastfetch/logo_<name>.txt /tmp/preview.png

# 输出 PNG 供对比预览
```

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
- ANSI 24-bit 彩色（`\x1b[38;2;R;G;Bm`）fastfetch 自动识别，无需额外配置。
- 换 logo = 只改 `source` 一行，文件保留随时切回。

### 7. 验证

```bash
fastfetch | sed 's/\x1b\[[0-9;]*m//g' | head -22   # 看去色字符阵+布局
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

## 脚本文件

- `scripts/gen_fastfetch_logo.py` — 生成 ANSI txt（生产用，默认开 alpha 预乘）
- `scripts/render_ascii_preview.py` — 从源图渲染彩色 PNG 预览（调参对比用）
- `scripts/render_txt_preview.py` — 从 ANSI txt 渲染彩色 PNG 预览（所见即所得）
