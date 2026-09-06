---
name: pdf2md
description: 使用本地 ~/SelfHosted/MinerU 中的 MinerU CLI 将 PDF 文档自动转换为高质量 Markdown（保留标题层级、LaTeX 公式、表格与图片）。当用户要求把 PDF 转成 markdown、从 PDF 提取文本/公式/表格、转换学术论文或其他 PDF 文档时使用此 skill。无需启动网页服务，CLI 会自动拉起并关闭临时本地 API 进程。
version: 1.1.0
author: RUBisco0211
---

# PDF to Markdown (MinerU)

使用本机 `~/SelfHosted/MinerU` 中的 MinerU（版本 3.2.1）把 PDF（或图片、office 文档）批量转换为结构化的 Markdown 文件，输出包含标题层级、`$$...$$` LaTeX 公式、`![](images/xxx.jpg)` 相对路径图片引用与管道表格。

## 环境与工具

本机已安装 MinerU 3.2.1 及全部模型（离线可用），先确认可用性：

| 工具 | 路径 | 用途 |
|------|------|------|
| mineru CLI | `~/SelfHosted/MinerU/.venv/bin/mineru` | 命令行转换入口（Python venv 内） |
| 模型管理 | `~/SelfHosted/MinerU/.venv/bin/mineru-models-download` | 模型下载/检查（一般不需要） |
| pipeline 模型 | `~/.cache/modelscope/hub/models/OpenDataLab/PDF-Extract-Kit-1.0/` | 版面/OCR/公式/表格模型，已完整缓存 |
| VLM 模型 | `~/.cache/modelscope/hub/models/OpenDataLab/MinerU2.5-Pro-2605-1.2B/` | hybrid/vlm 后端用，已完整缓存 |
| gradio 网页 | `~/SelfHosted/MinerU/start_server.sh` | **不需要**（网页服务，本 skill 不使用） |

```bash
# 环境校验
~/SelfHosted/MinerU/.venv/bin/mineru --version
ls ~/.cache/modelscope/hub/models/OpenDataLab/
```

> **关键 1**：转换必须设置环境变量 `MINERU_MODEL_SOURCE=modelscope`（与 `start_server.sh` 一致），使模型命中本地 modelscope 缓存，避免走 huggingface 下载（本机可能无外网直连）。
>
> **关键 2（MPS 死锁，必须设置）**：必须同时设置 `MINERU_DEVICE_MODE=cpu`。本机是 Apple M2，MinerU 默认走 PyTorch MPS 后端，实测公式识别（MFR）阶段之后、表格识别阶段会**确定性死锁**：Metal command buffer 永远不返回（`waitUntilCompleted` → `_pthread_cond_wait` 永久阻塞），进程既不报错也不退出，转换永远完不成。用 CPU 模式（慢约 2-3 倍但完全可靠）彻底绕开。已用 `sample` 抓栈确认根因，重试不换 CPU 模式无意义。
>
> **无需启动任何服务**：CLI 未指定 `--api-url` 时，会自动在空闲端口拉起一个临时 `mineru-api` 子进程完成转换，结束自动关闭。不要启动 `start_server.sh`（那是 gradio 网页界面）。

## 工作流

整体流程 4 步：确认输入 → 确定输出目录 → 执行转换 → 验证产物。

```
当前工作目录/
└── papers/（或 outputs/，见第 2 步）
    └── <文件名stem>/
        └── auto/
            ├── <文件名stem>.md                  # 主产物：转换后的 Markdown
            ├── <文件名stem>_middle.json         # 结构化中间结果
            ├── <文件名stem>_model.json          # 模型原始输出
            ├── <文件名stem>_content_list.json   # 内容列表
            ├── <文件名stem>_content_list_v2.json
            ├── <文件名stem>_origin.pdf          # 原 PDF 副本
            ├── <文件名stem>_layout.pdf          # 版面框可视化
            ├── <文件名stem>_span.pdf            # span 可视化
            └── images/*.jpg                     # 提取的图片（md 内相对引用）
```

### 第 1 步：确认输入

- 输入可以是**单个 PDF 文件**或**目录**；目录会批量处理其中所有支持的文件（pdf / 图片 png,jpg,jpeg,jp2,webp,gif,bmp,tiff / office docx,pptx,xlsx）。
- 确认文件存在、可读；加密 PDF 无法处理，需先解除密码。
- 批量转换时，若目录中有重名文件（stem 相同），CLI 会自动在 stem 后加 `_1`、`_2` 去重。

### 第 2 步：确定输出目录

- 默认输出到**用户当前工作目录**下的 `papers/`（即 agent 启动时的 cwd，不要放到别处）；用户指定了输出目录则按用户要求。
- 目录名二选一，**优先 `papers/`，冲突时退到 `outputs/`**，决策逻辑：
  1. 当前工作目录下 `papers/` 不存在或为空 → 用 `papers/`
  2. `papers/` 已存在且有其他内容（不是本 skill 的产物，或用途不明）→ 检查 `outputs/`，若 `outputs/` 不存在或为空则用 `outputs/`
  3. 两个目录都已存在且都有内容、无法判断归属时 → 询问用户选哪个（给出两个目录的内容概况）
- 输出目录不存在会自动创建；选定后本次会话内保持一致，避免来回切换。

### 第 3 步：执行转换（核心命令）

转换可能耗时超过单条命令的超时上限，**必须用 nohup 后台运行 + 日志文件，之后轮询日志**，不要前台阻塞等待：

```bash
cd ~/SelfHosted/MinerU && nohup env \
  MINERU_MODEL_SOURCE=modelscope \
  MINERU_DEVICE_MODE=cpu \
  .venv/bin/mineru \
  -p "<输入 PDF 或目录>" \
  -o "<输出目录>" \
  -b pipeline \
  -m auto \
  -l en > /tmp/mineru_<任务名>.log 2>&1 &
echo "pid $!"
```

轮询方式（每次检查都应快速返回，不要让用户干等）：

```bash
# 进程是否还在 + 日志最新进度（tqdm 进度条用 \r 刷新，需 tr 转换后再 tail）
kill -0 <pid> 2>/dev/null && echo RUNNING || echo EXITED
tail -c 500 /tmp/mineru_<任务名>.log | tr '\r' '\n' | tail -3
# 关键判断：日志 mtime 是否还在更新（长时间不动 = 疑似卡死，见常见问题表）
stat -f '%Sm' /tmp/mineru_<任务名>.log
```

参数说明：

| 参数 | 默认 | 作用 |
|------|------|------|
| `-p, --path` | 必填 | 输入文件或目录（支持 pdf/图片/office） |
| `-o, --output` | 必填 | 输出目录 |
| `-b, --backend` | `hybrid-auto-engine` | 解析后端。**本 skill 默认用 `pipeline`**（已验证、快）；复杂版面/扫描件可临时换 `hybrid-auto-engine`（更准但慢，VLM 模型已缓存） |
| `-m, --method` | `auto` | `auto` 自动判断 / `txt` 仅文本提取 / `ocr` 强制 OCR（扫描件、图片型 PDF 用） |
| `-l, --lang` | `ch` | 文档语言，提高 OCR 准确率。中文论文默认 `ch`，英文论文可 `-l en` |
| `-s, --start` | `0` | 起始页（从 0 开始） |
| `-e, --end` | 全部 | 结束页（从 0 开始） |
| `-f, --formula` | `True` | 公式解析开关 |
| `-t, --table` | `True` | 表格解析开关 |
| `--image-analysis` | `True` | 图片/图表分析（仅 VLM/hybrid 后端有效） |

**常用变体**：

- 只转某几页（大 PDF 提速）：追加 `-s 0 -e 5`
- 扫描件/图片型 PDF：`-m ocr`
- 英文论文：`-l en`
- 只要文本不要公式表格：`-f False -t False`（不推荐，默认全开）

> 转换耗时：CPU 模式下，31 页论文 + 500 公式块约 8 分钟；模型加载约 1-2 分钟。进度日志打印在 stderr（tqdm 进度条以 `\r` 刷新）。**转换完成的标志**：进程退出，日志末尾出现 FastAPI 关闭序列 `Application shutdown complete.` / `Finished server process`，且输出目录出现产物文件。注意 pipeline 后端是**全部处理完后才统一写出文件**，转换中输出目录为空属正常。转换中途模型缺失会尝试联网下载，网络不通时走「常见问题」的代理方案。

### 第 4 步：验证产物

转换完成后按以下步骤确认：

```bash
# 1. 主产物 .md 存在且非空
ls -lh "<输出目录>/<文件名stem>/auto/<文件名stem>.md"
wc -l "<输出目录>/<文件名stem>/auto/<文件名stem>.md"

# 2. 图片目录有提取的图片（纯文本 PDF 可能无图）
ls "<输出目录>/<文件名stem>/auto/images/" | head

# 3. 结构总览
ls -R "<输出目录>/<文件名stem>/auto/"
```

**markdown 质量特征**（转换成功且质量好的标志）：
- 标题用 `#` / `##` / `###` 层级
- 公式用 `$$...$$`（块级）与 `$...$`（行内）LaTeX
- 图片用 `![](images/<哈希>.jpg)` 相对路径引用
- 表格用管道表格 `| col | col |`
- 段落、列表、引用块均正常保留

转换失败的常见表现：`<stem>.md` 缺失或接近空、日志出现 `ERROR` / `Traceback`。此时将报错反馈给用户，不要盲目重试。

### 第 5 步：使用产物

- 用户要整理成笔记/入库时，读取 `<stem>.md` 内容按需整理（如写入 Obsidian 笔记库），图片引用保持相对路径随 md 一起移动。
- **用户只要 markdown 时（常见情况），主动清理**中间产物：删除 `auto/` 下 `_middle.json`、`_model.json`、`_content_list*.json`、`_origin.pdf`、`_layout.pdf`、`_span.pdf`，仅保留 `.md` 与 `images/`（这些中间文件约占总体积 95%+）。若转换前用户已说明只要 md，可在验证后直接清理。
- 批量转换后，如需给用户一个总览，列出每个 `<stem>.md` 的路径与大小。

## 常见问题处理

| 情况 | 处理 |
|------|------|
| **进程活着但日志长时间不更新（卡死）** | 大概率是 MPS 死锁（未设 `MINERU_DEVICE_MODE=cpu` 时必现于表格识别阶段）。确认方法：`sample <pid> 3 -file /tmp/s.txt`，若栈中出现 `waitUntilCompleted` + `__psynch_cvwait`（位于 `mps_copy_` 之下）即为死锁。处理：`kill` 掉全部 mineru 相关进程（CLI 主进程、`mineru.cli.fast_api` 子进程、multiprocessing 子进程），加 `MINERU_DEVICE_MODE=cpu` 重跑 |
| 模型下载失败 / 网络报错 | 启用 `~/.zshrc` 中的 `proxy-on` 代理后重试一次，再失败则反馈用户（复用 proxy 用法：`eval "$(sed -n '/^function proxy-on/,/^}/p' "$HOME/.zshrc")"` 然后 `proxy-on`）；确认本地缓存是否完整：`ls ~/.cache/modelscope/hub/models/OpenDataLab/` |
| 扫描件 / 图片型 PDF 转出来乱码 | 改用 `-m ocr` 强制 OCR |
| PDF 太大转得慢 | 用 `-s/-e` 只转需要的页码；`pipeline` 已是最快后端，必要时可让用户确认是否值得等 |
| 内存不足 / 转换中断 | 一次只转一个文件（不要传大目录）；文档太大可分段页码转换 |
| 英文/多语言论文 | `-l en`（或对应语言代码），OCR 准确率更高 |
| 输出目录里同名 PDF | CLI 自动加 `_1`/`_2` 后缀去重，无需手动处理 |
| 转换结果 md 里图片缺失 | 检查 `<stem>.md` 同级的 `images/` 目录是否随 md 一起移动/复制（引用是相对路径） |
| 加密 PDF | 无法直接处理，提示用户先解除密码 |
| `papers/` 与 `outputs/` 都有其他内容，无法判断归属 | 询问用户选哪个目录，并给出两个目录的内容概况 |
