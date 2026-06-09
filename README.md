# OpenCode MCP Agent

[![CI](https://github.com/arctan303/opencode-mcp-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/arctan303/opencode-mcp-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/opencode-mcp-agent.svg)](https://www.npmjs.com/package/opencode-mcp-agent)

**简体中文 | [English](README.en.md)**

让你的主力 AI Agent 直接把任务派发给 OpenCode —— 用最强的模型做方案，用最经济的模型跑执行。

## 为什么需要这个工具？

在多 Agent 工作流中，你可能遇到这样的问题：

- 🧠 **方案制定**需要最强模型（GPT-5.5、Claude Opus 4.6），但这些模型价格昂贵
- ⚡ **代码执行**消耗大量 Token（读文件、写代码、跑测试），用顶级模型很浪费
- 🔄 **Agent 切换**需要手动复制文件、粘贴上下文，流程割裂

OpenCode MCP Agent 解决了这些问题：

```text
主力 Agent（GPT-5.5 / Opus 4.6）
  → 制定方案、设计架构、拆分任务
  → 通过 MCP 直接派发给 OpenCode
      → OpenCode 使用便宜模型（DeepSeek / Mimo）执行
      → 自动返回结果、状态和权限请求
```

**一句话总结**：用最强的大脑做决策，用最经济的双手做执行，中间零摩擦。

## 工作原理

```text
MCP 客户端（如 Codex、Claude Desktop）
  → OpenCode MCP Agent（MCP 服务器）
    → 受管的 opencode serve（本地 runtime）
      → OpenCode agent、session、model 和 tools
```

- runtime 绑定 `127.0.0.1` 随机端口，凭证仅存于进程内存
- 不需要 OpenCode Desktop
- 支持任意 MCP 客户端

## 已验证的环境

| 组件 | 版本 |
|------|------|
| 操作系统 | Windows 11 25H2 |
| Node.js | v24.15.0 |
| 主力 Agent | Codex（GPT-5.5） |
| 执行 Agent | OpenCode（DeepSeek v4 Pro） |

> 这是作者的第一个 MCP 工具项目。如果你在其他环境中遇到问题，欢迎 [提交 Issue](https://github.com/arctan303/opencode-mcp-agent/issues) 报告 bug 或提出改进建议，我会持续优化。

## 当前状态

核心工作流已完成，并经过自动化测试和真实 runtime 测试验证：

- 受管的本地 OpenCode runtime
- 显式指定工作空间和模型
- 异步任务与持久化任务记录
- 会话创建与复用
- 进度、运行中工具和阻塞工具上报
- OpenCode 权限发现与回复
- 快速两阶段取消
- 模型和会话发现

1.0 版本提供首个稳定的面向任务的 MCP 接口。

## 环境要求

- Node.js 18 或更新版本
- 已安装并配置 OpenCode CLI
- 支持 stdio 服务器的 MCP 客户端

确认 OpenCode 可用：

```bash
opencode --version
```

如果 OpenCode 不在 `PATH` 中，请设置 `OPENCODE_BIN` 指向其可执行文件路径。

## 快速开始

### 从 npm 安装

```bash
npm install -g opencode-mcp-agent
```

然后在 MCP 客户端中注册：

```json
{
  "mcpServers": {
    "opencode-control": {
      "command": "opencode-mcp-agent"
    }
  }
}
```

### 从源码安装

```bash
git clone https://github.com/arctan303/opencode-mcp-agent.git
cd opencode-mcp-agent
npm run check
```

在 Codex 中注册：

```bash
codex mcp add opencode-control -- node /path/to/opencode-mcp-agent/server.mjs
```

通用 stdio MCP 配置：

```json
{
  "mcpServers": {
    "opencode-control": {
      "command": "node",
      "args": ["/absolute/path/to/opencode-mcp-agent/server.mjs"]
    }
  }
}
```

更改配置后需重启 MCP 客户端。

## 典型使用场景

### 场景 1：方案制定 + 代码执行分离

1. 在 Codex 中使用 GPT-5.5 制定项目方案和设计文档
2. GPT-5.5 通过 `opencode_task_start` 直接将实现任务派发给 OpenCode
3. OpenCode 使用 DeepSeek v4 Pro 等经济模型执行代码编写
4. 主力 Agent 通过 `opencode_task_status` 跟踪进度
5. 完成后通过 `opencode_task_result` 收集结果

### 场景 2：批量任务并行

1. 主力 Agent 拆分大任务为多个子任务
2. 依次调用 `opencode_task_start`（`wait: false`）派发
3. 并行查询各任务状态和结果

## 推荐的任务流程

1. 调用 `opencode_model_list` 查看已配置的模型。
2. 调用 `opencode_task_start`，显式指定 `workspace`，通常使用 `wait: false`。
3. 轮询 `opencode_task_status`。
4. 如果任务进入 `waiting_permission` 状态，调用 `opencode_permission_list` 查看请求，然后调用 `opencode_permission_reply` 回复。
5. 使用 `opencode_task_result` 读取最终结果。

任务参数示例：

```json
{
  "workspace": "C:\\projects\\example",
  "model": "provider/model",
  "prompt": "分析这个项目并报告性能风险。不要修改文件。",
  "wait": false,
  "timeoutMs": 600000
}
```

`timeoutMs` 是 OpenCode 模型和工具请求的最大生存时间。即使 `wait` 为 `false` 也会生效，且独立于 MCP 客户端的超时设置。

## MCP 工具

| 工具 | 用途 |
|---|---|
| `opencode_task_start` | 创建或继续 OpenCode 任务 |
| `opencode_task_list` | 查找已持久化的桥接任务 |
| `opencode_task_status` | 刷新任务、工具、会话和权限状态 |
| `opencode_task_result` | 读取完整的任务结果 |
| `opencode_task_cancel` | 请求取消，不阻塞等待确认 |
| `opencode_session_list` | 列出 OpenCode 会话 |
| `opencode_session_messages` | 读取紧凑或原始会话消息 |
| `opencode_model_list` | 列出 OpenCode 可用模型 |
| `opencode_permission_list` | 列出真实的待处理权限 |
| `opencode_permission_reply` | 以 `once`、`always` 或 `reject` 回复 |
| `opencode_runtime_status` | 检查受管 runtime 状态 |
| `opencode_runtime_start` | 启动受管 runtime |
| `opencode_runtime_stop` | 停止受管 runtime |

长时间运行的调用应使用 `wait: false`。MCP 请求是并发处理的，因此在另一个请求等待时仍可查询状态和回复权限。

取消是两阶段的：`opencode_task_cancel` 首先返回 `cancelRequested: true`；在 OpenCode 确认会话中止后，任务变为 `cancelled`。

## 配置

| 环境变量 | 用途 |
|---|---|
| `OPENCODE_BIN` | OpenCode 可执行文件路径 |
| `OPENCODE_CONFIG` | OpenCode 配置文件路径 |
| `OPENCODE_BRIDGE_STATE` | 任务状态 JSON 文件路径 |
| `OPENCODE_BRIDGE_DEBUG_TOOLS=1` | 暴露 legacy/debug MCP 工具 |

默认情况下，任务状态存储在仓库外的用户本地应用状态目录中。

## 安全模型

- 受管服务器仅监听 `127.0.0.1`。
- 每次 runtime 启动时生成随机端口和随机 Basic Authentication 凭证。
- runtime 凭证仅存在于桥接器进程内存中。
- 桥接器不存储模型供应商凭证。
- OpenCode 权限被转发，而非绕过。
- `always` 授权应在检查权限类型和模式后才批准。

安全问题报告请参阅 [SECURITY.md](SECURITY.md)。

## 开发

```bash
npm run check
```

check 命令运行语法检查和 Node.js 测试套件。

构建 npm 发布产物：

```bash
npm run build
```

构建会运行所有检查，并将 tarball、`SHA256SUMS` 和 `manifest.json` 写入 `dist/`。

项目文档：

- [项目背景 / BACKGROUND.md](docs/BACKGROUND.md)
- [架构设计 / ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [功能进度 / ROADMAP.md](docs/ROADMAP.md)
- [贡献指南 / CONTRIBUTING.md](CONTRIBUTING.md)
- [更新日志 / CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT
