---
name: video-summary
description: 从视频链接（YouTube、Bilibili 等）下载视频文件，使用本地 whisper 模型提取音频文本，校对领域概念后整理为 Obsidian Markdown 笔记。当用户要求总结、转写、整理视频内容，或从视频链接生成笔记时使用此 skill。
version: 1.0.0
author: RUBisco0211
---

# Video Summary

从用户给出的视频链接开始，下载视频 → 提取音频文本 → 校对 → 生成 Obsidian Markdown 笔记 的完整工作流。

## 环境与工具

本机已安装以下工具，先确认可用性：

| 工具 | 路径 | 用途 |
|------|------|------|
| yt-dlp | `/opt/homebrew/bin/yt-dlp` | 下载视频 |
| whisper-cli | `/opt/homebrew/bin/whisper-cli` | 音频转文本（whisper.cpp 版） |
| ffmpeg | `/opt/homebrew/bin/ffmpeg` | 从视频提取/转换音频 |
| whisper 模型（默认） | `~/Documents/Models/openai-whisper/ggml-medium-q5_0.bin` | medium 量化版（514M），中文识别准确率明显高于 small |
| whisper 模型（备选） | `~/Documents/Models/openai-whisper/ggml-small.bin` | small（465M），速度快但误听多，仅作快速备选 |

```bash
command -v yt-dlp && command -v whisper-cli && command -v ffmpeg
ls -lh "$HOME/Documents/Models/openai-whisper/"
```

> whisper-cli（whisper.cpp）仅支持 `flac / mp3 / ogg / wav` 四种音频格式，且默认语言为 `en`，中文视频必须显式指定 `-l auto` 或 `-l zh`。

## 工作流

整体流程 4 步，**第 1 步先探测视频资源类型，选最省事、文本质量最高的来源**：优先字幕（原字幕 > CC 自动字幕），其次仅音频，视频本体只按需下载。

```
当前工作目录/
├── 路径 A（有字幕）：
│   └── <视频标题>.<lang>.srt/vtt/json   # 第 1 步：yt-dlp 下载的原字幕/CC 字幕
├── 路径 B（无字幕，仅音频）：
│   ├── audio_<视频标题>.mp3             # 第 1 步：yt-dlp 直接下载的音频
│   └── transcript_<视频标题>.txt/.json  # 第 2 步：whisper-cli 转写
├── 路径 C（需完整视频）：
│   └── <视频标题>.mp4                   # 第 1 步：完整视频（仅用户需要时）
├── 校对稿_<视频标题>.md                 # 第 3 步（强制）：校对修正后的文字稿
└── <视频标题>-笔记.md                   # 第 4 步：基于校对稿生成的最终 Obsidian 笔记
```

> **第 3 步校对本为强制步骤**：无论文字稿来自字幕还是 whisper 转写（CC 自动字幕同样有错字漏字），都不得跳过校对直接用原始文本生成笔记。

### 第 1 步：探测资源类型并下载（yt-dlp）

默认下载到**用户当前的工作目录**（即 agent 启动时的 cwd，不要下载到别处）。先用 `--list-subs` 探测是否有字幕：

```bash
yt-dlp --no-playlist --list-subs "<用户给出的链接>" 2>&1 | grep -A 20 "Available subtitles"
```

> `danmaku`（弹幕）不是语音字幕，忽略；只有出现 `zh-Hans`、`zh`、`en` 等语言条目才算有字幕。

**路径 A：有字幕 → 直接下载字幕（首选，文本质量最高）**

```bash
yt-dlp --no-playlist -P "$PWD" -o "%(title)s.%(ext)s" \
  --skip-download \
  --write-subs --write-auto-subs \
  --sub-langs "zh-Hans,zh-CN,zh,en" \
  "<用户给出的链接>"
```

生成 `zh-Hans` 等字幕文件（srt/vtt/json）。原字幕（手动字幕）准确率高；只有 CC 自动字幕时也能用，但同样需要第 3 步校对。

**路径 B：无字幕 → 直接下载仅音频（比下载视频省流量、免转码）**

```bash
yt-dlp --no-playlist -P "$PWD" -o "audio_%(title)s.%(ext)s" \
  -f "ba" -x --audio-format mp3 \
  "<用户给出的链接>"
```

直接得到 `audio_<视频标题>.mp3`（whisper-cli 原生支持 mp3，无需 ffmpeg）。

**路径 C：用户需要完整视频文件时才下载视频**

```bash
yt-dlp --no-playlist \
  -P "$PWD" \
  -o "%(title)s.%(ext)s" \
  --merge-output-format mp4 \
  "<用户给出的链接>"
```

- `--no-playlist`：链接指向播放列表/合集中某视频时只下载单个视频
- `--merge-output-format mp4`：分离的音视频流合并为 mp4
- 若链接是播放列表且用户明确要求下载整个列表，则去掉 `--no-playlist`

**网络失败时开启代理**：yt-dlp 下载报网络错误（如 `Unable to download webpage`、超时、403 等）时，复用 `~/.zshrc` 中的 `proxy-on` 函数开启代理（代理地址 `http://127.0.0.1:7890`）：

```bash
# 从 ~/.zshrc 中取出并执行 proxy-on 函数定义
eval "$(sed -n '/^function proxy-on/,/^}/p' "$HOME/.zshrc")"
proxy-on

# 验证代理是否生效
curl -sI --connect-timeout 10 https://www.google.com | head -1
```

开启代理后重新执行下载命令。若代理开启后仍然失败，反馈错误信息给用户，不要反复重试。下载完成后用 `ls -lh` 确认文件已落到工作目录。

### 第 2 步：生成文字稿（字幕直接转换 / whisper 转写）

**路径 A：有字幕 → 把字幕转成纯文本文字稿**

srt/vtt 字幕需要去掉序号与时间轴，只保留文本；用 python 脚本处理（含弹幕/头信息过滤，优先中文字幕文件）：

```bash
python3 - <<'EOF'
import re, glob

def subtitle_to_text(path):
    with open(path, encoding='utf-8') as f:
        text = f.read()
    lines = []
    for ln in re.split(r'\n+', text):
        ln = ln.strip()
        if re.match(r'^\d+$', ln) \
           or re.match(r'^[\d:,.\.\s]+-->[\d:,.\.\s]+$', ln) \
           or ln.startswith(('WEBVTT', 'Kind:', 'Language:', 'NOTE')):
            continue
        if ln:
            lines.append(ln)
    return '\n'.join(lines)

files = sorted(glob.glob('*.srt') + glob.glob('*.vtt'),
               key=lambda p: 0 if 'zh' in p.lower() else 1)
if files:
    print(subtitle_to_text(files[0]))
EOF
```

将输出保存为 `transcript_<视频标题>.txt` 作为第 3 步校对的输入。若下载到的是 bilibili 的 JSON 字幕，结构为 `{body: [{content, from, to}]}`，提取所有 `content` 字段拼接即可。

**路径 B：无字幕 → whisper-cli 转写 mp3**（whisper.cpp 原生支持 mp3，无需 ffmpeg）

```bash
whisper-cli -m "$HOME/Documents/Models/openai-whisper/ggml-medium-q5_0.bin" \
  -f "audio_<视频标题>.mp3" \
  -l auto \
  -ml 60 \
  -pp \
  -otxt -oj \
  -of "transcript_<视频标题>"
```

参数说明：

| 参数 | 作用 |
|------|------|
| `-m` | 指定本地模型，默认 `~/Documents/Models/openai-whisper/ggml-medium-q5_0.bin`；追求速度可换 `ggml-small.bin` |
| `-f` | 输入音频文件（支持 mp3 / wav / flac / ogg） |
| `-l auto` | 自动检测语言；若已知语言（如中文）可改 `-l zh`，**不要留默认值 en** |
| `-ml 60` | 每段最大字符数的安全上限，防止极端长句撑爆一段（实测通常不触发）。中文可设 40-80，英文可更大。真正决定分段粒度的是时间戳边界机制，见下方注意 |
| `-pp` | 打印转写进度 |
| `-otxt` | 输出 `.txt` 纯文本（每段一行，**不含时间戳**） |
| `-oj` | 输出 `.json` 分段结果（含每段时间戳与文本，粒度与 txt 一致，校对与定位时可参考） |
| `-of` | 输出文件前缀，实际生成 `transcript_<视频标题>.txt` 和 `.json` |

> 注意：**不要加 `-nt`（no timestamps）**。whisper 的分段机制依赖模型预测的时间戳 token 来标记话语边界（停顿/句子结束处），`-nt` 会禁用这一机制，解码器退化为按 30 秒处理窗口整段输出——实测同一音频带 `-nt` 只有 16 段（每段约 30 秒、拼十几句），去掉后是 203 个停顿级分段（平均 14 字）。JSON 时间戳字段为 `timestamps.from/to`（SRT 格式字符串）与 `offsets.from/to`（毫秒）。

文字稿生成后读取 `transcript_<视频标题>.txt` 全文确认内容完整；`transcript_<视频标题>.json`（whisper 路径）为句子级分段，可据此快速定位某句话在视频中的位置，也可检查是否有大段空白（无语音片段）。若用户只需要笔记而不需要保留中间产物，字幕/音频/视频文件可询问用户是否删除。

### 第 3 步：校对转写文本（强制，不可跳过）

文字稿无论来自 whisper 转写还是字幕，都可能包含错误：whisper 有中英混说、同音字、专有名词误听；CC 自动字幕同样有错字漏字，B 站原字幕也常缺标点。**必须先逐段校对并产出校对稿，才能进入第 4 步笔记生成**；禁止直接基于原始文字稿生成笔记。校对产出物为 `校对稿_<视频标题>.md`，内容为按转写顺序整理的修正后全文，并附修正说明表（原转写 → 修正 → 原因），供用户复核。

**重点修正与文档/领域相关的具体概念**：

- 领域术语与专有名词：技术词汇、产品/框架名称、论文标题、公司名、人名、缩写（如 "RAG"、"Transformer"、"OpenAI" 被误听成普通词）
- 数字与单位：版本号（v1.5、3.7B）、日期、百分比、型号（M2、GTX 4090）
- 音译/拼音：人名地名音译、中英文混说时的吞音
- 同音字：中文场景下常见的同音错字
- 标点与断句：长句无标点、断句错误影响理解的地方

校对依据：结合视频主题、上下文语义和常识判断，必要时参考 `transcript_<视频标题>.json` 中的分段与时间戳（按 `offsets.from/to` 毫秒定位到具体句子）。**只修正明确是识别错误的内容，不要改写说话人的原意**，不确定的地方保留原文并在给用户的说明中列出。

校对完成后必须产出：

1. `校对稿_<视频标题>.md`：修正后的完整文字稿（按原转写顺序，可加粗标出修正处），末尾附修正说明表
2. 给用户的修正说明：在最终反馈中列出主要修正项（原误听 → 修正），供用户复核

**质量门**：`校对稿_<视频标题>.md` 存在且内容完整，是进入第 4 步的前提。

### 第 4 步：生成 Obsidian Markdown 笔记

**前置条件：第 3 步的校对稿必须已产出**（质量门）。基于 `校对稿_<视频标题>.md` 中的修正后文本整理成结构化笔记，禁止直接使用原始转写内容。保存为 `<视频标题>-笔记.md`（默认放当前工作目录，用户指定了笔记库路径则按用户要求）。格式以本机笔记库 `~/Desktop/Obsidian-Note-Vault` 中的实际笔记风格为基准，遵循以下约定：

**1. Frontmatter（YAML）**

笔记开头写入 Obsidian 自动管理的元数据，标题用中文名：

```yaml
---
title: <视频标题>-笔记
created: 2026-08-02 09:00:00
updated: 2026-08-02 09:00:00
tags:
  - 视频笔记
  - <可选：视频主题标签>
---
```

**2. 标题层级**

- `#` 只允许出现一次，用作整篇笔记的标题（内容与 `title` 一致）；**正文章节一律从 `##` 开始**，子层级依次用 `###`、`####`，不要跳级（如 `##` 下直接接 `####`）。
- 大节之间用 `---` 分隔线隔开。

**3. 列表和标题中禁止出现 emoji**（通篇也不使用），需强调时用 `**粗体**` 或 callout 代替。

**4. 代码块格式**

- 围栏代码块必须带语言标注（与笔记库中 `python` / `bash` / `shell` / `makefile` 等用法一致），便于 Obsidian 高亮与复制按钮；不要用无标注的裸围栏（除非是纯文本）：

````markdown
```python
import whisper
model = whisper.load_model("small")
```
````

- 代码块内注释使用 `#`（Python/shell）或 `//`（C/C++），与正文 Markdown 注释区分开。
- 行内代码、文件名、命令、参数一律用反引号包裹：`yt-dlp`、`-l auto`、`transcript_xxx.txt`。
- 代码块不要嵌在列表项内层过深（Obsidian 渲染容易错位），必要时把代码块移出列表单独放置。

**5. LaTeX 公式格式**

纯音频内容一般不会出现公式，但遇到数学/技术类视频（讲课、论文讲解）里主讲人口述公式或符号时，要按笔记库惯例**忠实重建**：

- 行内公式用 `$...$`，**开闭 `$` 与内容之间不留空格**（如 `$G = (V, E)$`、`$f_\theta$`），与中文正文混排时公式前后留一个空格。
- 块级公式用 `$$...$$` 独立成段，按笔记库惯例在 `$$` 与公式内容之间留空行：

```markdown
$$
\begin{aligned}
\min_x \quad & \frac{1}{2} x^T Q x + c^T x \\
\text{s.t.} \quad & A x \leq b
\end{aligned}
$$

其中 $Q \succeq 0$。
```

- 常用宏写法与笔记库保持一致：实数集 $\mathbb{R}$、矩阵/向量用 `\mathbf` 或直接斜体、`\mathcal{L}` 表示拉格朗日函数、`\nabla_x` 梯度、`\lambda \geq 0`、`\subseteq`、`\rightarrow` 等。
- 转写文本里被误读的公式必须重排为规范 LaTeX（如语音“x 转置 Q x 加 c 转置 x” → `x^T Q x + c^T x`），不要照抄口语。

**6. Callout、表格与链接**

- Callout 用 `> [!类型] 标题` 形式，笔记库中实际出现的类型：`note`、`info`、`tip`、`question`、`important`；内容行以 `>` 开头：

```markdown
> [!info] 视频信息
> - 来源：[视频标题](<原始链接>)
> - 日期：2026-08-02
> - 时长：xx 分钟
```

- 表格用标准管道表格，表头分隔行需对齐：`|------|------|`。
- 长笔记（>4 个章节）在开头加手动目录，锚点链接写法与笔记库一致（中文保留、空格转 `-`、小写）：`[章节名](#章节名)`。
- 标签 `#标签` 写在正文末尾或 frontmatter 的 `tags` 中；笔记间链接用 `[[笔记名]]`，章节锚点用 `[[笔记名#章节]]`。

**推荐的笔记结构：**

```markdown
---
title: <视频标题>-笔记
created: 2026-08-02 09:00:00
updated: 2026-08-02 09:00:00
tags:
  - 视频笔记
---

# <视频标题>

> [!info] 视频信息
> - 来源：[视频标题](<原始链接>)
> - 日期：2026-08-02
> - 时长：xx 分钟

## 核心观点

- ...

---

## 主要内容

### 章节一：xxx

- 要点 1
- 要点 2

### 章节二：xxx

- ...

---

## 关键概念 / 术语表

| 术语 | 解释 |
|------|------|
| ... | ... |

## 金句摘录

> 原文引用...

## 个人思考

- ...
```

**Obsidian 常用语法**（按内容需要选用）：任务列表 `- [ ]` / `- [x]`、块引用 `^blockid`、行内代码、加粗强调。

笔记组织逻辑：先提炼**核心观点**（2-5 条），再按视频的讲述脉络分章节整理**主要内容**，最后补充术语表、金句和可选的个人思考。内容应忠实于原视频，不要编造视频中不存在的信息。

## 常见问题处理

| 情况 | 处理 |
|------|------|
| 下载网络失败 | 启用 `proxy-on` 代理后重试一次，再失败则向用户反馈错误 |
| 视频有字幕 | 走路径 A：`--skip-download --write-subs --write-auto-subs --sub-langs "zh-Hans,zh-CN,zh,en"` 直接下载字幕作为文字稿来源，不必转写 |
| 视频无字幕 | 走路径 B：`-f "ba" -x --audio-format mp3` 下载仅音频后 whisper 转写，避免下载完整视频 |
| 下载的既有视频流又有音频流 | 保留 `--merge-output-format mp4` 合并 |
| 转写语言不确定 | 用 `-l auto` 自动检测 |
| 视频时长很长（>1 小时） | 转写耗时长（medium 约 5-10 倍速于实时），先向用户说明预计时间，`-pp` 展示进度；赶时间可换 small 模型 |
| 用户链接是 Bilibili | yt-dlp 直接支持，无需额外参数；注意 `danmaku` 弹幕不是字幕 |
| 中英混说视频英文术语总被误听（如 chunking→trunking、query→curry） | 这是 whisper 的通病，两个模型都会犯，只能靠第 3 步校对修正；可尝试加 `--prompt "<领域词表>"`（如 `"RAG chunking embedding query rerank LLM"`）注入初始提示，实测对部分英文词有效但效果有限且可能引入新误听，不作为默认 |

## 安装（全局）

本机约定：skill 的**唯一真源**存放在 `~/.agents/skills/`（Agent Skills 标准目录），各 agent 通过软链接引用，改动真源即可同步到所有 agent。

```bash
# 1. 将 SKILL.md 放到全局真源目录
mkdir -p ~/.agents/skills/video-summary
cp SKILL.md ~/.agents/skills/video-summary/SKILL.md

# 2. 为各 agent 建立软链接
ln -sfn ~/.agents/skills/video-summary ~/.pi/agent/skills/video-summary      # pi
ln -sfn ~/.agents/skills/video-summary ~/.claude/skills/video-summary           # Claude Code
ln -sfn ~/.agents/skills/video-summary ~/.cursor/skills/video-summary  # Cursor
ln -sfn ~/.agents/skills/video-summary ~/.codex/skills/video-summary   # Codex

# 3. 验证各 agent 都能读到
for d in ~/.agents ~/.pi/agent/skills ~/.claude/skills ~/.cursor/skills ~/.codex/skills; do
  test -f "$d/video-summary/SKILL.md" && echo "$d OK"
done
```

后续修改只需编辑 `~/.agents/skills/video-summary/SKILL.md`（或仓库中的 SKILL.md 后重新拷贝），无需重复建链。
