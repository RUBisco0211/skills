---
name: seu-beamer
version: 1.0.0
author: RUBisco0211
description: 基于 SEU_BeamerTemplate.tex 模板创建、编辑、重构和校验东南大学 Beamer 幻灯片。当需要处理 SEU Beamer .tex 演示文稿、中文/XeLaTeX Beamer 幻灯片、seu.sty 主题资源、幻灯片大纲、报告转幻灯片、frame 版式整理、Beamer 中的图片/表格/公式、图片转 PDF 并放入 figures 目录，或编译校验 SEU_BeamerTemplate.tex 时使用本 skill。
---

# SEU Beamer

## 概述

使用本 skill 创建或修改遵循模板结构与 `seu.sty` 主题的 SEU Beamer 演示文稿。本 skill 自带一套可直接复制的完整模板资源（`templates/`），包含主题文件、背景图、字体、编译脚本和入口 `.tex`，因此可以在任意空目录中从零搭建新 deck，无需依赖已有仓库。

本文档同时总结了 `SEU_BeamerTemplate.tex` 的通用编写方式（骨架、首页信息、章节、版式、图片/表格/公式、编译与检查清单），与具体报告主题无关。

## 模板资源（templates/）

`templates/` 目录是完整可用的 SEU Beamer 模板，新建项目时整体复制到项目根目录：

```text
templates/
├── SEU_BeamerTemplate.tex   # 入口文件（含标题页、目录页、章节骨架、结束页）
├── seu.sty                  # 主题：背景、颜色、页眉页脚、标题样式
├── source/                  # seu_background.png、seu_logo.png、seu_title.png
├── fonts/                   # Helvetica 字体（\setsansfont[Path=fonts/] 依赖）
├── make.sh / make.bat       # 编译脚本（Windows / Mac・Linux）
└── Makefile                 # make SEU_BeamerTemplate
```

复制后保持相对路径不变（`seu.sty`、`source/`、`fonts/` 均以相对路径引用），并使用 XeLaTeX 编译以支持中文与自定义字体。

## 默认样式约定（内置在模板中）

入口模板的导言区已内置以下样式，新建 deck 时默认保留、无需重复设置：

- 正文、block、列表统一使用 `\footnotesize`，子列表 `\scriptsize`；标题页、章节页与 frame 标题保持主题默认字号。
- 展示公式（equation/align 等）统一缩小一级，行内公式保持正文大小。
- block 为"无边框的标题 + 正文"结构（自定义 `block begin/end`），不再使用默认圆角边框。
- 关闭页脚（`\setbeamertemplate{footline}{}`），页码等页脚信息不显示。
- 提供 `\imageplaceholder[高度]{说明文字}` 命令，图片未就绪时输出统一的灰色占位框。
- 每个有编号章节开始时自动插入当前章节目录页（`\AtBeginSection`）。

## 文档骨架

```latex
\documentclass[10pt,aspectratio=43,mathserif]{beamer}

\usepackage{seu}
\usepackage{xeCJK}
\usepackage{amsmath,amsfonts,amssymb,bm}
\usepackage{color}
\usepackage{graphicx,hyperref,url}
\usepackage{etoolbox}

\setsansfont[Path=fonts/]{Helvetica}
\beamertemplateballitem
\setbeamertemplate{footline}{}

% 正文/block/列表统一 footnotesize，子列表 scriptsize
% 展示公式缩小一级，block 无边框，\imageplaceholder 占位等
% （完整导言区以 templates/SEU_BeamerTemplate.tex 为准）

\AtBeginSection[]
{
  \begin{frame}<beamer>
    \frametitle{\textbf{目录}}
    \textbf{\tableofcontents[currentsection]}
  \end{frame}
}

\title[短标题]{\fontsize{13pt}{18pt}\selectfont 完整标题}
\author[短作者]{作者甲, 作者乙 \\ \medskip}
\institute[短机构]{完整机构名}
\date[\today]{\today}

\begin{document}

\begin{frame}
  \titlepage
\end{frame}

\section*{目录}
\begin{frame}
  \frametitle{\textbf{目录}}
  \textbf{\tableofcontents}
\end{frame}

\section{第一部分}
% 内容页

\section{第二部分}
% 内容页

\section*{}
% 结束页

\end{document}
```

模板默认使用 `aspectratio=43`，即 4:3 页面比例。若改为 `aspectratio=169`，需要重新检查图片尺寸和分栏宽度。

## 首页信息

```latex
\title[页脚短标题]{\fontsize{13pt}{18pt}\selectfont 完整报告标题}
\author[页脚短作者]{作者甲, 作者乙 \\ \medskip}
\institute[短机构名]{完整机构名}
\date[\today]{\today}
```

- 方括号中的短版本用于页眉或页脚，应保持简短。
- 花括号中的完整版本显示在标题页。
- 长标题可用 `\fontsize{13pt}{18pt}\selectfont` 调整字号和行距。
- 作者或机构需要换行时使用 `\\`。

## 章节与目录

```latex
\section[导航短标题]{章节完整标题}
```

- `\section{标题}`：导航栏和目录显示相同标题。
- `\section[短标题]{完整标题}`：顶部导航显示短标题，目录显示完整标题。
- `\section*{目录}` 和 `\section*{}`：创建不编号章节，适合目录页和结束页。
- 模板中的 `\AtBeginSection` 会在每个有编号章节开始时自动插入当前章节目录页。
- 章节宜控制在 3 至 6 个；标题过长或章节过多会挤占顶部导航空间。

## 页面 Frame

```latex
\begin{frame}
  \frametitle{\textbf{页面标题}}
  页面内容
\end{frame}
```

- 页面标题通常不超过一行。
- 每页正文建议控制在 3 至 6 个要点。
- 必要时仅在局部使用 `\small`、`\footnotesize` 或 `\scriptsize`。
- 同一章节内页面标题可以重复，但内容应有清晰递进。

## 常用页面版式

### 1. 项目列表

```latex
\begin{itemize}
  \item 第一条内容
  \item \textbf{关键词}：对应说明
  \item 第三条内容
\end{itemize}
```

有明确顺序时使用：

```latex
\begin{enumerate}
  \item 第一步
  \item 第二步
  \item 第三步
\end{enumerate}
```

### 2. 内容块

```latex
\begin{block}{\textbf{核心概念}}
  \begin{itemize}
    \item 要点一
    \item 要点二
  \end{itemize}
\end{block}
```

同一页通常放置一至两个块。块标题应概括内容，而不是重复页面标题。

### 3. 双栏图文

```latex
\begin{columns}
  \column{.48\textwidth}
  \footnotesize
  \begin{itemize}
    \item 左侧说明
    \item 左侧说明
  \end{itemize}

  \column{.48\textwidth}
  \begin{figure}
    \centering
    \includegraphics[width=\textwidth]{figures/example.pdf}
    \caption{示例图片}
    \label{fig:example}
  \end{figure}
\end{columns}
```

- 各列宽度总和应小于 `\textwidth`，为列间距留出空间。
- 常用双栏宽度为 `.48\textwidth + .48\textwidth`。
- 三图并排时，每列可使用约 `.30\textwidth`。

## 图片

### 图片处理规范（重要）

- 图片**统一转成 PDF** 后存放在 `<工作目录>/figures/` 下，`.tex` 中用相对路径引用（如 `\includegraphics{figures/example.pdf}`）。
- **原图存放位置因具体工作目录而定**：动手前先查看当前工作目录结构（可能是代码仓库的输出目录、`papers/` 下的论文资源、或独立的图片目录），找到原图所在位置后再转换，不要凭空假设路径。
- 转换方式：matplotlib 绘图时直接 `savefig(..., format="pdf")` 导出矢量 PDF；已有位图先确保高分辨率（≥300 dpi），再转 PDF 嵌入。优先矢量 PDF，保证缩放清晰、不失真。
- 图片宽度优先相对于 `\textwidth` 设置，并保持原始比例。

### 引用写法

```latex
\begin{figure}[!t]
  \centering
  \includegraphics[width=.75\textwidth]{figures/example.pdf}
  \caption{图片说明}
  \label{fig:example}
\end{figure}
```

- 图片统一存放在 `<工作目录>/figures/` 下，使用相对路径。
- `\label` 应唯一且语义明确，如 `fig:architecture`。
- 图片自身已有完整标题时，可省略 `\caption` 以节省空间。
- 图片未就绪时，用 `\imageplaceholder{说明文字}` 输出灰色占位框，后续替换为真实图片。

## 表格

```latex
\begin{table}
  \caption{示例表格}
  \label{tab:example}
  \centering
  \footnotesize
  \begin{tabular}{|c|c|}
    \hline
    \textbf{项目} & \textbf{结果} \\
    \hline
    A & 0.80 \\
    \hline
    B & 0.90 \\
    \hline
  \end{tabular}
\end{table}
```

- 大型表格只保留关键行列。
- 表格过宽时优先精简内容，其次才考虑缩小字号。
- `\label` 推荐使用 `tab:` 前缀。

## 数学公式

行内公式：

```latex
策略记为 $\pi(a \mid s)$，价值函数记为 $V(s)$。
```

独立公式：

```latex
\begin{equation}
  V(s) = \mathbb{E}\left[\sum_{t=0}^{\infty}\gamma^t r_t\right].
  \label{eq:value}
\end{equation}
```

- 多行公式使用 `align`。
- 每页通常只放一个主公式，并用文字解释符号和作用。
- 向量可写为 `\bm{x}`，集合和实数域可写为 `\mathcal{X}`、`\mathbb{R}`。

## 中文与特殊字符

- 模板通过 `xeCJK` 支持中文，必须使用 XeLaTeX 编译。
- LaTeX 特殊字符需要转义：`\%`、`\_`、`\&`、`\#`、`\{`、`\}`。
- 英文缩写首次出现时建议给出完整名称。
- 文件名尽量使用 ASCII 字符，减少跨平台编译问题。

## 结束页

```latex
\section*{}
\begin{frame}
  \centering
  \LARGE\textbf{\quad Thanks for Listening.}
\end{frame}
```

结束文字可以替换为"谢谢！"或"Q \& A"。结束页不需要加入有编号章节。

## 模板资源与主题行为

`seu.sty` 负责以下视觉元素，通常无需在主 `.tex` 文件中修改：

- 东南大学背景图、校名图和校徽。
- 顶部章节导航栏。
- 绿色主题色与圆角元素。
- 图片与表格标题的中文名称及编号。

注意：入口文件导言区已关闭页脚（`\setbeamertemplate{footline}{}`）并把 block 改为无边框样式，因此页脚文字与圆角块边框不再显示；如需恢复，删除对应导言区设置即可。

移动或复制项目时，应同时保留：

```text
seu.sty
source/seu_background.png
source/seu_logo.png
source/seu_title.png
fonts/
```

整套资源也可直接从全局 skill 的 `templates/` 目录复制，保持相对路径不变即可。

## 编译方式

项目 `Makefile` 使用 XeLaTeX，并连续编译两次以更新目录、导航和引用：

```bash
make SEU_BeamerTemplate
```

也可手动运行：

```bash
xelatex SEU_BeamerTemplate.tex
xelatex SEU_BeamerTemplate.tex
```

清理辅助文件：

```bash
make clean
```

新建其他入口文件时，需要修改 `Makefile`，或直接对新文件运行两次 `xelatex`。

## 工作流

1. 动手前先检查项目：读取主 `.tex` 入口文件、附近的大纲/笔记（如有）、现有图片与资源目录（尤其注意原图所在位置与 `figures/` 目录现状）。
2. 新建 deck：将 `templates/` 下的全部文件复制到新项目根目录，再编辑入口文件。
3. 编辑现有 deck：保留 `seu.sty`、`source/`、`fonts/` 及其相对路径，除非用户明确要求换主题。
4. 项目中有 `SEU_BeamerTemplate.tex` 时以它为默认入口文件；存在多个 `.tex` 时先确认真正的 Beamer 根文件再编辑。
5. 用 `\section` 组织报告逻辑、`frame` 组织页面；每页只表达一个核心观点，使用短句、图示、公式或表格。
6. 内容拥挤时拆页，不通过极小字号强行塞入一页；仅在必要时局部使用 `\small`、`\footnotesize` 或 `\scriptsize`。
7. 添加图片：先定位原图，转成 PDF 放入 `<工作目录>/figures/`，再以相对路径引用。
8. 需要校验、或改动涉及 LaTeX 语法、中文、字体、图片、表格、公式时，用 XeLaTeX 编译（两次）。编译失败时报告相关 log 提示。

## 编辑规范

- 标题与导航文案保持简洁；长 `\title`、`\author`、`\institute`、`\section` 用可选短标题参数。
- 每个报告建议 3 至 6 个主要章节，每个内容页 3 至 6 个要点。
- block 每页一至两个用于强调；block 标题概括内容，不要重复 frame 标题。
- 新图片默认放 `figures/`，用相对路径引用（见「图片处理规范」）。
- label 使用语义前缀：`fig:`、`tab:`、`eq:`。
- 正文中的 LaTeX 特殊字符需转义：`\%`、`\_`、`\&`、`\#`、`\{`、`\}`。
- 文件名尽量使用 ASCII，减少跨平台编译问题。
- 数学公式以外的英文文本如需 Times New Roman，用 `\setsansfont{Times New Roman}` 或 `\IfFontExistsTF{Times New Roman}` 回退；不要因此改动数学字体。

## 推荐制作流程

1. 复制模板入口文件，并保留导言区、标题页、目录页和结束页。
2. 填写标题、作者、机构和日期。
3. 先确定 3 至 6 个章节，再填写 `\section`。
4. 为每页写一句核心结论，据此确定页面标题。
5. 选择列表、内容块、双栏、表格或公式等合适版式。
6. 定位原图，转 PDF 放入 `<工作目录>/figures/`，检查路径和标签唯一性。
7. 使用 XeLaTeX 连续编译两次。
8. 逐页检查溢出、字号、图片清晰度、导航和页码。

## 检查清单

- [ ] 使用 XeLaTeX 编译且无报错。
- [ ] 标题页信息完整，短标题和短作者适合页脚显示。
- [ ] 章节数量适中，顶部导航未拥挤。
- [ ] 每页有明确标题和单一核心观点。
- [ ] 页面文字精简，无大段正文。
- [ ] 图片已转 PDF 存放在 `<工作目录>/figures/`，路径有效、清晰且未变形。
- [ ] 表格已精简，字号可以正常阅读。
- [ ] 公式尺寸合理，并有必要的文字解释。
- [ ] `%`、`_`、`&` 等特殊字符已正确转义。
- [ ] 无内容越界或底部遮挡。
- [ ] 连续编译两次后，目录、导航、页码和引用正确。
- [ ] 未无意修改 `seu.sty` 或模板资源。

## 校验

用户要求成品或改动较大时，运行项目现有编译命令（`make SEU_BeamerTemplate` 或 `sh make.sh`）；没有则对根 `.tex` 连续运行两次 `xelatex`。检查缺失图片、内容溢出、未定义引用、中文/字体问题，以及生成的 LaTeX 是否存在语法错误。
