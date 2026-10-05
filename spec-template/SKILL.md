---
name: spec-template
description: 为 vibe coding / AI 协作项目生成轻量文档规范体系 —— `AGENTS.md` 常驻约束、`WORKFLOW.md` 流程总纲、`docs/DECISIONS.md` 决策索引、`docs/decisions/NNNN-*.md` 决策正文、`docs/research/` 调研文档。当用户要为项目建立或初始化 AI 协作规范、需要 AGENTS.md / CLAUDE.md 模板、要搭决策记录（ADR-lite）或调研文档目录时使用本 skill。
version: 1.0.0
author: RUBisco0211
---

# spec-template

把一套「AI 协作文档规范」初始化到目标项目里。产出的是**格式骨架**，内容由项目实际情况填充。

设计取向：**常驻最小化，按需加载**。只有 `AGENTS.md` 进每次会话的上下文，其余靠引用；约束落在文件里而不是对话里。

## 模板清单

| 模板 | 落地位置 | 加载时机 |
|---|---|---|
| `templates/AGENTS.md` | `<项目根>/AGENTS.md` | 常驻，每次会话自动读 |
| `templates/WORKFLOW.md` | `<项目根>/WORKFLOW.md` | 给人看，不进 AI 上下文 |
| `templates/DECISIONS.md` | `<项目根>/docs/DECISIONS.md` | 按需（决策索引） |
| `templates/decisions/NNNN-template.md` | `<项目根>/docs/decisions/NNNN-<标题>.md` | 按需，首次记决策时才生成 |
| `templates/research/TEMPLATE.md` | `<项目根>/docs/research/<主题>.md` | 按需，首次调研时才生成 |

## 存放位置

### 目标项目里的完整布局

```
<项目根>/
├── AGENTS.md                  常驻约束，唯一事实来源
├── CLAUDE.md                  仅 Claude Code 项目需要，内容一行 `@AGENTS.md`
├── WORKFLOW.md                给人看的流程总纲
└── docs/
    ├── DECISIONS.md           决策索引
    ├── decisions/
    │   └── NNNN-<标题>.md     决策正文，一条一个文件
    └── research/
        └── <主题>.md          调研文档
```

### 存放规则

- **全部随代码提交进版本控制**。约束文档和代码不同步，等于没有约束。
- **根目录只放 `AGENTS.md` 和 `WORKFLOW.md`**。`WORKFLOW.md` 是给人看的总纲，放进 `docs/` 会被当成"待读文档"，所以留在根。其余一律进 `docs/`。
- **`docs/decisions/` 和 `docs/research/` 在第一次真有内容时才建**。空目录 git 不跟踪，预先创建没有价值——不要为了结构完整而造空目录。
- 目标目录不存在就直接创建；已存在 `docs/` 且有其他内容时，只在其中补子目录，**不动既有文件**。

### 不同工具的落点

| 工具 | 入口文件 | 做法 |
|---|---|---|
| Codex / Cursor / 其他读 `AGENTS.md` 的工具 | `AGENTS.md` | 直接用 |
| Claude Code | `CLAUDE.md` | 内容只需一行 `@AGENTS.md`，约束全部写在 `AGENTS.md` |
| 同时用多个工具 | 各自入口都指向 `AGENTS.md` | **单一事实来源**，不复制内容到多个文件 |

### monorepo / 多包

- **根放一份主 `AGENTS.md`**，写全项目通用的约束与背景。
- 子包**只在有独立约束时才加** `packages/<pkg>/AGENTS.md`（例如前后端分层不同），并在根 `AGENTS.md` 第 12 节登记触发场景。
- **决策记录集中在根 `docs/decisions/`**，不按包拆——跨包决策放哪都别扭，统一编号更省事。
- 调研文档同样集中在根 `docs/research/`。

## 工作流

### 第 1 步：确认目标与现状

- 确认目标项目根目录（git 根或用户指定的项目根），布局以「存放位置」一节为准。
- 检查是否已存在 `AGENTS.md` / `CLAUDE.md` / `WORKFLOW.md` / `docs/`。
  - **已存在：不要覆盖。** 展示现有结构，只补齐缺失的部分，改动前先给用户看要加什么。
  - 已有 `CLAUDE.md` 且内容自成体系：不替换它，改为在 `AGENTS.md` 落地，并让 `CLAUDE.md` 加一行 `@AGENTS.md`。

### 第 2 步：确定生成范围

| 范围 | 内容 | 适用 |
|---|---|---|
| **最小集** | `AGENTS.md`（只填第 1、3、5 节） | 个人项目、一次性脚本、先跑起来再说 |
| **标准集**（默认） | `AGENTS.md` + `WORKFLOW.md` + `docs/DECISIONS.md` + `docs/research/` | 多数项目 |
| 单文件 | 只要某一个模板 | 用户明确指定时 |

决策正文模板（`decisions/NNNN-template.md`）与调研模板（`research/TEMPLATE.md`）**默认不复制进项目**——等第一次真要记决策 / 写调研时，照模板新建即可，避免模板文件污染项目目录。

### 第 3 步：复制并填充

复制对应模板到目标路径，然后替换占位符：

- `<...>` 形式的占位符**必须全部替换或整行删除**，不允许原样保留。
- 优先填这三处，它们是整套东西的价值所在：
  - **第 1 节背景速览** —— 尤其「阶段」和「规模」，AI 默认按生产级高规模写代码，这两行是唯一能纠正它的东西。
  - **第 3 节模式锚点** —— 写 3–5 个真实存在的文件路径。给 AI 一个具体文件照抄，比描述有效得多。
  - **第 5 节 `Never do`** —— 每条一行 `禁止 ...`，必须**可判定**。
- 用户没提供的信息留 `<...>`，不要编造项目细节。

### 第 4 步：校验

- [ ] `AGENTS.md` ≤ 200 行。
- [ ] 占位符已全部替换或删除。
- [ ] 文件位置符合「存放位置」一节：`AGENTS.md` / `WORKFLOW.md` 在根，其余在 `docs/` 下。
- [ ] `docs/` 下没有为了占位而建的空目录。
- [ ] 第 12 节「按需加载」表里登记了所有 `docs/` 下的文件及其触发场景——没登记的不会被读到。
- [ ] `docs/DECISIONS.md` 索引表与 `docs/decisions/` 下的文件一一对应。
- [ ] 给用户列出新建/修改的文件清单。

## 硬规则

生成或修订这些文档时必须遵守：

1. **`AGENTS.md` 是唯一的常驻文件**，保持 200 行以内。超限就把最长的一节抽成 `docs/xxx.md`，并在第 12 节登记。
2. **决策从第一条起就用「索引 + 一条一文件」**，不要先平铺后迁移。
3. **`REJECTED` 不能空** —— 它防的是 AI 下次绕回被否决的方案。可以没有 RATIONALE，不能没有 REJECTED。
4. **禁止 glob 或批量读取** `docs/decisions/` 和 `docs/research/`，先索引后下钻。
5. **文档里不写元说明** —— 不解释"为什么这么设计""什么时候该拆/该退""本节为什么是空的"。只写可执行的规则。
6. **调研文档是参考资料，不是约束**。其中的内容只有写进 `AGENTS.md` 第 5 节或 `docs/decisions/` 才对 AI 生效。
7. 更新已有文档时**只输出 diff**，不输出全文。

## 决策正文字段说明

模板只有五个标题，字段语义如下（写进项目时不保留这些说明）：

| 字段 | 写什么 |
|---|---|
| DECISION | 选了什么。一句话到三句 |
| REJECTED | 否决了什么 + 一句话原因。**不能空** |
| RATIONALE | 为什么这么选。可以空 |
| OUT OF SCOPE | 明确不做什么，防 AI 自作主张扩张 |
| OPEN | 还没定的。不要伪装成已定 |

## 常见问题

| 情况 | 处理 |
|---|---|
| 项目已经有 `CLAUDE.md` | 不动它，`AGENTS.md` 单独落地，`CLAUDE.md` 加一行 `@AGENTS.md` |
| 用户只要一份约束文件 | 只给 `AGENTS.md`，其余不提 |
| 用户不知道填什么 | 先问三件事：项目做什么、当前阶段、最近踩过的坑（第 3 条直接进 `Never do`） |
| `AGENTS.md` 超限 | 把最长的一节抽成 `docs/xxx.md`，第 12 节补触发场景 |
| 用户要加新决策 | 新建 `docs/decisions/NNNN-*.md` + 在索引补一行，**一次输出两块** |
