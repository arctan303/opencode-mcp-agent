# Project Background

## The Problem

Modern AI development increasingly involves multiple agents working together. A common workflow looks like this:

1. A powerful, expensive model (GPT-5.5, Claude Opus 4.6) designs the architecture, creates plans, and breaks down tasks
2. The user **manually** copies files, context, and instructions to a different agent
3. A cost-effective model (DeepSeek, Mimo) executes the actual coding work
4. The user **manually** collects results and feeds them back to the planning agent

Steps 2 and 3 are the bottleneck — they break the workflow, waste time, and introduce errors.

## The Solution

OpenCode MCP Agent eliminates the manual handoff by letting the primary agent dispatch tasks directly to OpenCode through MCP:

```text
Primary Agent (expensive, strong reasoning)
  → OpenCode MCP Agent (MCP bridge)
    → OpenCode (cheap, high-throughput execution)
      → Results flow back automatically
```

The primary agent never needs to know about ports, credentials, or API details. It simply calls MCP tools like `opencode_task_start` and gets results back.

## Two Core Benefits

### 1. Seamless Multi-Agent Workflow

Without this tool, switching between agents requires manual context transfer — copying files, pasting prompts, and tracking state across different tools. OpenCode MCP Agent makes this seamless: the planning agent dispatches tasks programmatically, and results return automatically.

### 2. Cost Optimization

Token-heavy operations like reading codebases, writing files, running tests, and iterating on implementations don't need the most expensive model. By separating planning (expensive) from execution (cheap), users can dramatically reduce costs while maintaining quality where it matters most.

## Why a Managed Runtime

OpenCode MCP Agent starts and manages its own `opencode serve` instance rather than relying on OpenCode Desktop:

```text
OpenCode MCP Agent
  → spawn opencode serve
  → random local port
  → random local BasicAuth
  → OpenCode API
```

This approach:

- Has no dependency on whether Desktop is running
- Keeps authentication credentials in process memory only
- Provides a stable, predictable control interface
- Avoids probing desktop private interfaces

## Client-Agnostic

The project was originally validated with Codex dispatching tasks to OpenCode, but the MCP interface is client-agnostic:

- Codex can use it
- Claude Desktop can use it
- OpenCode itself can use it as an MCP server
- Any custom MCP client can use it

Tool naming and return structures are designed around the MCP protocol and sub-agent semantics, not around any specific client.

## Design Principles

- **Sub-agent semantics first**: Expose tasks, status, and results — not low-level CLI/HTTP wrappers.
- **Headless runtime first**: Start a managed OpenCode runtime by default; do not depend on Desktop.
- **Explicit workspaces**: Every task must specify a workspace.
- **Reusable sessions**: Support `sessionID` so OpenCode can retain context.
- **Configurable models**: Allow specifying a model per task.
- **Observable state**: Tasks must return status, sessionID, messageID, result, and error.
- **Permission forwarding**: When OpenCode requests permission, the MCP client can approve or deny.
- **Credentials never written to disk**: Generated and held in process memory only.
- **Respect OpenCode's security boundaries**: The bridge dispatches on behalf of the user but does not bypass OpenCode's permission system.

## Current State

This is the author's first MCP tool project. The core workflow has been verified in the following environment:

| Component | Version |
|-----------|---------|
| OS | Windows 11 25H2 |
| Node.js | v24.15.0 |
| Primary Agent | Codex (GPT-5.5) |
| Execution Agent | OpenCode (DeepSeek v4 Pro) |

The project welcomes bug reports, feature requests, and contributions from the community.

---

# 项目背景 (中文版)

## 问题

现代 AI 开发越来越多地涉及多个 Agent 协作。一个常见的工作流是这样的：

1. 强大但昂贵的模型（GPT-5.5、Claude Opus 4.6）设计架构、制定方案、拆分任务
2. 用户**手动**把文件、上下文和指令复制给另一个 Agent
3. 经济实惠的模型（DeepSeek、Mimo）执行实际的编码工作
4. 用户**手动**收集结果并反馈给规划 Agent

步骤 2 和 3 是瓶颈 —— 它们打断了工作流，浪费时间，并且容易出错。

## 解决方案

OpenCode MCP Agent 通过让主力 Agent 直接通过 MCP 向 OpenCode 派发任务，消除了手动交接：

```text
主力 Agent（昂贵，强推理能力）
  → OpenCode MCP Agent（MCP 桥接器）
    → OpenCode（便宜，高吞吐执行）
      → 结果自动返回
```

主力 Agent 无需了解端口、凭证或 API 细节。它只需调用 `opencode_task_start` 等 MCP 工具，就能拿到结果。

## 两个核心价值

### 1. 无缝的多 Agent 工作流

没有这个工具，Agent 之间的切换需要手动传递上下文 —— 复制文件、粘贴提示词、在不同工具间跟踪状态。OpenCode MCP Agent 让这一切无缝化：规划 Agent 通过编程方式派发任务，结果自动返回。

### 2. 成本优化

读取代码库、写入文件、运行测试、反复迭代实现 —— 这些消耗大量 Token 的操作不需要最昂贵的模型。通过将规划（昂贵）和执行（便宜）分离，用户可以在保持关键环节质量的同时，大幅降低成本。

## 为什么要管理自己的 Runtime

OpenCode MCP Agent 启动和管理自己的 `opencode serve` 实例，而不是依赖 OpenCode Desktop：

```text
OpenCode MCP Agent
  → spawn opencode serve
  → 随机本地端口
  → 随机本地 BasicAuth
  → OpenCode API
```

这种方式：

- 不依赖 Desktop 是否运行
- 认证凭证仅保存在进程内存中
- 提供稳定、可预测的控制接口
- 避免探测桌面端私有接口

## 客户端无关

项目最初在 Codex 向 OpenCode 派发任务的场景中验证，但 MCP 接口是客户端无关的：

- Codex 可以使用
- Claude Desktop 可以使用
- OpenCode 自己也可以作为 MCP server 使用
- 任何自研 MCP 客户端都可以使用

工具命名和返回结构围绕 MCP 协议和子代理语义设计，不绑定任何特定客户端。

## 设计原则

- **子代理语义优先**：对外提供任务、状态、结果，而不是底层 CLI/HTTP wrapper。
- **Headless runtime 优先**：默认启动受管 OpenCode runtime，不依赖 Desktop。
- **工作空间显式**：每个任务必须明确 workspace。
- **会话可复用**：支持 sessionID，让 OpenCode 保持上下文。
- **模型可指定**：支持按任务指定 model。
- **状态可观察**：任务必须返回 status、sessionID、messageID、result、error。
- **权限可转发**：OpenCode 请求权限时，MCP 客户端可以执行 allow/deny。
- **认证不落盘**：进程内生成和保存，不写入仓库或日志。
- **不绕过 OpenCode 安全边界**：桥接器代替用户调度，但不破坏 OpenCode 权限系统。

## 当前状态

这是作者的第一个 MCP 工具项目。核心工作流已在以下环境中验证：

| 组件 | 版本 |
|------|------|
| 操作系统 | Windows 11 25H2 |
| Node.js | v24.15.0 |
| 主力 Agent | Codex（GPT-5.5） |
| 执行 Agent | OpenCode（DeepSeek v4 Pro） |

项目欢迎社区的 bug 报告、功能请求和贡献。
