---
name: train-support
version: 1.0.0
author: RUBisco0211
description: 在严格保持原有算法逻辑不变的前提下，补全或修复强化学习与深度学习训练代码中的外围功能，包括本地及 Weights & Biases 日志、评估循环与环境渲染媒体、tqdm 终端进度显示、周期性模型保存，以及兼容恢复训练的计数器。需要补充训练指标、wandb 模式、评估周期、进度可视化、权重保存或资源清理逻辑时使用。
---

# Model Training Support 

补全训练外围功能，但不要改变学习算法本身。沿用仓库现有的框架、命名规范、权重格式和指标语义。把算法行为不变视为高于日志完整性、代码整洁度和工程化程度的硬约束。

## 最高优先级边界：不得修改算法逻辑

- 只修改日志、eval 调度、媒体渲染、进度显示、checkpoint 调用和资源清理所必需的代码。
- 不要为了封装、统一风格、减少重复或提高“工程质量”而重构训练主流程。
- 不要改变 loss 公式、奖励或 cost 定义、网络前向过程、梯度计算、梯度裁剪、optimizer/scheduler 更新、参数更新顺序、batch/minibatch 划分、rollout 采集、buffer 行为、终止条件、环境 step、动作处理或归一化逻辑。
- 不要改变训练与采样使用的 seed、PRNG key 拆分顺序、随机调用次数或随机状态推进方式。为 eval 新增独立随机状态，避免消耗训练随机流。
- 不要仅为便于记录指标而改变 tensor 的 shape、dtype、device、计算图、同步时机或聚合结果。在不参与反向传播的位置转换日志标量。
- 不要擅自调整超参数、默认值、训练总步数或 eval 之外的执行频率。新增参数时保持原有训练默认行为；只有用户明确要求的 eval/save 默认周期可以改变。
- 不要让 eval、渲染或日志反向影响训练状态。除非原项目明确这样设计，否则不要更新训练用归一化统计、replay buffer、模型参数或 optimizer state。
- 若实现外围功能必须改变算法接口，先采用最小适配层；仍无法避免算法行为变化时停止修改并向用户说明冲突，不要自行决定折中方案。
- 完成后专门审查 diff，确认变化只属于外围功能。用相同 seed 和最小配置比较修改前后的首轮采集形状、训练更新次数和已有核心指标；能够确定性比较时验证结果一致。

## 编辑前检查

1. 定位训练入口、训练循环、配置或命令行参数、模型保存与加载方法、环境评估与渲染接口，以及已有日志辅助函数。
2. 确认循环单位是 epoch、iteration、optimizer step、batch 还是 environment frame。选择进度条、eval/save 调度单位和 W&B 横轴前，先弄清恢复语义、循环边界及仓库现有约定。`total_frames` 与 iteration 都可以作为主横轴，应根据哪个计数器能稳定表示训练进度、恢复后连续、并与 eval/save 调度语义一致来决定。若两者都合理且选择会影响下游仪表盘、对比实验或用户预期，必要时询问用户，不要自行固定为其中一种。
3. 检查已有指标名称和聚合维度。下游仪表盘或对比实验可能依赖已有名称时，保持兼容。
4. 判断项目属于普通 RL、安全 RL 还是监督学习。不要仅凭变量名推测安全指标的语义。
5. 检查是否使用分布式训练。适用时只允许主进程或 rank 0 初始化 W&B、上传媒体和保存权重。
6. 在编辑前标记算法核心路径与允许修改的外围路径。优先在训练入口、logger 或 callback 层实现；仅在没有其他接入点时最小修改训练循环。

## 遵循项目约定

- 扩展已有 logger、evaluator、renderer 和 save/load 抽象，不要另建一套平行基础设施。
- 保持仓库原有 checkpoint 格式和模型接口。除非用户明确要求，否则不要在 pickle、ckpt、pt、safetensors 等格式之间转换。
- 兼容性重要时保留已有指标名称。只有存在明确消费者时才增加别名。
- 严禁改变优化、rollout 采集、环境动力学或模型行为，即使改动看起来能让日志实现更整洁。
- 让可选功能能够降级，避免日志或媒体失败导致已完成的训练结果丢失。

## 配置 W&B

- 项目缺少相关配置时，在训练入口增加等价于 `--wandb-mode online|offline|disabled` 的参数。训练入口已有 W&B 相关参数时，先分析其语义、默认行为、兼容性和现有使用方式，不要仅因参数形式与本 skill 的示例不同就替换它。若现有参数与 online/offline/disabled 能力或本 skill 的默认行为有实质冲突，且兼容方案会改变用户接口或运行行为，必要时先询问用户。兼容已有的 `--no-wandb` 等开关。
- 除非仓库另有规定，debug 和测试运行默认禁用 W&B。仓库已有网络检测时，在网络不可用时使用 offline 模式。
- 只初始化一次 W&B，并传入 run name、project、适用时的 group、输出目录，以及可序列化的训练配置。
- 明确选择唯一的 W&B step 横轴并保持一致。结合主循环、eval/save 调度、变长 batch、恢复训练和现有仪表盘判断使用 `total_frames` 还是 iteration；另一者及 optimizer steps 可作为 counter 记录，不要暗中替换主横轴。存在无法从仓库语义消解的实质性歧义时，必要时询问用户。
- 同一主循环周期内分别记录 collection、training、eval、timer 和 media 时，使用相同 `step`、设置 `commit=False`，并在该周期的完整记录结束后统一提交。
- 有意识地把 tensor 和 array 转成 Python scalar。除非求均值符合指标语义，否则不要静默压缩非标量值。
- 仓库已有本地日志，或 W&B 是唯一记录方式时，保留或增加 CSV、JSONL 等结构化本地日志，并定期 flush。
- 在 `finally` 中关闭 W&B。W&B disabled 时不要调用交互式登录；offline 初始化不需要登录时也不要强制调用。

## 记录指标

只记录项目实际提供的指标。不要为了满足固定字段表而虚构缺失数据。

### 计数器与性能

- 记录主循环计数器，例如 `counters/iter` 或仓库中的对应字段。
- 对能够明确定义环境帧数的 RL 项目，记录 `counters/total_frames` 和 `counters/current_frames`。
- 有实际价值时记录 FPS、samples per second 或 steps per second 等吞吐率。
- 对存在的阶段记录 collection、training、evaluation、checkpoint、iteration 和累计耗时。

### 训练与采集

- 在项目能够提供时，记录主要 objective 或 loss、分项 loss、learning rate、entropy、gradient norm、clip fraction 及其他优化诊断指标。
- 对 RL collection，记录具有明确聚合语义的 episode return，通常包括跨已完成 episode 的 min、mean 和 max。
- 区分单步 reward 与 episode return，也要区分单 agent 与团队级聚合。
- 保留算法 update 方法已经返回的特有指标，不要用通用字段表替换它们。

### Evaluation

- 按可配置的正整数周期执行 eval；周期单位使用项目选定的 iteration、`total_frames` 或其他有明确语义的主调度计数器。用户希望共用周期时，默认让 eval 周期与 checkpoint 周期一致；已有配置需要兼容时保留独立设置。
- 隔离 eval 与训练状态：适用时启用 evaluation mode、关闭梯度、使用独立 RNG 状态或 seed，并避免污染 replay buffer 或归一化统计，除非项目明确需要这样做。
- 记录 eval episode return 的 min、mean 和 max。只在指标有意义且项目可提供时记录 success rate、episode length、任务特有指标或历史最佳 eval return。
- eval 标量与 eval 媒体使用同一个 W&B step。

### 安全强化学习指标

- 只有确认环境、rollout、算法或已有日志定义了安全约束后，才添加 cost 和 safety 指标。
- cost 通常表示累计或长期安全违反量，但必须先验证项目的确切定义和聚合维度，再决定记录 sum、mean 或 max。
- safety 通常表示实时安全状态，或由实时违反状态得到的 unsafe rate、safe ratio 等统计量。检查实现，不要猜测。
- 对安全 RL，优先参考仓库已有指标。只在项目实际存在对应信息时保留 cost mean/max、unsafe rate、safe ratio、安全 critic loss、拉格朗日乘子或 CBF 诊断等字段。
- 项目没有对应信号时，完全省略 cost 和 safety 字段。

## 上传 Evaluation 媒体

- 优先使用环境已有的 `render`、`render_video` 或 recorder 抽象。
- 环境支持渲染且启用 W&B media 时，至少渲染一个具有代表性的 eval episode。
- 使用 `eval/video` 等 eval 媒体键上传 MP4 或 GIF；仓库已有键名时保持一致。
- 上传前验证帧数、dtype、通道顺序和 W&B 所需维度。控制 FPS、分辨率、episode 数量和上传频率以限制开销。
- 长时间训练开始前尽量检查媒体依赖。缺少 ffmpeg、moviepy、显示后端或渲染能力时，给出可操作的警告，并继续记录 eval 标量及保存权重。
- 为 debug、headless 和低开销运行提供明确的关闭视频选项。

## 显示终端进度

- 沿用项目现有 tqdm 风格。选择 iterable wrapper 或手动 `total`/`update` 其中一种，不要混用更新语义。
- 准确标记进度单位；恢复训练时让 `initial` 与循环起点一致。
- 使用 `tqdm.write` 输出 eval 和 checkpoint 消息，避免破坏进度条。
- 保持 `set_postfix` 简洁，只显示少量标量，例如 reward、loss、适用时的 unsafe rate、learning rate 或吞吐率。
- 检查循环端点是包含还是不包含，并验证全新训练和恢复训练都恰好在 100% 结束。
- 使用上下文管理器或 `finally` 关闭进度条。

## 保存与恢复模型

- 按可配置的正整数周期保存；周期单位与 eval 和项目选定的主调度计数器保持语义一致。用户要求共用周期时，通常与 eval 使用同一周期。
- 调用仓库现有的模型或算法保存方法，保持原有目录结构和序列化格式。
- 明确保存顺序。优先执行 eval、记录 eval 标量和媒体，再保存与当前主调度 step 对应的 checkpoint。媒体上传失败时仍要继续保存。
- 保留仓库已有的 `latest`、`best` 或周期快照策略，不要不加判断地同时引入所有策略。
- 替换 `latest` 时，如果现有保存 API 允许，优先写入完整临时 checkpoint 后再原子替换旧版本。不要仅为实现原子替换而重新设计序列化层。
- 保存或保留仓库恢复逻辑所需的 iteration marker 和其他计数器。现有格式只保存模型权重、缺少 optimizer、scheduler、scaler、RNG 或 replay state 时，不要声称能够精确续训。
- 可行时在保存后检查必需文件。加载时检查路径、配置或 shape 兼容性，以及恢复的 iteration 是否与目标训练终点兼容。

## 处理失败与清理资源

- 使用 `try/finally` 管理完整训练生命周期，并关闭 tqdm、本地日志文件、renderer 和 W&B。
- 让模型保存不依赖可选视频上传成功。
- 明确暴露 checkpoint 保存错误；部分保存后不要报告成功，也不要提前更新 checkpoint marker。
- 不要笼统吞掉异常。只针对可选集成捕获窄范围异常，并保留足够的诊断上下文。

## 验证补全结果

运行最小可行训练或 dry run，并验证：

1. 全新训练和恢复训练的进度条均从正确位置开始，并在正确位置结束。
2. W&B disabled 模式不登录、不上传；offline/online 模式按配置初始化。
3. 一个主循环周期产生对齐的 collection、training、eval、timer、counter 和 media 记录，不产生重复 W&B step。
4. eval 按预期周期执行，且不修改只属于训练的状态。
5. checkpoint 按预期周期以仓库原格式生成，并能通过已有 load 路径加载。
6. 缺少渲染依赖时，能够降级为 eval 标量日志和 checkpoint 保存。
7. 普通 RL 项目没有虚构的 cost 或 safety 指标；安全 RL 指标符合仓库定义和聚合逻辑。
8. diff 不包含与外围功能无关的重构，且原有算法更新次数、数据流、随机流和核心训练行为保持不变。
