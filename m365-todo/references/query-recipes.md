# `--query` 与 `jq` 查询配方

`m365 --query` 使用 JMESPath，不是 jq。优先用它在 CLI 输出前裁剪字段；确实需要 jq 的对象重组、复杂计算或多阶段处理时，再显式指定 JSON 输出并管道给 jq。

## 引号规则

- 整个 JMESPath 表达式优先放在 shell 单引号中。
- JMESPath 的 JSON 字面量使用反引号，例如 `` `"completed"` ``；它位于 shell 单引号内时不会触发命令替换。
- 用户输入包含引号时，不要直接拼接到表达式。改为取得较小结果后用 `jq --arg`，或用程序参数安全构造。

## 投影

```bash
# 只返回清单名
m365 todo list list --query '[].displayName' --output json

# 只返回任务的必要字段
m365 todo task list --listName "任务" \
  --query '[].{title:title,status:status,due:dueDateTime.dateTime}' \
  --output json
```

## 过滤

```bash
# 未开始
m365 todo task list --listName "任务" \
  --query '[?status==`"notStarted"`].{title:title,due:dueDateTime.dateTime}' \
  --output json

# 高优先级
m365 todo task list --listName "任务" \
  --query '[?importance==`"high"`].{title:title,status:status}' \
  --output json

# 标题包含关键词
m365 todo task list --listName "任务" \
  --query '[?contains(title, `"论文"`)].{title:title,status:status}' \
  --output json

# 精确标题匹配并取得内部 ID，供后续修改
m365 todo task list --listName "任务" \
  --query '[?title==`"提交周报"`].id' \
  --output json
```

## 排序与截取

```bash
# 过滤出有截止日期的任务，按截止时间升序，取前 10 条
m365 todo task list --listName "任务" \
  --query '[?dueDateTime.dateTime] | sort_by(@, &dueDateTime.dateTime)[:10].{title:title,due:dueDateTime.dateTime}' \
  --output json

# 最近修改的 5 条
m365 todo task list --listName "任务" \
  --query 'reverse(sort_by(@, &lastModifiedDateTime))[:5].{title:title,status:status}' \
  --output json
```

## 计数与单值

```bash
# 清单数量
m365 todo list list --query 'length(@)' --output text

# 某清单任务总数
m365 todo task list --listName "任务" --query 'length(@)' --output text

# 未开始任务数
m365 todo task list --listName "任务" \
  --query '[?status==`"notStarted"`] | length(@)' \
  --output text

# 默认清单名
m365 todo list list \
  --query '[?wellknownListName==`"defaultList"`].displayName | [0]' \
  --output text
```

## 使用 jq

当前机器已安装 `/usr/bin/jq` 1.7.1。管道给 jq 时必须显式使用 JSON，避免默认 `text` 输出破坏解析：

```bash
m365 todo task list --listName "任务" --output json |
  jq '[.[] | {title, status, due: .dueDateTime.dateTime}]'
```

安全传入用户关键词：

```bash
m365 todo task list --listName "任务" --output json |
  jq --arg keyword "论文" \
    '[.[] | select(.title | contains($keyword)) | {title, status}]'
```

只输出统计结果：

```bash
m365 todo task list --listName "任务" --output json |
  jq '{total:length, completed:map(select(.status=="completed"))|length}'
```

## 最小暴露准则

- 只汇报数量时，让命令直接返回数量。
- 只查看任务时省略 `id`、`body` 和时间戳。
- 只有准备更新或删除时才查询 `id`，并把 ID 留在内部执行上下文中。
- 不把整个 JSON 保存到持久文件；确需中间文件时使用权限受限的临时目录，完成后清理。
