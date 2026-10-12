---
name: render-mermaid-figures
version: 1.0.0
author: RUBisco0211
description: 将 Markdown 文档中的 Mermaid 图表代码渲染为 PNG 图片文件，并把 Mermaid 代码块替换为图片引用。当用户需要把 Markdown 中的 Mermaid 代码转成图片、从已保存的 .mmd 源文件重新生成图片，或为迁移到 Word/手工排版文档做准备时使用。
license: MIT
dependencies: [node, "@mermaid-js/mermaid-cli"]
---

# Mermaid 图渲染

当 Markdown 文档里的 Mermaid 图表需要变成图片文件时使用本 skill，尤其是面向 Word 的技术文档：把 Mermaid 代码块替换为图片引用。

## 工具

本 skill 自带一个可复用脚本：

```bash
node scripts/render-mermaid-figures.mjs
```

在 skill 目录之外调用脚本时，以本 `SKILL.md` 所在目录为基准解析路径。不要假定固定的用户名、home 目录结构或 `.codex` skill 路径。

在 shell 里先把 skill 目录设成变量，再通过变量调用脚本：

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs"
```

## 脚本做什么

脚本支持两条工作流。

1. 从 Markdown 首次转换：
   - 找出 Markdown 文件里的 Mermaid 代码块。
   - 要求每个 Mermaid 代码块紧跟一行图注，例如 `图 3-XX 分系统架构图`。
   - 把每段 Mermaid 源码写入 `images/mermaid/source/figure-XX.mmd`。
   - 把每个源文件渲染为 `images/mermaid/figure-XX.png`。
   - 把 Markdown 里的每个 Mermaid 代码块替换为图片引用加原图注。

2. 从已保存的 Mermaid 源码重新生成：
   - Markdown 文件里已无 Mermaid 代码块时，读取 `images/mermaid/source/figure-XX.mmd`。
   - 重新渲染对应的 `images/mermaid/figure-XX.png`。
   - 不改动 Markdown 正文。

## 默认命令

在存放 Markdown 文件的项目目录中执行：

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs"
```

默认值：

- Markdown 文件：`doc.md`
- 图片目录：`images/mermaid`
- 源码目录：`images/mermaid/source`
- Puppeteer 配置：`puppeteer-config.json`
- 输出背景：`white`
- Mermaid 渲染宽度：`1800`
- 缩放：`2`

## 常用参数

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs" \
  --input doc.md \
  --image-dir images/mermaid \
  --source-dir images/mermaid/source \
  --config puppeteer-config.json \
  --width 1800 \
  --scale 2 \
  --background white
```

参数说明：

- `--input <path>`：要处理的 Markdown 文件。
- `--image-dir <path>`：渲染出的 PNG 目录。
- `--source-dir <path>`：保存 `.mmd` 源码的目录。
- `--config <path>`：传给 `mmdc` 的 Puppeteer 配置路径。
- `--width <number>`：Mermaid 渲染宽度。
- `--scale <number>`：Mermaid 渲染缩放。
- `--background <color>`：渲染背景色。
- `--caption-prefix <text>`：识别 Mermaid 代码块后图注用的前缀，默认 `图 `。
- `--clean`：重新提取 Mermaid 代码前，先删除已有的 `figure-XX.png` 与 `figure-XX.mmd`。
- `--no-rewrite`：只渲染图片，不修改 Markdown 文件。

## 依赖工具

脚本调用 `mmdc`（Mermaid CLI），先确认可用性：

```bash
mmdc --version
```

缺少 `mmdc` 时安装 Mermaid CLI：

```bash
npm install -g @mermaid-js/mermaid-cli
```

终端网络受限、且这次只装一个小包时，沿用用户 zsh 的代理约定：

```bash
/bin/zsh -lc 'source ~/.zshrc; proxy-on; npm install -g @mermaid-js/mermaid-cli'
```

用 `proxy-on` 之前先判断这条命令是否会下载大文件。可能下载浏览器二进制、大型依赖包、压缩包、模型、数据集、图片或视频时，先说明预计行为并取得用户确认；只拉取少量文本、元数据、API 响应或小文件时可直接执行。

## Puppeteer 配置

项目里还没有 `puppeteer-config.json` 时，创建一个最小配置：

```json
{
  "args": ["--no-sandbox", "--disable-setuid-sandbox"]
}
```

部分本机 Mermaid CLI 安装需要在配置里指定浏览器可执行文件路径。若渲染因 Chromium 或 Chrome 无法启动而失败，先看报错：补齐缺失的浏览器依赖，或在 `puppeteer-config.json` 中设置可执行文件路径。

## 推荐流程

1. 检查文档里的 Mermaid 代码块与图注。
2. 在项目目录中运行脚本。
3. 确认 PNG 文件已生成。
4. 确认 Markdown 图片引用存在且指向实际文件。
5. 目视检查复杂或过宽的图。
6. 图布局不佳时，改对应的 `.mmd` 文件后重跑脚本。除非需要重新转换，不要把 Mermaid 代码放回文档。

校验命令：

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs"
sips -g pixelWidth -g pixelHeight images/mermaid/figure-*.png
node -e "const fs=require('fs');const d=fs.readFileSync('doc.md','utf8');const r=[...d.matchAll(/!\\[[^\\]]*\\]\\((images\\/mermaid\\/figure-\\d+\\.png)\\)/g)].map(x=>x[1]);console.log({refs:r.length,unique:new Set(r).size,missing:r.filter(x=>!fs.existsSync(x))})"
```
