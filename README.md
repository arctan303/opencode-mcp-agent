# Codex OpenCode Bridge

一个面向 MCP 客户端的 OpenCode Desktop 控制桥。

它不是只给 Codex 使用。任何支持 stdio MCP 的客户端，都可以通过这个工具连接本机正在运行的 OpenCode Desktop sidecar，代替用户向 OpenCode 下发指令、指定工作空间、指定会话、指定模型，并读取 OpenCode agent 的返回信息。

当前实现面向 Windows 上的 OpenCode Desktop。它不读取屏幕，而是通过桌面端启动的本地 `opencode-cli serve` sidecar 完成控制。

## 核心能力

- 指定 OpenCode 工作空间，例如 `C:\opencode`。
- 指定已有 OpenCode session 继续对话，不必每次新建会话。
- 不指定 session 时自动创建新会话。
- 向 OpenCode agent 发送消息并读取回复。
- 指定模型，例如 `deepseek/deepseek-v4-pro`。
- 请求桌面端切换到目标 session。
- 自动发现 OpenCode Desktop sidecar 端口。
- 自动读取本机 sidecar BasicAuth，不向调用方返回密码。

## 文件

- `server.mjs`：stdio MCP server，提供 OpenCode 控制工具。
- `send-desktop-message.mjs`：命令行发送脚本，保持 UTF-8，适合发送中文。
- `read-process-env.ps1`：读取当前用户进程环境变量，用于获取 sidecar 本机认证信息。
- `BACKGROUND.md`：项目背景和设计边界。
- `ARCHITECTURE.md`：OpenCode 子代理架构、任务生命周期、MCP 工具设计。
- `ROADMAP.md`：功能进度和待办。

## Codex MCP 配置示例

```powershell
codex mcp add opencode-control -- node C:\codex\Codex-OpenCode-Bridge\server.mjs
```

其他 MCP 客户端只要支持 stdio MCP，也可以使用同一个入口：

```text
command: node
args: C:\codex\Codex-OpenCode-Bridge\server.mjs
```

## 直接发送消息

新建会话：

```powershell
node C:\codex\Codex-OpenCode-Bridge\send-desktop-message.mjs `
  --cwd=C:\opencode `
  --model=deepseek/deepseek-v4-pro `
  --title="Codex bridge" `
  --message="请确认当前工作空间，只回复 OK。"
```

复用已有会话：

```powershell
node C:\codex\Codex-OpenCode-Bridge\send-desktop-message.mjs `
  --cwd=C:\opencode `
  --model=deepseek/deepseek-v4-pro `
  --session=ses_xxx `
  --message="继续这个会话，只回复 OK CONTINUED。"
```

## MCP 工具

主要工具：`opencode_desktop_send`

参数：

- `message`：要发送给 OpenCode 的消息。
- `cwd`：OpenCode 工作空间。
- `model`：模型，默认 `deepseek/deepseek-v4-pro`。
- `session`：可选，指定已有 OpenCode session；不传则新建。
- `title`：新会话标题。
- `select`：是否让桌面端切到该 session，默认 `true`。
- `noReply`：只记录消息，不请求模型回复，默认 `false`。

返回字段：

- `ok`
- `desktopSidecar`
- `cwd`
- `model`
- `agent`
- `sessionID`
- `created`
- `selected`
- `assistantMessageID`
- `partCount`
- `responseText`

## 检查

```powershell
npm run check
```

## 注意

OpenCode Desktop 必须正在运行。该桥接器读取的认证信息只用于连接本机 `127.0.0.1` sidecar，不会写入日志，也不会返回给 MCP 客户端。
