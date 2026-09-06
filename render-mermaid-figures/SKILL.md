---
name: render-mermaid-figures
version: 1.0.0
author: RUBisco0211
description: 将 Markdown 文档中的 Mermaid 图表代码渲染为 PNG 图片文件，并把 Mermaid 代码块替换为图片引用。当用户需要把 Markdown 中的 Mermaid 代码转成图片、从已保存的 .mmd 源文件重新生成图片，或为迁移到 Word/手工排版文档做准备时使用。---

# Render Mermaid Figures

Use this skill when a Markdown document contains Mermaid diagrams that should become rendered image files, especially for Word-oriented technical documents where Mermaid code blocks should be replaced by figure references.

## Tooling

This skill includes one reusable script:

```bash
node scripts/render-mermaid-figures.mjs
```

When using the script from outside this skill directory, resolve it relative to the directory that contains this `SKILL.md`. Do not assume a fixed user name, home directory layout, or `.codex` skill path.

For a shell command, set a variable to this skill directory first, then call the script through that variable:

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs"
```

## What The Script Does

The script supports two workflows.

1. Fresh conversion from Markdown:
   - Finds Mermaid code blocks in the Markdown file.
   - Requires a figure caption immediately after each Mermaid block, such as `图 3-XX 分系统架构图`.
   - Writes each Mermaid source to `images/mermaid/source/figure-XX.mmd`.
   - Renders each source file to `images/mermaid/figure-XX.png`.
   - Replaces each Mermaid block in the Markdown file with a Markdown image reference plus the original caption.

2. Regeneration from saved Mermaid source:
   - If the Markdown file no longer contains Mermaid code blocks, reads `images/mermaid/source/figure-XX.mmd`.
   - Re-renders the corresponding `images/mermaid/figure-XX.png`.
   - Leaves the Markdown text unchanged.

## Default Command

From the project directory that contains the Markdown file:

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs"
```

Defaults:

- Markdown file: `doc.md`
- Image directory: `images/mermaid`
- Source directory: `images/mermaid/source`
- Puppeteer config: `puppeteer-config.json`
- Output background: `white`
- Mermaid render width: `1800`
- Scale: `2`

## Common Options

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

Useful flags:

- `--input <path>`: Markdown file to process.
- `--image-dir <path>`: Directory for rendered PNG files.
- `--source-dir <path>`: Directory for saved `.mmd` source files.
- `--config <path>`: Puppeteer config path for `mmdc`.
- `--width <number>`: Mermaid render width.
- `--scale <number>`: Mermaid render scale.
- `--background <color>`: Render background.
- `--caption-prefix <text>`: Caption prefix to recognize after Mermaid blocks. Default is `图 `.
- `--clean`: Remove existing `figure-XX.png` and `figure-XX.mmd` files before extracting fresh Mermaid code blocks.
- `--no-rewrite`: Render figures without modifying the Markdown file.

## Required Tools

The script calls `mmdc`, the Mermaid CLI. Check availability first:

```bash
mmdc --version
```

If `mmdc` is missing, install Mermaid CLI:

```bash
npm install -g @mermaid-js/mermaid-cli
```

If the terminal has network issues and only a small package install is expected, use the user's zsh proxy convention:

```bash
/bin/zsh -lc 'source ~/.zshrc; proxy-on; npm install -g @mermaid-js/mermaid-cli'
```

Before using `proxy-on`, briefly judge whether the command may download large files. If it may download browser binaries, large dependency bundles, archives, models, datasets, images, or videos, tell the user the likely behavior and ask for confirmation first. If it only fetches small text, metadata, API responses, or small files, proceed.

## Puppeteer Config

If the project does not already have `puppeteer-config.json`, create a minimal config:

```json
{
  "args": ["--no-sandbox", "--disable-setuid-sandbox"]
}
```

Some local Mermaid CLI installs require a browser executable path in this config. If rendering fails because Chromium or Chrome cannot start, inspect the error and either install the missing browser dependency or set the executable path in `puppeteer-config.json`.

## Recommended Workflow

1. Inspect the document for Mermaid blocks and captions.
2. Run the script from the project directory.
3. Check that PNG files exist.
4. Check that Markdown image references exist and point to existing files.
5. Visually inspect complex or very wide figures.
6. If a figure layout is poor, edit the corresponding `.mmd` file and rerun the script. Do not put Mermaid code back into the document unless a fresh conversion is needed.

Verification commands:

```bash
MERMAID_FIGURE_SKILL="<path-to-this-skill>"
node "$MERMAID_FIGURE_SKILL/scripts/render-mermaid-figures.mjs"
sips -g pixelWidth -g pixelHeight images/mermaid/figure-*.png
node -e "const fs=require('fs');const d=fs.readFileSync('doc.md','utf8');const r=[...d.matchAll(/!\\[[^\\]]*\\]\\((images\\/mermaid\\/figure-\\d+\\.png)\\)/g)].map(x=>x[1]);console.log({refs:r.length,unique:new Set(r).size,missing:r.filter(x=>!fs.existsSync(x))})"
```
