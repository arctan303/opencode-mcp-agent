# 项目背景

OpenCode MCP Agent 的核心目标，是把 OpenCode 变成一个可被 MCP 客户端调用的子代理。

它不是桌面端控制器，也不是为了让用户实时观看 OpenCode Desktop。它应该提供一个受管的 OpenCode runtime，让任意 MCP 客户端可以把任务派发给 OpenCode，并拿到任务状态、权限请求和最终结果。

## 核心目标

让 MCP 客户端可以像调用子代理一样调用 OpenCode：

```text
MCP Client
  -> OpenCode MCP Agent
    -> Managed OpenCode Runtime
      -> OpenCode session / model / workspace / tools
```

上游客户端需要的不是“控制一个窗口”，而是一个可观察、可复用、可授权的任务执行单元：

- 派发任务给 OpenCode。
- 指定任务工作空间。
- 指定 OpenCode 使用的模型。
- 指定已有会话继续执行，或创建新会话。
- 获取 OpenCode agent 的回复。
- 获取任务状态：运行中、完成、失败、等待权限。
- 在 OpenCode 需要授权时，由 MCP 客户端代替用户通过或拒绝。

## 为什么不要把 Desktop 当核心

OpenCode Desktop bridge 的价值主要是：

- 用户可以看到桌面端会话。
- 用户之后可以在桌面端接着对话。

但如果 OpenCode 被当作子代理使用，这两个价值不是核心。用户通常不会实时盯着子代理输出；上游 MCP 客户端更需要的是状态、结果、错误和权限请求。

把 Desktop 作为核心会带来额外复杂度：

- 必须依赖 Desktop 是否启动。
- 需要发现 Desktop sidecar 端口。
- 需要读取 Desktop sidecar 的本机认证环境变量。
- 容易变成探测私有接口，而不是稳定控制 OpenCode runtime。
- Desktop UI 同步状态会影响本来应该独立的子代理执行。

因此，Desktop 不作为本项目核心路径。

## 新核心路径

本项目应启动并管理自己的 OpenCode runtime：

```text
OpenCode MCP Agent
  -> spawn opencode serve
  -> random local port
  -> random local BasicAuth
  -> OpenCode API
```

桥接器负责启动、维护和调用这个 runtime。MCP 客户端只面对任务接口，不需要知道端口、认证、进程和 API 细节。

## 不只面向 Codex

项目名保留 Codex，是因为最初验证来自 Codex 场景：让 Codex 把任务派给 OpenCode。

协议层面它应保持通用：

- Codex 可以使用。
- Claude Desktop 可以使用。
- OpenCode 自己也可以把它作为 MCP server 使用。
- 其他自研 MCP client 也可以使用。

因此，工具命名和返回结构都应围绕 MCP 和 OpenCode 子代理设计，而不是围绕某一个客户端。

## 设计原则

- 子代理语义优先：对外提供任务、状态、结果，而不是底层 CLI/HTTP wrapper。
- Headless runtime 优先：默认启动受管 OpenCode runtime，不依赖 Desktop。
- 工作空间显式：每个任务必须明确 workspace，或使用明确配置的默认 workspace。
- 会话可复用：支持 sessionID，让 OpenCode 保持上下文。
- 模型可指定：支持按任务指定 model。
- 状态可观察：任务必须返回 status、sessionID、messageID、result、error。
- 权限可转发：OpenCode 请求权限时，MCP 客户端应能看到并执行 allow/deny。
- 认证不落盘：runtime 的本地认证应进程内生成和保存，不写入仓库或日志。
- 不绕过 OpenCode 安全边界：桥接器代替用户调度，但不破坏 OpenCode 权限系统。

## 非目标

- 不控制 OpenCode Desktop 作为核心功能。
- 不依赖屏幕读取或坐标点击。
- 不探测桌面端私有接口作为主路径。
- 不做模型供应商管理平台。
- 不保存用户 OpenCode 密钥或配置文件。
- 不绕过 OpenCode 的工具权限确认。

## 第一阶段判断

第一阶段应聚焦 managed headless runtime：

1. 启动受管 `opencode serve`。
2. 使用随机端口和随机 BasicAuth。
3. 通过 OpenCode API 创建或复用 session。
4. 向 OpenCode 发送任务。
5. 返回任务状态和结果。
6. 转发权限请求并持久化任务状态。

Desktop 相关能力不进入第一阶段主线。
