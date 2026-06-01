# 项目背景

`Codex OpenCode Bridge` 的目标是让任意 MCP 客户端都能控制本机 OpenCode Desktop。

典型场景是：用户同时使用一个支持 MCP 的上游客户端和 OpenCode Desktop。过去用户需要在两个程序之间手工复制需求、复制回复、切换项目目录和会话。这个桥接器把这些操作自动化，让上游 MCP 客户端可以像用户本人一样向 OpenCode 下发指令。

## 不是只面向 Codex

项目名里保留 Codex，是因为最初的集成和验证来自 Codex。但协议层面它是一个标准 stdio MCP server，不绑定 Codex。

只要客户端支持 MCP stdio server，就可以使用这个工具，包括但不限于：

- Codex
- Claude Desktop
- OpenCode 自身的 MCP 配置
- 其他自研 MCP client

## 控制对象

本工具控制的是 OpenCode Desktop 启动的本地 sidecar：

```text
opencode-cli serve --hostname 127.0.0.1 --port <port>
```

Desktop 使用 BasicAuth 保护该 sidecar。桥接器会在本机读取 sidecar 进程环境中的：

- `OPENCODE_SERVER_USERNAME`
- `OPENCODE_SERVER_PASSWORD`

这些信息只用于本机 HTTP 调用，不会被返回给调用方。

## 设计目标

- 代替用户控制 OpenCode Desktop。
- 不读取屏幕，不依赖坐标点击。
- 能指定工作空间。
- 能指定已有对话继续交流。
- 能新建对话。
- 能指定模型。
- 能读取 OpenCode agent 返回的信息。
- 能请求桌面端切换到目标对话，让用户可见。
- 支持中文消息的 UTF-8 传输。

## 非目标

- 不绕过 OpenCode 自身权限系统。
- 不替代 OpenCode 的模型供应商配置。
- 不保存 OpenCode sidecar 密码。
- 不把用户的 OpenCode 配置文件提交进仓库。
