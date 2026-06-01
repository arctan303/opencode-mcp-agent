# 项目背景

`Codex OpenCode Bridge` 的核心目标，是把 OpenCode 变成一个可以被 MCP 客户端调用的子代理。

更准确地说，它不是一个单纯的 OpenCode Desktop 控制脚本，也不是只给 Codex 使用的私人工具。它应该是一个通用 MCP server：任何支持 MCP 的客户端安装它之后，都可以把任务派发给本机 OpenCode，让 OpenCode 在指定工作空间、指定模型、指定会话里执行任务，并把执行状态和结果返回给上游客户端。

## 核心目标

让 MCP 客户端可以像调用子代理一样调用 OpenCode：

```text
MCP Client
  -> Codex OpenCode Bridge
    -> OpenCode Agent
      -> workspace / model / session / tools
```

上游客户端不应该只是在“发送一条消息”。它真正需要的是一个可观察、可复用、可授权的任务执行单元：

- 派发任务给 OpenCode。
- 指定任务工作空间。
- 指定 OpenCode 使用的模型。
- 指定已有对话继续执行，或创建新对话。
- 接收 OpenCode agent 的回复。
- 获取任务状态：运行中、完成、失败、等待权限。
- 在 OpenCode 需要授权时，由上游客户端代替用户通过或拒绝。
- 必要时让用户在 OpenCode Desktop 里看到对应会话。

## 为什么需要这个项目

用户同时使用多个 AI 编程工具时，经常会出现人工中转：

1. 在一个 MCP 客户端里描述任务。
2. 手工复制给 OpenCode。
3. 等 OpenCode 回复。
4. 再把结果复制回原客户端。
5. 如果工作空间、模型、会话或权限有变化，还要手动同步状态。

这个项目要消除这层人工中转。安装 MCP 后，上游客户端可以直接把 OpenCode 当作一个下游执行代理使用。

## 不只面向 Codex

项目名保留 Codex，是因为最初的验证来自 Codex 场景：让 Codex 把任务派给 OpenCode。

但协议层面它应保持通用：

- Codex 可以使用。
- Claude Desktop 可以使用。
- OpenCode 自己也可以把它作为 MCP server 使用。
- 其他自研 MCP client 也可以使用。

因此，文档、工具命名和返回结构都应尽量避免只围绕 Codex 特性设计。

## Desktop 与 Headless 的关系

OpenCode 有两种可用形态：

1. Desktop backend
   - 连接 OpenCode Desktop 启动的本地 sidecar。
   - 用户可以在桌面端看到会话。
   - 适合“用户希望观察 OpenCode 正在做什么”的场景。

2. Headless backend
   - 直接调用 OpenCode CLI 或独立 `opencode serve`。
   - 不依赖桌面 UI。
   - 适合自动化和后台执行。

项目的主抽象不应该是 Desktop，也不应该是 CLI，而应该是 `OpenCode Agent`。

Desktop 和 Headless 只是 backend。对 MCP 客户端来说，理想接口应该是“派发任务给 OpenCode 子代理”，而不是“点击桌面端”或“包一层 CLI”。

## 当前现实约束

目前已验证最稳定的路径是 OpenCode Desktop sidecar：

```text
OpenCode.exe
  -> opencode-cli serve --hostname 127.0.0.1 --port <port>
```

Desktop 会通过本机 BasicAuth 保护 sidecar。桥接器需要读取 sidecar 进程环境中的：

- `OPENCODE_SERVER_USERNAME`
- `OPENCODE_SERVER_PASSWORD`

这些信息只用于本机 `127.0.0.1` 调用，不应写入日志，不应返回给 MCP 客户端，也不应保存到仓库。

## 设计原则

- 子代理语义优先：对外提供任务、状态、结果，而不是只提供底层 HTTP/CLI wrapper。
- 工作空间显式：每次任务都应清楚指定或继承 workspace。
- 会话可复用：支持指定已有 session，让 OpenCode 保持上下文。
- 模型可指定：支持按任务指定 model。
- 结果可观察：返回 OpenCode agent 的回复、消息 ID、会话 ID、执行状态。
- 权限可转发：OpenCode 请求权限时，MCP 客户端应能看到并做 allow/deny。
- Desktop 可见但不绑死：Desktop backend 很重要，但不能让整个项目只能服务桌面端。
- 不绕过 OpenCode 安全边界：桥接器代替用户操作，但不破坏 OpenCode 的权限系统。

## 非目标

- 不做模型供应商管理平台。
- 不保存用户的 OpenCode 密钥或配置文件。
- 不绕过 OpenCode 的工具权限确认。
- 不把屏幕读取、坐标点击作为核心机制。
- 不强制所有使用场景都启动 OpenCode Desktop。

## 第一阶段判断

第一阶段可以优先实现 Desktop backend，因为它已经验证可行，并且能让用户看到 OpenCode 的会话。

但文档和工具设计应提前为 `OpenCode as sub-agent` 保留空间。后续即使增加 Headless backend，也不应该改变上游 MCP 客户端的主要调用方式。
