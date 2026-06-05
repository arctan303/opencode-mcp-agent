export const coreTools = [
  {
    name: "opencode_task_start",
    description: "Start a task in a managed OpenCode runtime.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Task prompt sent to OpenCode." },
        workspace: { type: "string", description: "Workspace directory for the task." },
        model: {
          type: "string",
          default: "deepseek/deepseek-v4-pro",
          description: "provider/model, for example deepseek/deepseek-v4-pro.",
        },
        agent: { type: "string", default: "build" },
        sessionID: { type: "string", description: "Existing OpenCode session ID to continue." },
        title: { type: "string", default: "Codex bridge" },
        wait: { type: "boolean", default: false, description: "Wait for completion before returning." },
        noReply: {
          type: "boolean",
          default: false,
          description: "Only record the user message without asking the model to answer.",
        },
        timeoutMs: { type: "number", default: 600000 },
        message: { type: "string", description: "Deprecated alias for prompt." },
        cwd: { type: "string", description: "Deprecated alias for workspace." },
        session: { type: "string", description: "Deprecated alias for sessionID." },
      },
      required: ["prompt", "workspace"],
    },
  },
  {
    name: "opencode_task_status",
    description: "Check the status of an OpenCode task, including compact session progress when available.",
    inputSchema: {
      type: "object",
      properties: {
        taskID: { type: "string" },
        refresh: { type: "boolean", default: true, description: "Refresh progress from the OpenCode session before returning." },
        timeoutMs: { type: "number", default: 30000 },
      },
      required: ["taskID"],
    },
  },
  {
    name: "opencode_task_result",
    description: "Get the result of an OpenCode task.",
    inputSchema: {
      type: "object",
      properties: {
        taskID: { type: "string" },
        refresh: { type: "boolean", default: false, description: "Refresh progress from the OpenCode session before returning." },
        timeoutMs: { type: "number", default: 30000 },
      },
      required: ["taskID"],
    },
  },
  {
    name: "opencode_task_cancel",
    description: "Cancel an active OpenCode task started by this bridge process.",
    inputSchema: {
      type: "object",
      properties: {
        taskID: { type: "string" },
        timeoutMs: { type: "number", default: 30000 },
      },
      required: ["taskID"],
    },
  },
  {
    name: "opencode_runtime_status",
    description: "Check the managed OpenCode runtime status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "opencode_runtime_start",
    description: "Start the managed OpenCode runtime if it is not running.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Initial working directory for opencode serve." },
        timeoutMs: { type: "number", default: 60000 },
      },
    },
  },
  {
    name: "opencode_runtime_stop",
    description: "Stop the managed OpenCode runtime.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "opencode_session_list",
    description: "List OpenCode sessions through the managed runtime.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Workspace directory for session lookup." },
        limit: { type: "number", default: 20 },
        search: { type: "string" },
      },
    },
  },
  {
    name: "opencode_session_messages",
    description: "Read messages from an OpenCode session through the managed runtime.",
    inputSchema: {
      type: "object",
      properties: {
        sessionID: { type: "string" },
        workspace: { type: "string", description: "Workspace directory for the session." },
        limit: { type: "number", default: 50 },
        verbose: { type: "boolean", default: false, description: "Return full raw OpenCode messages instead of compact summaries." },
        maxPartText: { type: "number", default: 500, description: "Maximum text/output preview length per message part when verbose is false." },
      },
      required: ["sessionID"],
    },
  },
  {
    name: "opencode_model_list",
    description: "List models available to the managed OpenCode runtime.",
    inputSchema: {
      type: "object",
      properties: {
        workspace: { type: "string", description: "Workspace directory used to load OpenCode config." },
        provider: { type: "string", description: "Optional provider ID filter, for example deepseek." },
        verbose: { type: "boolean", default: false, description: "Return full model metadata." },
      },
    },
  },
  {
    name: "opencode_permission_list",
    description: "List permission requests detected in tracked tasks or a session message history.",
    inputSchema: {
      type: "object",
      properties: {
        sessionID: { type: "string", description: "Optional session ID to scan." },
        workspace: { type: "string", description: "Workspace directory for session lookup." },
        timeoutMs: { type: "number", default: 30000 },
      },
    },
  },
  {
    name: "opencode_permission_reply",
    description: "Reply to an OpenCode permission request.",
    inputSchema: {
      type: "object",
      properties: {
        sessionID: { type: "string" },
        taskID: { type: "string" },
        permissionID: { type: "string", description: "OpenCode permission request ID." },
        requestID: { type: "string", description: "Deprecated alias for permissionID." },
        decision: { type: "string", enum: ["allow", "deny"], description: "allow maps to once/always; deny maps to reject." },
        response: { type: "string", enum: ["once", "always", "reject"], description: "Native OpenCode permission response." },
        remember: { type: "boolean", default: false, description: "When decision is allow, remember maps to the native always response." },
        workspace: { type: "string", description: "Workspace directory for the session." },
        timeoutMs: { type: "number", default: 30000 },
      },
      required: ["sessionID"],
    },
  },
];

export const debugTools = [
  {
    name: "opencode_run",
    description:
      "Legacy/debug: send one message through OpenCode CLI directly.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        cwd: { type: "string", description: "Workspace directory for OpenCode." },
        model: {
          type: "string",
          description: "Model ID, for example deepseek/deepseek-v4-pro.",
        },
        session: { type: "string", description: "Continue this OpenCode session ID." },
        continueLast: { type: "boolean", description: "Continue the most recent session." },
        agent: { type: "string" },
        format: { type: "string", enum: ["default", "json"], default: "default" },
        timeoutMs: { type: "number", default: 120000 },
      },
      required: ["message"],
    },
  },
  {
    name: "opencode_models",
    description: "List models known to OpenCode.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string" },
        verbose: { type: "boolean", default: false },
        refresh: { type: "boolean", default: false },
        timeoutMs: { type: "number", default: 60000 },
      },
    },
  },
  {
    name: "opencode_sessions",
    description: "List OpenCode sessions.",
    inputSchema: {
      type: "object",
      properties: {
        timeoutMs: { type: "number", default: 30000 },
      },
    },
  },
  {
    name: "opencode_set_default_model",
    description: "Update the default model in opencode.json.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string" },
      },
      required: ["model"],
    },
  },
  {
    name: "opencode_get_config_summary",
    description: "Read a redacted OpenCode config summary.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "opencode_start_server",
    description: "Start `opencode serve` for a workspace and return the URL.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { type: "string", default: process.cwd() },
        hostname: { type: "string", default: "127.0.0.1" },
        port: { type: "number", default: 4096 },
        id: { type: "string", description: "Local handle for the spawned server." },
      },
    },
  },
  {
    name: "opencode_stop_server",
    description: "Stop a server started by opencode_start_server.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", default: "default" },
      },
    },
  },
];

export const tools = process.env.OPENCODE_BRIDGE_DEBUG_TOOLS === "1"
  ? [...coreTools, ...debugTools]
  : coreTools;
