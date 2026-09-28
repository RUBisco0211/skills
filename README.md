# personal-skills

个人 agent skills 仓库

## Skills

| Skill | 说明 |
|---|---|
| [m365-todo](m365-todo/) | 通过 CLI for Microsoft 365 查询和管理个人 Microsoft To Do，支持紧凑 JMESPath/jq 查询 |
| [gen-fastfetch-logo](gen-fastfetch-logo/) | 把图片（封面/logo/像素画）转成 ANSI 彩色 fastfetch logo，可选 ASCII 疏密阵或半块字符像素画两种风格 |
| [auto-paper-beamer](auto-paper-beamer/) | 把 PDF 学术论文自动制作成东南大学 Beamer 演示文稿（流程编排，依赖 pdf2md 和 seu-beamer） |
| [pdf2md](pdf2md/) | 使用本地部署 MinerU CLI 将 PDF 转换为高质量 Markdown（保留标题层级、公式、表格与图片） |
| [seu-beamer](seu-beamer/) | 基于东南大学 Beamer 模板创建、编辑、重构和编译幻灯片 |
| [render-mermaid-figures](render-mermaid-figures/) | 将 Markdown 中的 Mermaid 图表渲染为 PNG 图片并替换代码块 |
| [train-support](train-support/) | 在不改算法逻辑的前提下补全强化学习 / 深度学习项目训练代码的日志、评估、进度、保存等外围功能 |
| [video-summary](video-summary/) | 使用 `yt-dlp` 下载提取视频/音频/字幕，`whisper` 转写并整理为 Obsidian 风格 Markdown 笔记 |
| [web-demo-video](web-demo-video/) | 为网页 Demo 设计讲解流程并录制演示视频，生成旁白稿、字幕与 TTS 旁白，依赖 computer-use |

## 安装

把 skill 软链接到本目录（默认 `~/.agents/skills`，可通过参数指定）：

```bash
./install.sh                 # 链接到 ~/.agents/skills
./install.sh ~/.pi/agent/skills
```
