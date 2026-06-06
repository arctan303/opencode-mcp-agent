import { spawn } from "node:child_process";
import { CONFIG, OPENCODE } from "./constants.mjs";
import { runCommand } from "./process.mjs";
import {
  getManagedRuntime,
  getRuntimeStatus,
  sidecarJson,
  stopManagedRuntime,
} from "./sidecar.mjs";
import { readConfig, writeConfig, redacted } from "./config.mjs";
import {
  collectTextParts,
  compactMessages,
  deriveProgress,
} from "./messages.mjs";
import { persistTasks, taskMapFromState } from "./state.mjs";

const serverProcesses = new Map();
const activeRequests = new Map();
const tasks = taskMapFromState();
const ACTIVE_STATUSES = new Set(["running", "waiting_permission", "cancel_requested"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function text(content) {
  return { content: [{ type: "text", text: String(content) }] };
}

function splitModel(model = "deepseek/deepseek-v4-pro") {
  const index = model.indexOf("/");
  if (index < 1) throw new Error(`Model must be provider/model: ${model}`);
  return { providerID: model.slice(0, index), modelID: model.slice(index + 1) };
}

function saveTask(taskRecord) {
  taskRecord.updatedAt = new Date().toISOString();
  tasks.set(taskRecord.taskID, taskRecord);
  persistTasks(tasks);
}

function taskSummary(taskRecord) {
  return {
    taskID: taskRecord.taskID,
    status: taskRecord.status,
    sessionID: taskRecord.sessionID,
    workspace: taskRecord.workspace,
    model: taskRecord.model,
    agent: taskRecord.agent,
    assistantMessageID: taskRecord.assistantMessageID,
    permissionRequests: taskRecord.permissionRequests || [],
    progress: taskRecord.progress,
    error: taskRecord.error,
    errorCode: taskRecord.errorCode,
    timeoutMs: taskRecord.timeoutMs,
    updatedAt: taskRecord.updatedAt,
  };
}

function resolveRequiredWorkspace(input) {
  const workspace = input.workspace || input.cwd;
  if (!workspace) {
    throw new Error("workspace is required. Pass an explicit project directory; the bridge does not infer client workspace automatically.");
  }
  return workspace;
}

async function fetchSessionMessages(taskRecord, options = {}) {
  if (!taskRecord.sessionID) return null;
  const workspace = taskRecord.workspace || process.cwd();
  const params = new URLSearchParams();
  params.set("directory", workspace);
  if (options.limit) params.set("limit", String(options.limit));
  const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs: options.timeoutMs || 30000 });
  return sidecarJson(
    sidecar,
    "GET",
    `/session/${encodeURIComponent(taskRecord.sessionID)}/message?${params.toString()}`,
    undefined,
    options.timeoutMs || 30000,
  );
}

async function fetchRuntimeState(workspace, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const params = new URLSearchParams();
  params.set("directory", workspace);
  const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs });
  const query = params.toString();
  const [sessionStatuses, permissions] = await Promise.all([
    sidecarJson(sidecar, "GET", `/session/status?${query}`, undefined, timeoutMs),
    sidecarJson(sidecar, "GET", `/permission?${query}`, undefined, timeoutMs),
  ]);
  return {
    sessionStatuses: sessionStatuses || {},
    permissions: Array.isArray(permissions) ? permissions : [],
  };
}

async function abortSession(taskRecord, timeoutMs = 30000) {
  if (!taskRecord.sessionID) return null;
  const workspace = taskRecord.workspace || process.cwd();
  const params = new URLSearchParams();
  params.set("directory", workspace);
  const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs });
  return sidecarJson(
    sidecar,
    "POST",
    `/session/${encodeURIComponent(taskRecord.sessionID)}/abort?${params.toString()}`,
    undefined,
    timeoutMs,
  );
}

function permissionsForSession(permissions, sessionID) {
  return permissions.filter((request) => !sessionID || request?.sessionID === sessionID);
}

function enrichBlockedTools(progress, permissions, sessionStatus) {
  const runningTools = progress.runningTools || [];
  const permissionCallIDs = new Set(
    permissions.map((request) => request?.tool?.callID).filter(Boolean),
  );
  progress.blockedToolCalls = runningTools
    .filter((tool) => permissionCallIDs.has(tool.callID) || sessionStatus?.type !== "busy")
    .map((tool) => ({
      ...tool,
      reason: permissionCallIDs.has(tool.callID) ? "waiting_permission" : "session_not_busy",
    }));
}

async function syncTaskProgress(taskRecord, options = {}) {
  if (!taskRecord.sessionID) return taskRecord;
  try {
    const workspace = taskRecord.workspace || process.cwd();
    const [messages, runtimeState] = await Promise.all([
      fetchSessionMessages(taskRecord, {
        limit: options.limit || 20,
        timeoutMs: options.timeoutMs || 30000,
      }),
      fetchRuntimeState(workspace, options),
    ]);
    const progress = deriveProgress(messages);
    const permissions = permissionsForSession(
      runtimeState.permissions,
      taskRecord.sessionID,
    );
    const sessionStatus = runtimeState.sessionStatuses[taskRecord.sessionID] || { type: "idle" };
    progress.sessionStatus = sessionStatus;
    enrichBlockedTools(progress, permissions, sessionStatus);
    taskRecord.progress = progress;
    taskRecord.permissionRequests = permissions;
    if (ACTIVE_STATUSES.has(taskRecord.status) && permissions.length) {
      taskRecord.status = "waiting_permission";
    } else if (
      ACTIVE_STATUSES.has(taskRecord.status) &&
      (sessionStatus.type === "busy" || sessionStatus.type === "retry")
    ) {
      taskRecord.status = "running";
    } else if (
      ACTIVE_STATUSES.has(taskRecord.status) &&
      progress.lastAssistantCompleted &&
      progress.lastAssistantFinish &&
      progress.lastAssistantFinish !== "tool-calls"
    ) {
      taskRecord.status = "completed";
      taskRecord.assistantMessageID = progress.lastAssistantMessageID || taskRecord.assistantMessageID;
      taskRecord.responseText = progress.lastAssistantText || taskRecord.responseText;
    }
    taskRecord.progressSyncedAt = new Date().toISOString();
    saveTask(taskRecord);
  } catch (error) {
    taskRecord.progressSyncError = error.message;
    taskRecord.progressSyncedAt = new Date().toISOString();
    saveTask(taskRecord);
  }
  return taskRecord;
}

export async function callTool(name, input = {}) {
  if (name === "opencode_run") {
    const args = ["run", "--format", input.format || "default"];
    if (input.model) args.push("--model", input.model);
    if (input.session) args.push("--session", input.session);
    if (input.continueLast) args.push("--continue");
    if (input.agent) args.push("--agent", input.agent);
    if (input.cwd) args.push("--dir", input.cwd);
    args.push(input.message);
    const result = await runCommand(args, { cwd: input.cwd, timeoutMs: input.timeoutMs });
    return text(JSON.stringify(result, null, 2));
  }

  if (name === "opencode_task_start") {
    const timeoutMs = input.timeoutMs || 600000;
    const prompt = input.prompt || input.message;
    const workspace = resolveRequiredWorkspace(input);
    if (!prompt) throw new Error("opencode_task_start requires prompt.");
    const query = `directory=${encodeURIComponent(workspace)}`;
    const sidecar = await getManagedRuntime({
      cwd: workspace,
      timeoutMs: Math.min(timeoutMs, 60000),
    });
    const model = splitModel(input.model || "deepseek/deepseek-v4-pro");
    let sessionID = input.sessionID || input.session;
    let created = false;

    if (!sessionID) {
      const createdSession = await sidecarJson(
        sidecar,
        "POST",
        `/session?${query}`,
        {
          title: input.title || "Codex bridge headless task",
          agent: input.agent || "build",
          model: { providerID: model.providerID, id: model.modelID },
        },
        30000,
      );
      sessionID = createdSession.id;
      created = true;
    }

    const taskID = `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const taskRecord = {
      taskID,
      status: "running",
      sessionID,
      workspace,
      model: `${model.providerID}/${model.modelID}`,
      agent: input.agent || "build",
      responseText: null,
      error: null,
      errorCode: null,
      timeoutMs,
      created,
      runtime: {
        pid: sidecar.pid,
        port: sidecar.port,
        opencodePath: sidecar.opencodePath,
        opencodeSource: sidecar.opencodeSource,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveTask(taskRecord);

    const controller = new AbortController();
    activeRequests.set(taskID, controller);
    const runTask = sidecarJson(
      sidecar,
      "POST",
      `/session/${encodeURIComponent(sessionID)}/message?${query}`,
      {
        model,
        agent: input.agent || "build",
        noReply: Boolean(input.noReply),
        parts: [{ type: "text", text: prompt }],
      },
      timeoutMs,
      { signal: controller.signal },
    ).then((message) => {
      if (taskRecord.status === "cancelled") return taskRecord;
      taskRecord.status = "completed";
      taskRecord.responseText = collectTextParts(message?.parts);
      taskRecord.assistantMessageID = message?.info?.id;
      taskRecord.partCount = Array.isArray(message?.parts) ? message.parts.length : undefined;
      taskRecord.permissionRequests = [];
      saveTask(taskRecord);
      return taskRecord;
    }).catch(async (err) => {
      if (taskRecord.status === "cancelled" || controller.signal.aborted) {
        taskRecord.status = "cancelled";
        taskRecord.error = null;
        taskRecord.cancelledAt = new Date().toISOString();
        saveTask(taskRecord);
        return taskRecord;
      }
      taskRecord.status = "failed";
      taskRecord.error = err.message;
      taskRecord.errorCode = err.code || "OPENCODE_TASK_FAILED";
      if (err.code === "OPENCODE_REQUEST_TIMEOUT") {
        taskRecord.error = `OpenCode task exceeded timeoutMs=${timeoutMs}. The MCP transport may have a shorter independent timeout; use wait=false and poll opencode_task_status for long tasks.`;
        try {
          taskRecord.sessionAbort = await abortSession(taskRecord, 30000);
        } catch (abortError) {
          taskRecord.sessionAbort = { ok: false, error: abortError.message };
        }
      }
      saveTask(taskRecord);
      return taskRecord;
    }).finally(() => {
      activeRequests.delete(taskID);
    });

    if (input.wait) await runTask;
    return text(JSON.stringify(taskRecord, null, 2));
  }

  if (name === "opencode_task_list") {
    const limit = input.limit || 20;
    const workspace = input.workspace || input.cwd;
    const status = input.status;
    const records = Array.from(tasks.values())
      .filter((taskRecord) => !workspace || taskRecord.workspace === workspace)
      .filter((taskRecord) => !status || taskRecord.status === status)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, limit)
      .map(taskSummary);
    return text(JSON.stringify({ tasks: records }, null, 2));
  }

  if (name === "opencode_task_status") {
    const taskRecord = tasks.get(input.taskID);
    if (!taskRecord) throw new Error(`Task not found: ${input.taskID}`);
    const shouldRefresh = input.refresh === true ||
      (input.refresh !== false && ACTIVE_STATUSES.has(taskRecord.status));
    if (shouldRefresh) {
      await syncTaskProgress(taskRecord, { timeoutMs: input.timeoutMs || 30000 });
    }
    return text(JSON.stringify(taskSummary(taskRecord), null, 2));
  }

  if (name === "opencode_task_result") {
    const taskRecord = tasks.get(input.taskID);
    if (!taskRecord) throw new Error(`Task not found: ${input.taskID}`);
    if (input.refresh || ACTIVE_STATUSES.has(taskRecord.status)) {
      await syncTaskProgress(taskRecord, { timeoutMs: input.timeoutMs || 30000 });
    }
    return text(JSON.stringify(taskRecord, null, 2));
  }

  if (name === "opencode_task_cancel") {
    const taskRecord = tasks.get(input.taskID);
    if (!taskRecord) throw new Error(`Task not found: ${input.taskID}`);
    const active = activeRequests.get(input.taskID);
    let sessionAbort = null;
    if (taskRecord.sessionID) {
      try {
        sessionAbort = await abortSession(taskRecord, input.timeoutMs || 30000);
      } catch (error) {
        sessionAbort = { ok: false, error: error.message };
      }
    }
    if (active) {
      taskRecord.status = "cancelled";
      taskRecord.cancelledAt = new Date().toISOString();
      taskRecord.sessionAbort = sessionAbort;
      active.abort();
      saveTask(taskRecord);
      return text(JSON.stringify({ cancelled: true, task: taskSummary(taskRecord) }, null, 2));
    }
    if (TERMINAL_STATUSES.has(taskRecord.status)) {
      return text(JSON.stringify({ cancelled: false, reason: "task_not_running", sessionAbort, task: taskSummary(taskRecord) }, null, 2));
    }
    taskRecord.status = sessionAbort === true ? "cancelled" : "cancel_requested";
    taskRecord.cancelRequestedAt = new Date().toISOString();
    taskRecord.sessionAbort = sessionAbort;
    taskRecord.cancelNote = sessionAbort === true
      ? "OpenCode session abort endpoint returned true."
      : "The task is not active in this bridge process; OpenCode may still be running in its session.";
    saveTask(taskRecord);
    return text(JSON.stringify({ cancelled: sessionAbort === true, reason: "active_request_not_found", sessionAbort, task: taskSummary(taskRecord) }, null, 2));
  }

  if (name === "opencode_runtime_status") {
    return text(JSON.stringify(getRuntimeStatus(), null, 2));
  }

  if (name === "opencode_runtime_start") {
    const runtime = await getManagedRuntime({
      cwd: input.workspace || process.cwd(),
      timeoutMs: input.timeoutMs || 60000,
    });
    return text(JSON.stringify({
      running: true,
      pid: runtime.pid,
      port: runtime.port,
      baseUrl: runtime.baseUrl,
      opencodePath: runtime.opencodePath,
      opencodeSource: runtime.opencodeSource,
      startedAt: runtime.startedAt,
    }, null, 2));
  }

  if (name === "opencode_runtime_stop") {
    return text(JSON.stringify(stopManagedRuntime(), null, 2));
  }

  if (name === "opencode_session_list") {
    const workspace = input.workspace || process.cwd();
    const params = new URLSearchParams();
    if (input.limit) params.set("limit", String(input.limit));
    if (input.search) params.set("search", input.search);
    const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs: input.timeoutMs || 30000 });
    const query = params.toString();
    const endpoint = query ? `/session?${query}` : "/session";
    const sessions = await sidecarJson(sidecar, "GET", endpoint, undefined, input.timeoutMs || 30000);
    return text(JSON.stringify(sessions, null, 2));
  }

  if (name === "opencode_session_messages") {
    const workspace = input.workspace || process.cwd();
    const params = new URLSearchParams();
    params.set("directory", workspace);
    if (input.limit) params.set("limit", String(input.limit));
    const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs: input.timeoutMs || 30000 });
    const messages = await sidecarJson(
      sidecar,
      "GET",
      `/session/${encodeURIComponent(input.sessionID)}/message?${params.toString()}`,
      undefined,
      input.timeoutMs || 30000,
    );
    const output = input.verbose
      ? messages
      : compactMessages(messages, { maxPartText: input.maxPartText || 500 });
    return text(JSON.stringify(output, null, 2));
  }

  if (name === "opencode_model_list") {
    const workspace = input.workspace || process.cwd();
    const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs: input.timeoutMs || 60000 });
    let models = await sidecarJson(sidecar, "GET", "/api/model", undefined, input.timeoutMs || 60000);
    if (input.provider) {
      models = models.filter((model) => model.providerID === input.provider);
    }
    if (!input.verbose) {
      models = models.map((model) => ({
        id: model.id,
        apiID: model.apiID,
        providerID: model.providerID,
        name: model.name,
        family: model.family,
        capabilities: model.capabilities,
      }));
    }
    return text(JSON.stringify(models, null, 2));
  }

  if (name === "opencode_permission_list") {
    const workspace = input.workspace || process.cwd();
    const runtimeState = await fetchRuntimeState(workspace, {
      timeoutMs: input.timeoutMs || 30000,
    });
    const requests = permissionsForSession(runtimeState.permissions, input.sessionID);
    const pending = requests.map((request) => {
      const taskRecord = Array.from(tasks.values()).find(
        (task) => task.sessionID === request.sessionID,
      );
      return {
        ...request,
        taskID: taskRecord?.taskID,
        workspace: taskRecord?.workspace || workspace,
      };
    });
    const blockedToolCalls = [];
    for (const taskRecord of tasks.values()) {
      if (
        taskRecord.workspace === workspace &&
        ACTIVE_STATUSES.has(taskRecord.status) &&
        (!input.sessionID || taskRecord.sessionID === input.sessionID)
      ) {
        await syncTaskProgress(taskRecord, { timeoutMs: input.timeoutMs || 30000 });
        blockedToolCalls.push(...(taskRecord.progress?.blockedToolCalls || []).map((tool) => ({
          ...tool,
          taskID: taskRecord.taskID,
          sessionID: taskRecord.sessionID,
        })));
      }
    }
    return text(JSON.stringify({ pending, blockedToolCalls }, null, 2));
  }

  if (name === "opencode_permission_reply") {
    const workspace = input.workspace || process.cwd();
    const permissionID = input.permissionID || input.requestID;
    if (!permissionID) throw new Error("opencode_permission_reply requires permissionID or requestID.");
    const decision = input.decision || input.response;
    if (!decision) throw new Error("opencode_permission_reply requires decision or response.");
    const response = input.response ||
      (decision === "allow" ? (input.remember ? "always" : "once") : "reject");
    if (!["once", "always", "reject"].includes(response)) {
      throw new Error(`Unsupported permission response: ${response}`);
    }
    const params = new URLSearchParams();
    params.set("directory", workspace);
    const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs: input.timeoutMs || 30000 });
    const result = await sidecarJson(
      sidecar,
      "POST",
      `/permission/${encodeURIComponent(permissionID)}/reply?${params.toString()}`,
      { reply: response, ...(input.message ? { message: input.message } : {}) },
      input.timeoutMs || 30000,
    );
    const taskRecord = input.taskID
      ? tasks.get(input.taskID)
      : Array.from(tasks.values()).find((task) => task.sessionID === input.sessionID);
    if (taskRecord) {
      await syncTaskProgress(taskRecord, { timeoutMs: input.timeoutMs || 30000 });
    }
    return text(JSON.stringify({
      ok: Boolean(result),
      sessionID: input.sessionID || taskRecord?.sessionID,
      permissionID,
      response,
      remember: Boolean(input.remember),
      result,
    }, null, 2));
  }

  if (name === "opencode_models") {
      const args = ["models"];
      if (input.provider) args.push(input.provider);
      if (input.verbose) args.push("--verbose");
      if (input.refresh) args.push("--refresh");
      const result = await runCommand(args, { timeoutMs: input.timeoutMs || 60000 });
      return text(result.stdout || result.stderr || JSON.stringify(result));
    }
  
    if (name === "opencode_sessions") {
      const result = await runCommand(["session", "list"], {
        timeoutMs: input.timeoutMs || 30000,
      });
      return text(result.stdout || result.stderr || JSON.stringify(result));
    }
  
    if (name === "opencode_set_default_model") {
      const config = readConfig();
      config.model = input.model;
      writeConfig(config);
      return text(`Updated ${CONFIG} model to ${input.model}`);
    }
  
    if (name === "opencode_get_config_summary") {
      const config = readConfig();
      const summary = {
        model: config.model,
        agents: Object.keys(config.agent || {}),
        providers: Object.keys(config.provider || {}),
        mcps: Object.fromEntries(
          Object.entries(config.mcp || {}).map(([key, value]) => [
            key,
            { type: value.type, enabled: value.enabled },
          ]),
        ),
        config: redacted(config),
      };
      return text(JSON.stringify(summary, null, 2));
    }
  
    if (name === "opencode_start_server") {
      const id = input.id || "default";
      if (serverProcesses.has(id)) return text(`Server ${id} already started.`);
      const cwd = input.cwd || process.cwd();
      const hostname = input.hostname || "127.0.0.1";
      const port = input.port || 4096;
      const child = spawn(OPENCODE, ["serve", "--hostname", hostname, "--port", String(port)], {
        cwd,
        windowsHide: true,
        env: process.env,
      });
      let logs = "";
      child.stdout.on("data", (chunk) => (logs += chunk.toString()));
      child.stderr.on("data", (chunk) => (logs += chunk.toString()));
      child.on("close", () => serverProcesses.delete(id));
      serverProcesses.set(id, child);
      return text(
        JSON.stringify(
          { id, url: `http://${hostname}:${port}`, cwd, pid: child.pid, initialLogs: logs },
          null,
          2,
        ),
      );
    }
  
    if (name === "opencode_stop_server") {
      const id = input.id || "default";
      const child = serverProcesses.get(id);
      if (!child) return text(`Server ${id} is not running.`);
      child.kill();
      serverProcesses.delete(id);
      return text(`Stopped server ${id}.`);
    }
  
    throw new Error(`Unknown tool: ${name}`);
  }
