# DECISIONS.md — 决策索引

> 索引，不是决策本身。正文在 `docs/decisions/NNNN-*.md`。
> 默认只读本文件；需要某条细节时再单独读那一条。**禁止批量读取 `docs/decisions/`。**

## 索引

| # | 标签 | 决策了什么 | 状态 | 文件 |
|---|------|-----------|------|------|

状态取值：`当前` / `已被 NNNN 取代` / `已废弃`
标签：按项目自定，如 `api` / `data` / `infra` / `product` / `cross`

## 新增一条决策

1. 新建 `docs/decisions/NNNN-<短横线标题>.md`
2. 在本文件索引表补一行
3. **两步都做完才算完成** —— 只建文件不更新索引，等于这条决策不存在

正文模板：

```
# NNNN 标题

- DATE:
- TAGS:
- STATUS: 当前
- SUPERSEDES: —

## DECISION
## REJECTED
## RATIONALE
## OUT OF SCOPE
## OPEN
```

规则：

- **REJECTED 不能空** —— 它防止你下次绕回被否决的方案。可以没有 RATIONALE，不能没有 REJECTED。
- 决策写下后不再修改。要推翻就**新建一个文件**，原文件 STATUS 改为 `已被 NNNN 取代`。
- 单文件 ≤30 行。
- 只有影响后续取舍的才值得记。改个变量名不用记。
