# 功能进度

架构原则见 `ARCHITECTURE.md`。当前方向是 managed headless OpenCode runtime，不再以 OpenCode Desktop bridge 为主线。

## 已完成

- [x] MCP stdio server 基础入口
- [x] OpenCode API 调用验证
- [x] session 创建/复用验证
- [x] 发送消息并读取 OpenCode agent 回复验证
- [x] 通过 runtime API 列出可用模型：`opencode_model_list`
- [x] UTF-8 中文发送脚本验证
- [x] 子代理架构文档

## 下一步主线

- [ ] 清理根目录探测脚本，移动到 `dev/` 或删除
- [ ] 重写 README，移除 Desktop 主线描述
- [ ] 实现 managed runtime：随机端口、随机 BasicAuth、进程内保存认证
- [ ] 让 `opencode_task_start` 使用 managed runtime
- [ ] 实现 `opencode_task_status`
- [ ] 实现 `opencode_task_result`
- [ ] 实现 `opencode_session_list`
- [ ] 实现 `opencode_session_messages`
- [x] 实现 `opencode_model_list`

## 权限能力

- [ ] 研究 OpenCode 权限请求 API
- [ ] 暴露 `opencode_permission_list`
- [ ] 暴露 `opencode_permission_reply`
- [ ] 当任务等待权限时返回 `waiting_permission`

## Runtime 能力

- [ ] `opencode_runtime_status`
- [ ] `opencode_runtime_start`
- [ ] `opencode_runtime_stop`
- [ ] runtime 异常退出检测
- [ ] task 与 OpenCode session 的恢复策略

## 非主线 / 暂缓

- [ ] OpenCode Desktop viewer 集成
- [ ] Desktop session 可视化切换
- [ ] 跨平台 Desktop sidecar 探测

这些能力不是第一阶段核心。第一阶段先把 OpenCode 作为 MCP 子代理跑稳。
