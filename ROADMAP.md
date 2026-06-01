# 功能进度

架构原则见 `ARCHITECTURE.md`。后续功能应优先围绕 `OpenCode as sub-agent` 的任务抽象实现，而不是继续扩展零散的底层 wrapper。

## 已完成

- [x] MCP stdio server：`server.mjs`
- [x] 自动发现 OpenCode Desktop sidecar 进程和端口
- [x] 读取本机 sidecar BasicAuth 环境变量
- [x] 指定工作空间：`cwd`
- [x] 新建 OpenCode session
- [x] 指定已有 session 继续对话：`session`
- [x] 向 OpenCode agent 发送消息：`message`
- [x] 指定模型：`model`
- [x] 获取 OpenCode agent 回复：`responseText`
- [x] 请求桌面端切换到目标 session：`select`
- [x] UTF-8 中文发送脚本：`send-desktop-message.mjs`
- [x] 基础语法检查：`npm run check`

## 进行中 / 待完善

- [ ] 子代理任务接口：`opencode_task_start`
- [ ] 任务状态查询：`opencode_task_status`
- [ ] 任务结果读取：`opencode_task_result`
- [ ] 权限交互：当 OpenCode agent 请求用户授权时，暴露权限列表和通过/拒绝接口。
- [ ] 会话列表：列出已有 OpenCode sessions，便于 MCP 客户端选择目标对话。
- [ ] 会话消息读取：读取指定 session 的历史消息。
- [ ] 模型列表：列出当前 OpenCode 可用模型。
- [ ] 工作空间状态：返回当前 Desktop sidecar 认为的项目/工作空间信息。
- [ ] 错误结构化：把 sidecar HTTP 错误统一成稳定的 MCP 返回格式。
- [ ] 跨平台支持评估：macOS/Linux OpenCode Desktop 的 sidecar 鉴权和进程环境读取方式。

## 可能新增的 MCP 工具

- `opencode_desktop_send`
  - 已有。发送消息，可新建或复用 session，并返回回复。
- `opencode_desktop_sessions`
  - 列出已有 session。
- `opencode_desktop_messages`
  - 读取指定 session 历史消息。
- `opencode_desktop_models`
  - 列出模型。
- `opencode_desktop_permissions`
  - 查看当前等待处理的权限请求。
- `opencode_desktop_permission_reply`
  - 对权限请求执行 allow/deny。

## 第一阶段目标

让任意 MCP 客户端可以完成完整的 OpenCode Desktop 代理操作闭环：

1. 选择工作空间。
2. 选择或创建对话。
3. 选择模型。
4. 发送消息。
5. 获取回复。
6. 必要时处理权限请求。
7. 在桌面端可见地切换到目标对话。
