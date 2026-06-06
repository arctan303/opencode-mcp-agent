# 功能进度

架构原则见 `ARCHITECTURE.md`。当前方向是 managed headless OpenCode runtime，不再以 OpenCode Desktop bridge 为主线。

## 已完成

- [x] MCP stdio server 基础入口
- [x] MCP JSON-RPC 并发处理，长任务等待期间仍可查询状态和回复权限
- [x] OpenCode API 调用验证
- [x] session 创建/复用验证
- [x] 发送消息并读取 OpenCode agent 回复验证
- [x] 通过 runtime API 列出可用模型：`opencode_model_list`
- [x] managed runtime：随机端口、随机 BasicAuth、认证只存在进程内
- [x] runtime 幂等启动：重复 `opencode_runtime_start` 默认复用健康 runtime
- [x] runtime 健康检查：复用前探测 `/global/health`，异常时丢弃并重启
- [x] Windows OpenCode 解析：优先 `OPENCODE_BIN` / npm global exe，再 fallback 到 PATH 和 Desktop bundled
- [x] `opencode_task_start` 使用 managed runtime
- [x] `opencode_task_list`
- [x] `opencode_task_status`
- [x] `opencode_task_status` 同步 session 紧凑进度
- [x] `opencode_task_result`
- [x] `opencode_task_cancel`：立即记录取消请求，后台调用 session abort 并确认最终状态
- [x] task 状态持久化到本机 JSON state file
- [x] `opencode_session_list`
- [x] `opencode_session_messages`
- [x] `opencode_session_messages` 默认压缩大段 tool 输出，避免 MCP 响应过大
- [x] `opencode_model_list`
- [x] `opencode_runtime_status`
- [x] `opencode_runtime_start`
- [x] `opencode_runtime_stop`
- [x] 默认隐藏 legacy/debug 工具，设置 `OPENCODE_BRIDGE_DEBUG_TOOLS=1` 才暴露
- [x] UTF-8 中文发送脚本验证
- [x] 子代理架构文档
- [x] 自动化检查：语法检查、MCP stdio smoke test、工具列表测试、state 持久化测试
- [x] 真实 runtime 冒烟测试：npm-global OpenCode、DeepSeek 模型列表、实际对话、runtime 停止

## 权限能力

- [x] 暴露 `opencode_permission_list`
- [x] 通过 `GET /permission` 读取真实待处理权限
- [x] 任务状态同步权限队列并标记 `waiting_permission`
- [x] 确认 OpenCode 官方 permission reply API：`POST /permission/:requestID/reply`
- [x] 接入真实权限回复 endpoint
- [x] 暴露 `opencode_permission_reply`
- [x] 暴露运行中和阻塞中的工具名称、call ID、输入摘要与持续时间
- [x] 区分 queued 与 executing 工具，避免把参数流式生成阶段误报为运行中
- [x] 真实 `edit: ask` 回归测试：发现权限、回复 `once`、任务继续并完成
- [x] 修正 `always` 权限回复的 remember 返回语义
- [x] 取消请求立即返回，session abort 在后台确认

当前策略：`decision: "allow"` 默认回复 `once`；传 `remember: true` 时回复 `always`；`decision: "deny"` 回复 `reject`。权限请求以 OpenCode 权限队列为准，不再从消息 part 猜测。

## 下一步主线

- [ ] 为 task store 增加容量限制、过期清理和恢复策略
- [ ] 为 OpenCode API 增加适配层，隔离 `/session`、`/api/model` 等端点变动
- [ ] 增加 runtime crash 后的任务恢复提示：通过 `sessionID` 拉取历史并更新 task
- [ ] 增加更多 mock OpenCode server 测试，覆盖 runtime 重启、HTTP 失败、取消、权限扫描
- [ ] 增加权限策略配置，在明确授权范围内支持受控自动批准
- [x] 清理早期 Desktop 私有接口探测脚本和无效产物

## 非主线 / 暂缓

- [ ] OpenCode Desktop viewer 集成
- [ ] Desktop session 可视化切换
- [ ] 跨平台 Desktop sidecar 探测

这些能力不是第一阶段核心。第一阶段先把 OpenCode 作为 MCP 子代理跑稳。
