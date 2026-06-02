import { spawn } from "node:child_process";
import { CONFIG, OPENCODE } from "./constants.mjs";
import { runCommand, runProcess } from "./process.mjs";
import {
  getManagedRuntime,
  getRuntimeStatus,
  sidecarJson,
  startManagedRuntime,
  stopManagedRuntime,
} from "./sidecar.mjs";
import { readConfig, writeConfig, redacted } from "./config.mjs";

const serverProcesses = new Map();
const tasks = new Map();

function text(content) {
  return { content: [{ type: "text", text: String(content) }] };
}

function splitModel(model = "deepseek/deepseek-v4-pro") {
  const index = model.indexOf("/");
  if (index < 1) throw new Error(`Model must be provider/model: ${model}`);
  return { providerID: model.slice(0, index), modelID: model.slice(index + 1) };
}

function collectTextParts(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
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
    const workspace = input.workspace || input.cwd || process.cwd();
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
    tasks.set(taskID, taskRecord);

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
    ).then((message) => {
      taskRecord.status = "completed";
      taskRecord.responseText = collectTextParts(message?.parts);
      taskRecord.assistantMessageID = message?.info?.id;
      taskRecord.partCount = Array.isArray(message?.parts) ? message.parts.length : undefined;
      taskRecord.updatedAt = new Date().toISOString();
      return taskRecord;
    }).catch((err) => {
      taskRecord.status = "failed";
      taskRecord.error = err.message;
      taskRecord.updatedAt = new Date().toISOString();
      return taskRecord;
    });

    if (input.wait) await runTask;
    return text(JSON.stringify(taskRecord, null, 2));
  }

  if (name === "opencode_task_status") {
    const taskRecord = tasks.get(input.taskID);
    if (!taskRecord) throw new Error(`Task not found: ${input.taskID}`);
    return text(JSON.stringify({
      taskID: taskRecord.taskID,
      status: taskRecord.status,
      sessionID: taskRecord.sessionID,
      workspace: taskRecord.workspace,
      model: taskRecord.model,
      agent: taskRecord.agent,
      assistantMessageID: taskRecord.assistantMessageID,
      error: taskRecord.error
    }, null, 2));
  }

  if (name === "opencode_task_result") {
    const taskRecord = tasks.get(input.taskID);
    if (!taskRecord) throw new Error(`Task not found: ${input.taskID}`);
    return text(JSON.stringify(taskRecord, null, 2));
  }

  if (name === "opencode_runtime_status") {
    return text(JSON.stringify(getRuntimeStatus(), null, 2));
  }

  if (name === "opencode_runtime_start") {
    const runtime = await startManagedRuntime({
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
    return text(JSON.stringify(messages, null, 2));
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
