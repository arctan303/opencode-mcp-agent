# Codex OpenCode Bridge

让 Codex 通过本机 OpenCode Desktop sidecar 向 OpenCode 发消息、指定工作空间、指定模型、复用会话，并读取 OpenCode 回复。

当前实现面向 Windows 上的 OpenCode Desktop。它不会读取屏幕，而是连接桌面端启动的本地 `opencode-cli serve` sidecar。

## 能力

- 自动发现 OpenCode Desktop sidecar 端口。
- 从 sidecar 进程环境读取本机 BasicAuth。
- 创建或复用 OpenCode session。
- 指定工作空间，例如 `C:\opencode`。
- 指定模型，例如 `deepseek/deepseek-v4-pro`。
- 请求桌面端切换到目标 session。
- 返回 OpenCode 回复正文 `responseText`。

## 文件

- `server.mjs`：stdio MCP server，提供 `opencode_desktop_send` 等工具。
- `send-desktop-message.mjs`：命令行发送脚本，保持 UTF-8，适合发送中文。
- `read-process-env.ps1`：读取当前用户进程环境变量，用于获取 sidecar 本机认证信息。

## Codex MCP 配置

```powershell
codex mcp add opencode-control -- node C:\codex\Codex-OpenCode-Bridge\server.mjs
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
- `session`：可选，指定已有 OpenCode session，不传则新建。
- `title`：新会话标题。
- `select`：是否让桌面端切到该 session，默认 `true`。
- `noReply`：只记录消息不请求模型回复，默认 `false`。

返回字段里会包含：

- `sessionID`
- `created`
- `selected`
- `assistantMessageID`
- `responseText`

## 检查

```powershell
npm run check
```

## 注意

OpenCode Desktop 必须正在运行。该桥接器读取的认证信息只用于连接本机 `127.0.0.1` sidecar，不会写入日志或返回给调用方。
