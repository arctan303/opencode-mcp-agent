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

async function syncTaskProgress(taskRecord, options = {}) {
  if (!taskRecord.sessionID) return taskRecord;
  try {
    const messages = await fetchSessionMessages(taskRecord, {
      limit: options.limit || 20,
      timeoutMs: options.timeoutMs || 30000,
    });
    const progress = deriveProgress(messages);
    taskRecord.progress = progress;
    if (
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

function findPermissionRequests(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) findPermissionRequests(item, out);
    return out;
  }
  const type = String(value.type || value.kind || value.name || "").toLowerCase();
  const status = String(value.status || value.state || "").toLowerCase();
  if (
    type.includes("permission") ||
    type.includes("approval") ||
    status.includes("permission") ||
    status.includes("approval")
  ) {
    out.push(value);
  }
  for (const child of Object.values(value)) findPermissionRequests(child, out);
  return out;
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
      const permissionRequests = findPermissionRequests(message);
      taskRecord.status = permissionRequests.length ? "waiting_permission" : "completed";
      taskRecord.responseText = collectTextParts(message?.parts);
      taskRecord.assistantMessageID = message?.info?.id;
      taskRecord.partCount = Array.isArray(message?.parts) ? message.parts.length : undefined;
      taskRecord.permissionRequests = permissionRequests;
      saveTask(taskRecord);
      return taskRecord;
    }).catch((err) => {
      if (taskRecord.status === "cancelled" || controller.signal.aborted) {
        taskRecord.status = "cancelled";
        taskRecord.error = null;
        taskRecord.cancelledAt = new Date().toISOString();
        saveTask(taskRecord);
        return taskRecord;
      }
      taskRecord.status = "failed";
      taskRecord.error = err.message;
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
        const sidecar = await getManagedRuntime({ cwd: taskRecord.workspace || process.cwd(), timeoutMs: input.timeoutMs || 30000 });
        const params = new URLSearchParams();
        if (taskRecord.workspace) params.set("directory", taskRecord.workspace);
        const query = params.toString();
        sessionAbort = await sidecarJson(
          sidecar,
          "POST",
          `/session/${encodeURIComponent(taskRecord.sessionID)}/abort${query ? `?${query}` : ""}`,
          undefined,
          input.timeoutMs || 30000,
        );
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
    const pending = [];
    for (const taskRecord of tasks.values()) {
      if (taskRecord.status === "waiting_permission" || taskRecord.permissionRequests?.length) {
        pending.push({
          taskID: taskRecord.taskID,
          sessionID: taskRecord.sessionID,
          workspace: taskRecord.workspace,
          requests: taskRecord.permissionRequests || [],
        });
      }
    }

    if (input.sessionID) {
      const workspace = input.workspace || process.cwd();
      const params = new URLSearchParams();
      params.set("directory", workspace);
      const sidecar = await getManagedRuntime({ cwd: workspace, timeoutMs: input.timeoutMs || 30000 });
      const messages = await sidecarJson(
        sidecar,
        "GET",
        `/session/${encodeURIComponent(input.sessionID)}/message?${params.toString()}`,
        undefined,
        input.timeoutMs || 30000,
      );
      pending.push({
        sessionID: input.sessionID,
        workspace,
        requests: findPermissionRequests(messages),
        source: "session_messages",
      });
    }

    return text(JSON.stringify({ pending }, null, 2));
  }

  if (name === "opencode_permission_reply") {
    const workspace = input.workspace || process.cwd();
    const sessionID = input.sessionID;
    const permissionID = input.permissionID || input.requestID;
    if (!sessionID) throw new Error("opencode_permission_reply requires sessionID.");
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
      `/session/${encodeURIComponent(sessionID)}/permissions/${encodeURIComponent(permissionID)}?${params.toString()}`,
      { response, remember: Boolean(input.remember) },
      input.timeoutMs || 30000,
    );
    return text(JSON.stringify({
      ok: Boolean(result),
      sessionID,
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
