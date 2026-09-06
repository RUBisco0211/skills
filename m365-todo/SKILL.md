---
name: m365-todo
description: 通过 CLI for Microsoft 365 管理个人 Microsoft To Do。用户要求查看、搜索或统计待办，创建任务或清单，修改标题、状态、日期、提醒和重要性，完成或删除任务，或排查个人 Microsoft 账号的 m365 To Do 登录与权限问题时使用。优先用 --query（JMESPath）裁剪结果，只暴露完成任务所需的最少字段。
---

# M365 个人 To Do

使用 `m365 todo` 管理当前用户的个人 Microsoft To Do。把 CLI 输出视为可能包含私人任务内容：先过滤，再展示。

## 操作原则

- 优先使用已安装的 `m365`，执行前按需用 `m365 version` 确认可用。
- 默认采用当前配置的紧凑 `text` 输出；需要稳定解析、管道处理或取得 ID 时显式加 `--output json`。
- 优先用内置 `--query` 做服务端响应后的 JMESPath 投影、过滤、排序和计数。只有 JMESPath 不便表达时才用 `--output json | jq ...`。
- 查询时只取用户需要的字段。默认不要展示任务正文、内部 ID、创建时间、修改时间和完整原始响应。
- 修改前先把清单名和任务解析到唯一对象。标题可能重复；更新或删除时使用查到的任务 ID。
- 用户明确要求新增或修改且目标唯一时直接执行，完成后做最小查询验证。
- 删除前读取并核对唯一目标。只有用户明确要求删除且目标无歧义时才使用 `--force`；否则先向用户确认。
- 不运行 `--debug`，不打印 access token、refresh token、设备代码或 `~/.cli-m365-*.json` 内容。

## 工作流

### 1. 检查登录

优先使用真实 To Do 调用作为健康检查：

```bash
m365 todo list list --query 'length(@)' --output text
```

返回数字即登录和 `Tasks.*` 权限可用。个人 Microsoft 账号的令牌可能是不透明格式，`m365 status` 中 `connectedAs` 为空不一定表示失败。

若查询失败、返回 401、`UnknownError` 或 `No access token found`，读取 [references/setup-and-migration.md](references/setup-and-migration.md)，按其中的登录与排障流程处理。

### 2. 解析清单

用户给出清单名时先确认它存在：

```bash
m365 todo list get --name "任务" \
  --query '{name:displayName,kind:wellknownListName}' \
  --output json
```

用户没有指定清单时，找出默认清单：

```bash
m365 todo list list \
  --query '[?wellknownListName==`"defaultList"`].displayName | [0]' \
  --output text
```

当前个人账号的默认清单显示名是 `任务`。仍优先按 `wellknownListName` 动态解析，避免迁移或语言变化后失效。

### 3. 查询任务

紧凑列出标题、状态、重要性和截止日期：

```bash
m365 todo task list --listName "任务" \
  --query '[].{title:title,status:status,importance:importance,due:dueDateTime.dateTime}' \
  --output json
```

只看未开始的任务：

```bash
m365 todo task list --listName "任务" \
  --query '[?status==`"notStarted"`].{title:title,due:dueDateTime.dateTime}' \
  --output json
```

按标题关键字搜索；只有需要后续修改时才保留 ID：

```bash
m365 todo task list --listName "任务" \
  --query '[?contains(title, `"论文"`)].{title:title,status:status,id:id}' \
  --output json
```

更多过滤、排序、计数和 `jq` 配方见 [references/query-recipes.md](references/query-recipes.md)。

### 4. 新增任务

最小新增：

```bash
m365 todo task add --listName "任务" --title "提交周报" \
  --query '{title:title,status:status}' \
  --output json
```

包含备注、截止日期、重要性和提醒：

```bash
m365 todo task add --listName "任务" \
  --title "提交周报" \
  --bodyContent "整理本周进展和下周计划" \
  --dueDateTime "2026-09-04" \
  --importance high \
  --reminderDateTime "2026-09-04T01:00:00Z" \
  --query '{title:title,status:status,due:dueDateTime.dateTime}' \
  --output json
```

- `dueDateTime` 使用 ISO 8601 UTC 字符串，但 To Do 只保留日期、忽略时间。
- `reminderDateTime` 保留具体 UTC 时间。用户给本地时间时先按其时区换算；本机默认时区是 `Asia/Shanghai`。
- `importance` 可取 `low`、`normal`、`high`。
- `status` 可取 `notStarted`、`inProgress`、`completed`、`waitingOnOthers`、`deferred`。
- 新增前检查同一清单中的同名未完成任务；可能重复且用户未明确要求重复时，先提示已有任务。

### 5. 修改或完成任务

先精确查出候选任务：

```bash
m365 todo task list --listName "任务" \
  --query '[?title==`"提交周报"`].{title:title,status:status,id:id}' \
  --output json
```

候选唯一后用 ID 修改：

```bash
m365 todo task set --listName "任务" --id "<TASK_ID>" \
  --title "提交项目周报" \
  --importance high \
  --query '{title:title,status:status,importance:importance}' \
  --output json
```

标记完成：

```bash
m365 todo task set --listName "任务" --id "<TASK_ID>" \
  --status completed \
  --query '{title:title,status:status}' \
  --output json
```

修改后按同一 ID 执行 `m365 todo task get`，只查询被修改字段，确认结果与用户要求一致。

### 6. 删除任务

先用标题过滤并确认唯一 ID，再删除：

```bash
m365 todo task remove --listName "任务" --id "<TASK_ID>" --force
```

随后用同一 ID 执行一次 `task get`，以“找不到任务”作为删除成功的验证信号。不要把整个清单为空当作验证条件。

## 管理清单

```bash
# 查
m365 todo list list --query '[].{name:displayName,kind:wellknownListName}' --output json
m365 todo list get --name "科研" --query '{name:displayName,id:id}' --output json

# 增
m365 todo list add --name "旅行" --query '{name:displayName}' --output json

# 改名
m365 todo list set --name "旅行" --newName "旅行计划" \
  --query '{name:displayName}' --output json

# 删：先确认目标，再执行
m365 todo list remove --name "旅行计划" --force
```

删除清单会连同其中任务一起删除，按删除操作原则核对目标并确认授权。

## 输出结果

- 查询：只总结用户要求的字段和数量；不要复述 CLI 原始响应。
- 新增：报告清单、标题及用户指定的日期/重要性；内部 ID 默认不展示。
- 修改：报告实际变化的字段。
- 删除：报告删除对象及验证结果。
- 失败：给出精简错误码、可能原因和下一步；保持令牌、设备代码、账号地址与内部响应正文不出现在回复中。
