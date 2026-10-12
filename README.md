# personal-skills

个人 agent skills 仓库

## Skills

| Skill | 说明 | 可复用性 |
|---|---|---|
| [m365-todo](m365-todo/) | 通过 CLI for Microsoft 365 查询和管理个人 Microsoft To Do，支持紧凑 JMESPath/jq 查询 | 可复用（装 CLI 后按 references/setup-and-migration.md 重新 device-code 登录） |
| [gen-fastfetch-logo](gen-fastfetch-logo/) | 把图片（封面/logo/像素画）转成 ANSI 彩色 fastfetch logo，可选 ASCII 疏密阵或半块字符像素画两种风格 | 可复用（需 `pillow`；会写入本机 fastfetch 配置） |
| [auto-paper-beamer](auto-paper-beamer/) | 把 PDF 学术论文自动制作成东南大学 Beamer 演示文稿（流程编排，依赖 pdf2md 和 seu-beamer） | 依赖本机环境（传递依赖 pdf2md 的本机 MinerU） |
| [pdf2md](pdf2md/) | 使用本地部署 MinerU CLI 将 PDF 转换为高质量 Markdown（保留标题层级、公式、表格与图片） | 依赖本机环境（`~/SelfHosted/MinerU` 与 `~/.cache/modelscope` 本地模型） |
| [seu-beamer](seu-beamer/) | 基于东南大学 Beamer 模板创建、编辑、重构和编译幻灯片 | 可复用（自带模板与字体，需 XeLaTeX） |
| [render-mermaid-figures](render-mermaid-figures/) | 将 Markdown 中的 Mermaid 图表渲染为 PNG 图片并替换代码块 | 可复用（需 Node 与 `@mermaid-js/mermaid-cli`） |
| [train-support](train-support/) | 在不改算法逻辑的前提下补全强化学习 / 深度学习项目训练代码的日志、评估、进度、保存等外围功能 | 可复用（不依赖本机环境，用目标项目自带的 tqdm/wandb） |
| [video-summary](video-summary/) | 使用 `yt-dlp` 下载提取视频/音频/字幕，`whisper` 转写并整理为 Obsidian 风格 Markdown 笔记 | 依赖本机环境（`/opt/homebrew` 工具与 `~/Documents/Models` whisper 模型） |
| [web-demo-video](web-demo-video/) | 为网页 Demo 设计讲解流程并录制演示视频，生成旁白稿、字幕与 TTS 旁白，依赖 computer-use | 可复用（需 Node、Playwright 与 ffmpeg；TTS 旁白需自备 `DASHSCOPE_API_KEY`） |
| [spec-template](spec-template/) | 为 vibe coding / AI 协作项目初始化轻量文档规范体系：`AGENTS.md` 常驻约束、`WORKFLOW.md` 流程总纲、决策索引与正文、调研文档目录 | 可复用（纯模板，无外部依赖） |

可复用性判据：

- **可复用**：只依赖通用工具或库，且换机器时能按 SKILL.md（必要时配合 `references/`）重新装好；技能文档不假定本机已有专属安装。
- **依赖本机环境**：说明文档写死了本机专属路径（`~/SelfHosted`、`~/Documents/Models`、`/opt/homebrew`），或假定本机已部署对应服务、已缓存模型；换机器需先自建这些环境，文档不负责安装。

> 标注为「依赖本机环境」的 skill 仍可复制到新机器，只是 SKILL.md 里的路径、模型缓存和工具位置需要在那边重建；这与 frontmatter 的 `platforms` 不是一回事（`platforms` 表示操作系统支持范围）。

## 安装

把 skill 软链接到本目录（默认 `~/.agents/skills`，可通过参数指定）：

```bash
./install.sh                 # 链接到 ~/.agents/skills
./install.sh ~/.pi/agent/skills
```
