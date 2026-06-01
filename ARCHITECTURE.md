# 架构设计

本文档定义 `Codex OpenCode Bridge` 的目标架构。核心原则是：对外暴露 OpenCode 子代理能力，而不是暴露某个具体桌面端或命令行实现细节。

## 目标抽象

MCP 客户端看到的应该是一个可调用的 OpenCode agent worker：

```text
MCP Client
  -> Codex OpenCode Bridge MCP
    -> OpenCode Agent Worker
      -> backend: desktop | headless
        -> OpenCode session / model / workspace / tools
```

上游客户端的核心动作是“把任务派给 OpenCode”，而不是“向某个 HTTP endpoint 发消息”。

## 核心对象

### Task

`task` 是 MCP 对外的主要执行单元。

字段建议：

- `taskID`：桥接器生成的任务 ID。
- `sessionID`：OpenCode session ID。
- `workspace`：任务工作空间。
- `model`：OpenCode 模型。
- `agent`：OpenCode agent。
- `backend`：实际使用的 backend。
- `status`：任务状态。
- `createdAt`
- `updatedAt`
- `lastMessageID`
- `result`
- `error`

### Session

`session` 是 OpenCode 的上下文载体。

桥接器不重新发明对话系统，只复用 OpenCode session：

- 指定 `sessionID` 时继续已有对话。
- 不指定 `sessionID` 时创建新对话。
- 一个 task 必须关联一个 session。

### Workspace

`workspace` 是 OpenCode 执行任务的项目根目录。

每个 task 都应显式带上 workspace，或由客户端配置默认 workspace。不要隐式依赖桥接器自身的当前目录。

### Backend

`backend` 是桥接器连接 OpenCode 的实际方式。

建议取值：

- `auto`
- `desktop`
- `headless`

第一版优先实现 `desktop`，但接口层保持 backend 可替换。

## 任务生命周期

建议状态：

- `queued`：任务已创建，尚未开始。
- `running`：OpenCode 正在执行。
- `waiting_permission`：OpenCode 等待权限确认。
- `completed`：任务完成并有结果。
- `failed`：任务失败。
- `cancelled`：任务被取消。

第一版可以同步执行，即 `opencode_task_start` 直接等待 OpenCode 返回结果。但返回结构仍应保留 `taskID` 和 `status`，为后续异步任务和轮询预留空间。

## MCP 工具设计

### 高层工具

这些是面向 MCP 客户端的主接口。

#### `opencode_task_start`

派发任务给 OpenCode 子代理。

输入：

- `prompt`
- `workspace`
- `model?`
- `agent?`
- `sessionID?`
- `backend?`
- `title?`
- `wait?`

输出：

- `taskID`
- `status`
- `sessionID`
- `messageID`
- `responseText?`
- `backend`
- `workspace`
- `model`

#### `opencode_task_status`

查询任务状态。

输入：

- `taskID`

输出：

- `taskID`
- `status`
- `sessionID`
- `lastMessageID`
- `error?`
- `permissionRequests?`

#### `opencode_task_result`

读取任务结果。

输入：

- `taskID`

输出：

- `taskID`
- `status`
- `sessionID`
- `responseText`
- `messages?`
- `changes?`
- `error?`

### 权限工具

这些工具用于转发 OpenCode 的权限请求，而不是绕过权限系统。

#### `opencode_permission_list`

列出等待处理的权限请求。

#### `opencode_permission_reply`

对指定权限请求执行 `allow` 或 `deny`。

### 辅助工具

#### `opencode_session_list`

列出 OpenCode sessions。

#### `opencode_session_messages`

读取指定 session 的历史消息。

#### `opencode_model_list`

列出 OpenCode 当前可用模型。

#### `opencode_backend_status`

检查 backend 状态，例如 Desktop 是否运行、sidecar 是否可连接。

#### `opencode_backend_launch`

按需启动 backend，例如启动 OpenCode Desktop。

## Backend 设计

### Desktop backend

当前已验证的路径：

```text
OpenCode.exe
  -> opencode-cli serve --hostname 127.0.0.1 --port <port>
```

桥接器需要：

1. 找到 OpenCode Desktop 进程。
2. 找到 Desktop sidecar 进程和端口。
3. 读取 sidecar BasicAuth 环境变量。
4. 调用 sidecar API 创建或复用 session。
5. 发送消息。
6. 读取回复。
7. 必要时请求 Desktop 切换到目标 session。

优点：

- 用户可在桌面端看到 OpenCode 会话。
- 更符合“代替用户控制 OpenCode”的直觉。

缺点：

- 依赖 Desktop 运行。
- 当前认证读取方式与平台相关。

### Headless backend

未来可以直接调用：

- `opencode run`
- 独立 `opencode serve`

优点：

- 不依赖桌面 UI。
- 更适合自动化。

缺点：

- 用户不一定能在 OpenCode Desktop 里实时看到任务。
- 与 Desktop session 同步关系需要额外验证。

## 兼容层

现有底层工具可以保留，但应作为 low-level/debug 接口：

- `opencode_desktop_send`
- `opencode_run`
- `opencode_start_server`

新架构下，推荐 MCP 客户端优先使用：

- `opencode_task_start`
- `opencode_task_status`
- `opencode_task_result`

低层工具服务于调试、兼容和 backend 实现，不作为长期主接口。

## 权限原则

桥接器可以代替用户向 OpenCode 下发指令，但不能绕过 OpenCode 的权限系统。

正确做法：

1. OpenCode 请求权限。
2. 桥接器检测并暴露该请求。
3. MCP 客户端展示或决策。
4. MCP 客户端调用 `opencode_permission_reply`。
5. 桥接器把 allow/deny 回传给 OpenCode。

## 第一版实现策略

第一版应避免一次性重写所有代码。

建议步骤：

1. 保留已验证的 Desktop sidecar 调用逻辑。
2. 在其上新增 `opencode_task_start`。
3. 返回 `taskID`、`status`、`sessionID`、`responseText`。
4. 第一版先同步等待结果。
5. 再补 `session_list`、`messages`、`model_list`。
6. 最后做权限工具和异步任务。

这样可以先把对外抽象定正确，同时复用已经可工作的 desktop backend。
