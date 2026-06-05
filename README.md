# Codex OpenCode Bridge

一个让 MCP 客户端把任务派发给 OpenCode 子代理的桥接器。

它的目标不是控制 OpenCode Desktop，而是启动并管理一个受管的 OpenCode runtime，让任意 MCP 客户端可以把 OpenCode 当作子代理使用：指定工作空间、指定模型、复用会话、发送任务、读取状态和结果，并在需要时处理权限请求。

## 核心定位

```text
MCP Client
  -> Codex OpenCode Bridge
    -> Managed OpenCode Runtime
      -> OpenCode Agent
```

Desktop 不作为第一阶段核心路径。OpenCode Desktop 可视化会话不是本项目的主要目标；它最多是未来的可选 viewer。当前主线是 managed headless runtime。

## 目标能力

- 启动受管 `opencode serve`。
- 默认优先使用终端/global OpenCode CLI；找不到时才 fallback 到 Desktop bundled CLI。
- 使用随机本地端口和随机 BasicAuth。
- 指定工作空间。
- 指定模型。
- 创建或复用 OpenCode session。
- 派发任务给 OpenCode agent。
- 查询任务状态。
- 读取任务结果。
- 读取 session 历史消息。
- 列出可用模型。
- 发现并暴露 OpenCode 权限请求，并通过 OpenCode Server API 回复权限请求。

## 推荐 MCP 工具

第一阶段目标工具：

- `opencode_task_start`
- `opencode_task_status`
- `opencode_task_result`
- `opencode_task_cancel`
- `opencode_session_list`
- `opencode_session_messages`
- `opencode_model_list`
- `opencode_runtime_status`
- `opencode_runtime_start`
- `opencode_runtime_stop`
- `opencode_permission_list`
- `opencode_permission_reply`

`opencode_model_list` 会通过受管 runtime 的 OpenCode API 读取实际可用模型，支持按 `provider` 过滤，并可用 `verbose` 返回完整模型元数据。

`opencode_permission_list` 会扫描已跟踪任务和指定 session 的消息历史，返回疑似 permission / approval 请求。`opencode_permission_reply` 调用 OpenCode Server 的 `POST /session/:id/permissions/:permissionID`；`decision: "allow"` 默认映射为 `response: "once"`，传 `remember: true` 时映射为 `response: "always"`，`decision: "deny"` 映射为 `response: "reject"`。

`opencode_task_status` 默认会从 OpenCode session 同步紧凑进度，包括最近消息、工具调用数量、读取过的文件和最后活动时间。`opencode_session_messages` 默认返回压缩后的消息摘要，避免把大文件读取结果完整塞回 MCP 响应；需要原始消息时传 `verbose: true`。

现有低层工具如果保留，只作为 debug/legacy，不作为推荐接口。默认不会暴露 legacy/debug 工具；设置 `OPENCODE_BRIDGE_DEBUG_TOOLS=1` 后才会出现在 MCP tool list。

## 仓库文件

- `server.mjs`：MCP stdio 入口。
- `src/`：核心实现。
- `ARCHITECTURE.md`：架构设计。
- `BACKGROUND.md`：项目背景。
- `ROADMAP.md`：功能进度。
- `read-process-env.ps1`：历史 Desktop 探测脚本，后续不应作为主线依赖。
- `send-desktop-message.mjs`：历史 UTF-8 发送脚本，后续应降级为 debug/legacy 或移除。

## MCP 配置示例

```powershell
codex mcp add opencode-control -- node C:\git\Codex-OpenCode-Bridge\server.mjs
```

其他支持 stdio MCP 的客户端也可以使用同一个入口：

```text
command: node
args: C:\git\Codex-OpenCode-Bridge\server.mjs
```

## 开发检查

```powershell
npm run check
```

## 设计原则

- 不依赖 OpenCode Desktop。
- 优先使用终端/global `opencode` 作为 runtime 执行器。
- 不读取屏幕，不使用坐标点击。
- 不探测桌面端私有接口作为主路径。
- 不保存用户密钥。
- 不把本地 BasicAuth 写入日志或配置。
- 不绕过 OpenCode 权限系统。

## 当前状态

项目正在从 Desktop bridge 原型收敛到 managed headless OpenCode runtime。详见：

- `BACKGROUND.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
