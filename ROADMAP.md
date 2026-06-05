# 功能进度

架构原则见 `ARCHITECTURE.md`。当前方向是 managed headless OpenCode runtime，不再以 OpenCode Desktop bridge 为主线。

## 已完成

- [x] MCP stdio server 基础入口
- [x] MCP 请求队列，避免长工具调用和 stdin 解析互相干扰
- [x] OpenCode API 调用验证
- [x] session 创建/复用验证
- [x] 发送消息并读取 OpenCode agent 回复验证
- [x] 通过 runtime API 列出可用模型：`opencode_model_list`
- [x] managed runtime：随机端口、随机 BasicAuth、认证只存在进程内
- [x] runtime 幂等启动：重复 `opencode_runtime_start` 默认复用健康 runtime
- [x] runtime 健康检查：复用前探测 `/session`，异常时丢弃并重启
- [x] Windows OpenCode 解析：优先 `OPENCODE_BIN` / npm global exe，再 fallback 到 PATH 和 Desktop bundled
- [x] `opencode_task_start` 使用 managed runtime
- [x] `opencode_task_status`
- [x] `opencode_task_result`
- [x] `opencode_task_cancel`：当前进程内活跃请求可 abort；跨进程恢复任务会明确返回无法保证已停止
- [x] task 状态持久化到本机 JSON state file
- [x] `opencode_session_list`
- [x] `opencode_session_messages`
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
- [x] 任务结果中扫描并记录疑似 permission / approval 请求
- [x] 当任务返回疑似权限请求时标记 `waiting_permission`
- [x] 确认 OpenCode 官方 permission reply API：`POST /session/:id/permissions/:permissionID`
- [x] 接入真实权限回复 endpoint
- [x] 暴露 `opencode_permission_reply`

当前策略：`decision: "allow"` 默认回复 `once`；传 `remember: true` 时回复 `always`；`decision: "deny"` 回复 `reject`。仍需要更多真实权限阻塞场景测试，确保 permission request ID 的提取逻辑覆盖 OpenCode 返回的所有 part 形态。

## 下一步主线

- [ ] 为 task store 增加容量限制、过期清理和恢复策略
- [ ] 为 OpenCode API 增加适配层，隔离 `/session`、`/api/model` 等端点变动
- [ ] 增加 runtime crash 后的任务恢复提示：通过 `sessionID` 拉取历史并更新 task
- [ ] 增加更多 mock OpenCode server 测试，覆盖 runtime 重启、HTTP 失败、取消、权限扫描
- [ ] 清理或压缩 `dev/` 中无效探测产物

## 非主线 / 暂缓

- [ ] OpenCode Desktop viewer 集成
- [ ] Desktop session 可视化切换
- [ ] 跨平台 Desktop sidecar 探测

这些能力不是第一阶段核心。第一阶段先把 OpenCode 作为 MCP 子代理跑稳。
