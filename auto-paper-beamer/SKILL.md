---
name: auto-paper-beamer
version: 1.0.0
author: RUBisco0211
description: 自动把用户给出的一篇 PDF 学术论文制作成东南大学 Beamer 演示文稿。当用户给出一篇论文 PDF 并要求制作 slides、演示文稿、汇报 PPT，或要求"用东南大学 Beamer 模板/SEU 模板"做论文汇报时使用。本 skill 负责整体流程编排（转换 → 大纲审批 → 制作 → 编译），三大重活通过 subagent 串行执行以隔离主 agent 上下文，具体转换与模板细节分别调用已安装的 pdf2md 和 seu-beamer 两个 skill，不在本 skill 内重复。
---

# 自动论文 → SEU Beamer

把一篇论文 PDF 自动加工成东南大学主题的 Beamer 演示文稿。本 skill 只做**流程编排**，转换与模板细节分别交给 pdf2md 和 seu-beamer 两个已安装 skill，不在本 skill 内重复其内部细节。

**上下文隔离原则（核心）**：PDF→Markdown、编写 OUTLINE.md、编写 beamer 这三件重活，一律**派发给 subagent 串行执行**。每个 subagent 使用独立上下文窗口，只返回结构化摘要，主 agent 不读大文件全文、不做重活，只负责编排、审批与收尾。轻量管理动作（复制模板、git 初始化、.gitignore 配置）由主 agent 直接完成。

## 整体流程

```
用户给出论文 PDF
  → 第 0 步 主 agent：开场审批提醒
  → 第 1 步 subagent ①：使用 pdf2md skill → PDF→Markdown
  → 第 2 步 主 agent：复制 SEU 模板（轻量）
  → 第 3 步 主 agent：git 初始化与 .gitignore（轻量）
  → 第 4 步 subagent ②：编写 OUTLINE.md
          ✋ 主 agent 展示大纲，请求用户审批【闸门】
  → 第 5 步 subagent ③：（审批通过后）编写 beamer + 编译
  → 第 6 步 主 agent：git 收尾核对 + 汇报
```

## 第 0 步：开场审批提醒（必做，不可跳过）

使用本 skill 开始工作前，**第一时间**（任何转换动作之前）明确告诉用户：

> 本流程需要你在 **OUTLINE.md 大纲写完之后进行审批**，审批通过后我才会开始编写 beamer 幻灯片；在此之前我不会动工编写幻灯片。

如果本流程还存在其他需要用户确认的点（如输出目录选择、git 初始化等），也一并在此处提醒。这是本 skill 最重要的纪律，防止用户忘记审批。

## 第 1 步：subagent ① 论文 PDF → Markdown

- 派发一个 subagent 执行转换。任务中**必须显式要求**它先引用 `pdf2md` skill（已全局安装，位于 `~/.agents/skills/pdf2md`），再按该 skill 的说明操作（subagent 是独立会话，不会自动加载 skill，必须显式读文件）。
- 输入文件、输出位置、参数与产物验证方式，一律以 pdf2md skill 的说明为准，不让 subagent 自行猜测。
- subagent 必须返回**结构化摘要**：md 产物路径、论文章节标题列表、图/表/公式数量、转换质量说明。主 agent 只接收摘要，**不读 md 全文**。
- 转换完成后，后续所有内容提炼只读这份 md，不再读原 PDF。

## 第 2 步：主 agent 复制 SEU 模板（轻量）

- 使用 seu-beamer skill 的模板资源，把整套模板文件复制到当前工作目录（保持相对路径与目录结构不变）。此步很轻，主 agent 直接做，不必派 subagent。

## 第 3 步：git 管理（本 skill 特有规则）

工作目录用 git 管理，但**只管理正式产物**。主 agent 直接配置：

- 工作目录还不是 git 仓库时，先 `git init`。
- 配置 `.gitignore`，**不纳入管理**：
  - 转换产物：pdf2md 输出的 Markdown、图片及其所在目录（如 `papers/`、`outputs/` 等，按 pdf2md 的实际输出位置）；
  - 模板文件：从 seu-beamer 复制来的整套模板（`seu.sty`、`source/`、`fonts/`、`Makefile`、`make.sh`、`make.bat`、模板入口 `.tex` 等）；
  - LaTeX 辅助文件：`*.aux`、`*.log`、`*.nav`、`*.snm`、`*.toc`、`*.out`、`*.vrb` 等编译中间产物。
- **仅纳入管理**：
  - 正式 beamer 文档（`.tex`）；
  - `OUTLINE.md` 大纲；
  - `figures/` 目录下的图片 PDF。
- 流程收尾时用 `git status` 核对跟踪范围符合上述规则。

## 第 4 步：subagent ② 编写 OUTLINE.md（✋ 审批闸门）
- 派发第二个 subagent。任务中**必须显式要求**它先引用`seu-beamer` skill （已全局安装，位于 `~/agents/skills/seu-beamer`），然后只读第 1 步的 md（把 md 路径传给 subagent，或让 subagent 通过上一步摘要定位），按 seu-beamer 的章节与页面规范编写 `OUTLINE.md`，**逐页**写明：所属 section、frame 标题、版式类型（列表/内容块/双栏图文/表格/公式/图）、该页要点内容、引用了论文中的哪些图/表/公式。
- subagent ② 必须返回**逐页大纲摘要**（每页一句话），主 agent 不读大纲之外的论文内容。
- subagent ① 与 ② 可一次 chain 串行派发（② 通过 `{previous}` 接收 ① 的摘要），也可分两次派发；但 **subagent ③ 永远单独派发**。
- 主 agent 把 `OUTLINE.md`（或其摘要）展示给用户，**明确请求审批**。**未获用户批准前，绝不进入第 5 步**；批准后如用户提出修改意见，先按意见更新大纲再继续。

## 第 5 步：subagent ③ 编写 beamer + 编译（审批通过后）

- 审批通过后派发第三个 subagent。任务中**必须显式要求**它先引用`seu-beamer` skill （已全局安装，位于 `~/agents/skills/seu-beamer`），并说明：模板已复制到工作目录、git 规则已配好、大纲已定稿。
- 按 seu-beamer 要求：以模板为基础新建 deck（文件命名按论文标题的简短形式），填写标题页信息，按大纲逐页组织内容；论文图表按规范处理放入 `figures/` 并以相对路径引用；保持 seu-beamer 的默认样式约定（字号、block、公式、label 命名等）。
- 让 subagent ③ **自行完成编译校验**（按 seu-beamer 的编译方式，连续两次 XeLaTeX 或项目脚本），检查溢出、缺图、未定义引用、中文/字体等问题并修复，必要时重编直到通过或明确失败原因。
- subagent ③ 返回：成品 `.tex` 路径、编译结果（成功/失败与关键报错）、`figures/` 内容清单。

## 第 6 步：主 agent 收尾

- 主 agent 跑 `git status` 核对跟踪范围符合第 3 步规则（只包含正式 `.tex`、`OUTLINE.md`、`figures/` 图片 PDF）。
- 向用户汇报：成品路径、编译结果、git 跟踪情况。

## 检查清单

- [ ] 开场已提醒用户 OUTLINE.md 审批点（第 0 步）。
- [ ] 第 1/4/5 步均通过 subagent 串行执行，主 agent 只接收摘要、未读大文件全文。
- [ ] 每个 subagent 任务中都显式要求先 read 对应 skill 的 SKILL.md（pdf2md / seu-beamer）。
- [ ] 使用 pdf2md skill 完成转换，后续只读 Markdown 未再读原 PDF。
- [ ] 模板复制与 git/.gitignore 由主 agent 直接完成，未塞给 subagent。
- [ ] `OUTLINE.md` 逐页列出所有 frame，且已获用户审批后才派发 subagent ③。
- [ ] git 只跟踪正式 `.tex`、`OUTLINE.md`、`figures/` 图片 PDF；转换产物与模板文件被忽略。
- [ ] 编译通过（subagent ③ 内完成），无溢出、缺图、未定义引用。

## 常见问题

| 情况 | 处理 |
|------|------|
| 用户忘记需要审批 | 第 0 步已在最开头提醒；到达第 4 步时主 agent 再次明确请求审批，不跳过 |
| subagent 不知道用哪个 skill | 每个 subagent 任务里显式写"先 read 对应 SKILL.md 再操作"，不依赖自动匹配 |
| 输出位置 / 转换参数不确定 | 以 pdf2md skill 说明为准，不自行猜测 |
| 模板文件如何复制、如何编译 | 以 seu-beamer skill 说明为准，不自行猜测 |
| 转换产物或模板文件被误提交 | 修正 `.gitignore` 并从跟踪中移除，只保留正式产物 |
| subagent 返回摘要不够 | 在任务描述中明确要求返回的摘要字段（路径、章节列表、数量、结果） |
