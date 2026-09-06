# 录屏操作计划

`scripts/record-web-demo.mjs` 读取 JSON 计划并按绝对时间执行浏览器操作。先把 `assets/recording-plan.example.json` 复制到当前项目的 `demo/tmp/recording-plan.json`，再根据实际页面修改。

## 顶层字段

- `url`：Demo 地址。
- `totalDuration`：最终视频总秒数，必须与编排稿最后一个时间点一致。
- `viewport`：默认 `1920×1080`。Playwright 只录页面视口，不录桌面或其他窗口。
- `server`：当 `url` 不可访问时用于启动项目。优先使用数组形式的 `command` 与 `args`，不要把整条命令拼成 shell 字符串。
- `browser`：可设置 `channel` 或 `executablePath`。这只决定用哪个浏览器运行页面，与语音合成无关。
- `preflight`：正式计时前恢复初始状态的操作，例如回到首页、关闭弹窗、清空表单。
- `actions`：按 `at` 从小到大排列的时间轴操作。
- `encoding`：最终 H.264 编码参数。

## 操作字段

每个操作至少包含：

- `at`：从正式视频起点计算的秒数。
- `type`：操作类型。
- `label`：时序报告中的人类可读说明。
- `locator`：需要定位页面元素时提供。
- `settle`：操作后停留毫秒数；正式录制默认 450 毫秒。

可用操作：

- `click`：移动红色指示圈并点击。
- `point` / `hover`：只指向，不点击。
- `scrollIntoView`：滚动到元素并指向。
- `fill`：填写输入框，文字放在 `value`。
- `press`：按键，按键名放在 `key`。
- `waitFor`：等待元素出现；可设置 `state` 和 `timeout`。
- `scrollPage`：滚动页面；使用 `top`、`left`、`behavior`。
- `wait`：静止停留；使用 `duration`。

## 定位方式

优先使用语义定位，坐标只用于鼠标展示，不用于查找元素。

- 角色：`{"kind":"role","role":"button","name":"提交","exact":true}`
- 文本：`{"kind":"text","text":"分析结果","exact":true}`
- 测试 ID：`{"kind":"testId","value":"submit-button"}`
- 标签：`{"kind":"label","text":"项目名称","exact":true}`
- 占位文字：`{"kind":"placeholder","text":"请输入","exact":true}`
- CSS：`{"kind":"css","selector":"[data-panel='result']"}`

可以用 `hasText` 缩小表格行或容器，用 `index` 选择第几个匹配项。优先补充 `data-testid` 或使用角色/可访问名称；只有页面确实缺少语义信息时才使用 CSS。

## 校准要求

1. 每个关键操作的 `at` 应来自视频编排稿中的旁白提示或时序校准表。
2. 操作应在相关旁白开始后约 0.2～0.8 秒发生；加载较慢的结果要预留等待时间。
3. 动态状态必须有稳定的 `preflight` 重置方式。
4. 先运行 `--smoke`。只有所有定位器、点击和滚动都通过，才允许开始完整录制。
5. 正式录制后检查 `demo/tmp/recording-report.json` 的 `lateBy`；明显迟到的操作要修正计划或页面等待条件。
