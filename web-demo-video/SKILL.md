---
name: web-demo-video
version: 1.0.0
author: RUBisco0211
description: 为本地或可访问的 Web Demo 设计讲解流程并录制仅包含浏览器页面的演示视频，生成旁白稿、操作时序、SRT/ASS 字幕，并按用户确认可选使用 Qwen3-TTS 生成旁白。用于“录制网页演示”“给 Demo 做讲解视频”“自动操作并录屏”等请求；不用于普通页面截图或非 Web 应用录制。
---

# Web Demo 演示视频

把一个可运行的 Web Demo 交付为可继续在剪映中编辑的演示素材：视频编排稿、纯浏览器录屏、字幕，以及用户明确需要时的完整旁白音频。

## 产物约定

始终在用户当前项目内使用以下目录，不把生成物写进技能目录：

```text
demo/
├── video-script.md          # 视频讲解与操作编排稿
├── web-demo.mp4             # 仅浏览器页面的演示视频
├── subtitles.srt            # 剪映优先使用
├── subtitles.ass            # 用户需要样式信息时生成
├── narration-<voice>.wav    # 可选，无损完整旁白
├── narration-<voice>.m4a    # 可选，剪辑用旁白
└── tmp/                     # 原始录屏、分段音频、计划与校验报告
```

最终只向用户重点交付 `{cwd}/demo/` 第一层的编排稿、视频、完整音频和字幕。调试日志、原始 WebM、分段音频、时间报告与录屏计划留在 `{cwd}/demo/tmp/`。

## 1. 启动并理解 Demo

1. 阅读项目的 `AGENTS.md`、`package.json`、锁文件和启动说明，确定项目根目录、依赖安装命令、启动命令、默认端口及初始化状态。
2. 依赖缺失时使用项目现有包管理器安装。若 Playwright 浏览器或其他依赖会下载大体积文件，先说明预计下载内容并取得用户确认；优先使用 `playwright-core` 配合系统已有浏览器。
3. 启动 Demo，确认地址可访问且终端没有阻断性错误。
4. 使用 `computer-use` 检查真实页面：按用户会采用的顺序点击、输入、滚动和等待，记录页面入口、状态变化、异步耗时、可恢复的初始状态以及占位按钮。若该技能可用，先读取它的说明再操作。
5. 将需求拆成若干可讲清楚的演示流程。每个流程必须有可见入口、关键操作、可验证结果和重置方法。

完成条件：Demo 可重复启动；关键流程已经亲自走通；所有会改变状态或需要长时间等待的操作都有记录。

## 2. 编写视频讲解与操作编排稿

先阅读示例 [references/example-video-script.md](references/example-video-script.md)，再按 [references/video-script-template.md](references/video-script-template.md) 写入当前项目的 `demo/video-script.md`。

编排稿必须满足：

- 章节标题严格使用 `## HH:MM—HH:MM　章节名`，供后续脚本解析。
- 每章至少包含 `**画面操作**` 和 `**旁白**`。
- 默认两段旁白之间留 3～5 秒。使用 `**段后停顿**：4 秒` 明确停顿；只有加载、运算、动画或需要观察复杂画面时才设置更长停顿，并在画面操作中说明原因。
- 旁白字数应与可用时长匹配。中文科技讲解可先按每秒约 3.5～4.2 个汉字估算，再根据试听微调；优先改文稿，不用极端加速或拖慢语音填满时间。
- 旁白和页面操作逐句对应。关键操作通常在相应旁白开始后 0.2～0.8 秒发生。
- 区分 Demo、Mock 数据、占位功能与已实现能力，避免把原型表述成生产系统。
- 文末必须有“旁白与操作时序校准表”，至少列出时间点、旁白提示、页面操作和完成条件。

完成条件：最后一个章节终点就是视频总时长；每个关键页面操作都能在校准表中找到；默认段间停顿落在 3～5 秒内。

## 3. 编写并验证录屏操作计划

阅读 [references/recording-plan.md](references/recording-plan.md)，把 [assets/recording-plan.example.json](assets/recording-plan.example.json) 复制为当前项目的 `demo/tmp/recording-plan.json`，然后替换成该 Demo 的地址、启动方式、预演动作、选择器和绝对时间点。

使用语义定位器（角色、可访问名称、文本、标签、测试 ID）定位控件。坐标只用于显示鼠标指示圈，不作为控件定位依据。动态状态必须用 `preflight` 恢复；异步结果用可见元素作为等待条件。

录屏脚本是 [scripts/record-web-demo.mjs](scripts/record-web-demo.mjs)。它只录制 Playwright 页面视口，不录桌面、菜单栏、终端或其他窗口；它不包含 Edge、Apple 或其他系统语音合成逻辑。

先运行快速检查：

```bash
node scripts/record-web-demo.mjs --project <项目绝对路径> --smoke
```

快速检查通过后再正式录制：

```bash
node scripts/record-web-demo.mjs --project <项目绝对路径>
```

长视频录制前必须完成 smoke。否则一个错误选择器或初始状态会浪费整段录制时间。正式录制结束后检查 `demo/tmp/recording-report.json` 中每个操作的 `lateBy`，明显迟到的操作要修正计划后重录。

完成条件：smoke 覆盖所有计划操作；最终 MP4 只包含项目页面；时长与编排稿一致；开头、中段、结尾抽帧均为预期页面；FFmpeg 全片解码无错误。

## 4. 生成并复核字幕

使用 [scripts/generate-subtitles.mjs](scripts/generate-subtitles.mjs)：

```bash
node scripts/generate-subtitles.mjs --project <项目绝对路径> --format both
```

有 Qwen 旁白时，脚本自动读取 `demo/tmp/narration-timing.json`；没有旁白时，按章节时间和“段后停顿”估算字幕时间。SRT 用于剪映，ASS 用于需要保留基础样式的工具。

脚本会自动清理每条字幕开头的孤立标点，以及结尾无意义的逗号、分号、冒号、连接号和未闭合开引号，并把结果写入 `demo/subtitles.srt` / `demo/subtitles.ass`。生成后仍须人工复核：

1. 查看 `demo/tmp/subtitle-check.json`，处理错误和时长警告。
2. 阅读 SRT 的开头、结尾和每个章节交界处。
3. 搜索专业术语、缩写、数字、单位和引号，确认没有拆词或错误标点。
4. 确认字幕不重叠、不越过视频总时长，短字幕不闪烁。

字幕来自最终旁白稿和时间报告，不使用自动语音识别作为首选，以免专业术语被误识别。

完成条件：校验报告没有错误；字幕前后没有无用标点；专业术语和数字已人工检查；SRT 能被剪映专业版导入。

## 5. 可选：使用 Qwen3-TTS 生成旁白

只有用户明确需要旁白时才进入本步骤。调用付费接口前，必须询问用户使用什么音色；如果用户没有偏好，推荐 `Neil`，但仍要等用户确认。可先用以下命令列出音色，这一步不调用 API：

```bash
node scripts/generate-qwen-narration.mjs --list-voices
```

用户选定音色后，只生成第一句或用户指定的一小段试听：

```bash
node scripts/generate-qwen-narration.mjs --project <项目绝对路径> --sample --voice Neil --text "第一句旁白"
```

让用户试听确认后，才生成完整音轨：

```bash
node scripts/generate-qwen-narration.mjs --project <项目绝对路径> --all --voice Neil --resume
```

脚本 [scripts/generate-qwen-narration.mjs](scripts/generate-qwen-narration.mjs) 默认从技能根目录的 [.env](.env) 读取 `DASHSCOPE_API_KEY`。该文件只供脚本加载：不要展示内容，不要复制进项目或 `demo/`，不要提交到版本库。

Qwen3-TTS 的风格指令和中文文本共享输入限制，因此脚本把长段安全切成最多 220 字的自然句块。`--resume` 会比较文稿、音色、模型与风格指令的内容哈希，只复用完全匹配的分段，避免重复计费或错误复用旧音频。遇到欠费、权限、限额或参数错误时立即停止，保留请求 ID 和已完成分段；不要循环重试。

完整生成后检查 `demo/tmp/narration-timing.json`：

- 没有显式长操作时，`gapToNext` 应为 3～5 秒。
- 需要超过 1.15 倍语速的章节应先缩短旁白或延长章节，不强行加速。
- 旁白明显短于章节时应补充有效讲解内容；不要用拖腔填时长。
- 修改旁白后可再次使用 `--resume`，内容哈希会只重做变化章节。

完成条件：用户已确认音色和试听；完整 WAV/M4A 时长与视频一致；每段发声不越过章节；非长操作段的停顿为 3～5 秒；音频可完整解码。

## 6. 最终校验与交付

1. 用 `ffprobe` 比较视频、完整音频与编排稿总时长。
2. 用 FFmpeg 解码整段视频和音频，确认没有损坏。
3. 抽查开头、中段、章节切换和结尾，核对旁白、操作和字幕。
4. 检查 `demo/` 第一层只放最终可交付文件，临时文件都在 `demo/tmp/`。
5. 向用户列出每个最终文件的绝对路径，并说明字幕可在剪映中继续调整样式和时间。

完成条件：用户可直接把 `web-demo.mp4`、`subtitles.srt` 和可选 `narration-<voice>.m4a` 导入剪映；所有时间线从 00:00 对齐且总时长一致。
