# 架构设计

本文档定义 OpenCode MCP Agent 的目标架构。核心原则：OpenCode 是一个受管子代理 runtime，不是桌面端窗口，也不是简单 CLI wrapper。

## 总体架构

```text
MCP Client
  -> OpenCode MCP Agent Server
    -> Task Manager
      -> Managed OpenCode Runtime
        -> opencode serve
        -> OpenCode API
```

MCP 客户端发起任务；桥接器管理 OpenCode runtime、session、权限和结果；OpenCode 执行实际 agent 工作。

## 核心对象

### Task

Task 是 MCP 对外的主要执行单元。

当前核心字段：

- `taskID`：桥接器生成的任务 ID。
- `status`：任务状态。
- `workspace`：任务工作空间。
- `model`：OpenCode 模型。
- `agent`：OpenCode agent。
- `sessionID`：OpenCode session ID。
- `messageID`：OpenCode message ID。
- `createdAt`
- `updatedAt`
- `result`
- `error`
- `permissionRequests`

### Session

Session 是 OpenCode 的上下文载体。

- 指定 `sessionID` 时继续已有会话。
- 不指定 `sessionID` 时创建新会话。
- Task 必须关联一个 session。
- 长期上下文以 OpenCode session 为准，bridge task 只是调度记录。

### Runtime

Runtime 是桥接器启动和管理的 OpenCode 服务实例。

第一版 runtime：

- 通过 `opencode serve` 启动。
- 绑定 `127.0.0.1`。
- 使用随机可用端口。
- 使用随机 BasicAuth。
- 认证只存在于当前 bridge 进程内。

## 任务状态

建议状态：

- `queued`：任务已创建，尚未开始。
- `running`：OpenCode 正在执行。
- `waiting_permission`：OpenCode 等待权限确认。
- `cancel_requested`：取消请求已接受，正在等待 OpenCode 确认停止。
- `completed`：任务完成。
- `failed`：任务失败。
- `cancelled`：任务被取消。

任务默认异步启动。调用方通过 `taskID` 查询进度、处理权限并读取结果；短任务可以选择同步等待。

## MCP 工具设计

### 主工具

#### `opencode_task_start`

派发任务给 OpenCode 子代理。

输入：

- `prompt`
- `workspace`
- `model?`
- `agent?`
- `sessionID?`
- `title?`
- `wait?`
- `timeoutMs?`

输出：

- `taskID`
- `status`
- `sessionID`
- `messageID?`
- `responseText?`
- `workspace`
- `model`
- `agent`
- `error?`

#### `opencode_task_status`

查询任务状态。

输入：

- `taskID`

输出：

- `taskID`
- `status`
- `sessionID`
- `messageID?`
- `permissionRequests?`
- `error?`

#### `opencode_task_result`

读取任务结果。

输入：

- `taskID`

输出：

- `taskID`
- `status`
- `sessionID`
- `responseText?`
- `messages?`
- `changes?`
- `error?`

#### `opencode_task_cancel`

取消正在运行的任务。

### 权限工具

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

列出 OpenCode 可用模型。

#### `opencode_runtime_status`

检查受管 OpenCode runtime 是否运行。

#### `opencode_runtime_start`

启动受管 OpenCode runtime。

#### `opencode_runtime_stop`

停止受管 OpenCode runtime。

## Runtime 管理

### 启动

Bridge 启动时可以延迟启动 runtime。第一次调用 `opencode_task_start` 时，如果 runtime 不存在，则自动启动。

启动策略：

1. 查找 OpenCode CLI。
2. 分配随机可用端口。
3. 生成随机 username/password。
4. 设置 `OPENCODE_SERVER_USERNAME` 和 `OPENCODE_SERVER_PASSWORD`。
5. 启动 `opencode serve --hostname 127.0.0.1 --port <port>`。
6. 等待 `/session` 或 health endpoint 可访问。

OpenCode CLI 查找优先级：

1. `OPENCODE_BIN` 环境变量。
2. PATH 里的 `opencode` / `opencode.exe`。
3. npm global 安装路径。
4. Desktop bundled `opencode-cli.exe` 作为最后 fallback。

### 认证

认证只保存在 bridge 进程内：

- 不写日志。
- 不写配置文件。
- 不返回给 MCP 客户端。
- runtime 重启后重新生成。

### 关闭

Bridge 可以提供 `opencode_runtime_stop`。是否自动关闭 runtime 由后续配置决定。

## Desktop 位置

Desktop 不作为核心 backend。

如果未来需要让用户查看某个 session，可以单独设计 viewer 功能。但 viewer 不能影响主任务执行链路，也不能成为默认路径。

## 兼容层

现有工具可以临时保留，但不作为推荐接口：

- `opencode_run`
- `opencode_start_server`
- `opencode_desktop_send` 如果仍存在，只能作为 debug/legacy。

长期推荐接口只有 task/session/model/permission/runtime 这组子代理语义工具。

## 第一版实现策略

1. 清理 Desktop 主线相关代码。
2. 抽出 managed runtime 模块。
3. 让 `opencode_task_start` 使用 managed runtime。
4. 使用随机端口和随机 BasicAuth，替代固定 `31555` 和固定密码。
5. task map 持久化到用户本地应用状态目录，运行中的请求控制器仅保存在当前进程。
6. 文档和 README 全部改为 headless 子代理定位。
7. Desktop 私有接口探测脚本不进入公开仓库。
