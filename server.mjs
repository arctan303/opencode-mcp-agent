#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import path from "node:path";

const OPENCODE =
  process.env.OPENCODE_BIN ||
  path.join(
    homedir(),
    "AppData",
    "Local",
    "OpenCode",
    "opencode-cli.exe",
  );

const CONFIG =
  process.env.OPENCODE_CONFIG ||
  path.join(homedir(), ".config", "opencode", "opencode.json");

const serverProcesses = new Map();
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

const tools = [
  {
    name: "opencode_run",
    description:
      "Send one message to OpenCode. Supports changing model and workspace per call.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        cwd: { type: "string", description: "Workspace directory for OpenCode." },
        model: {
          type: "string",
          description: "Model ID, for example openai/gpt-5.4 or opencode/mimo-v2.5-free.",
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
    name: "opencode_desktop_send",
    description:
      "Send a visible message through the running OpenCode desktop sidecar, optionally creating/selecting a desktop session.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        cwd: { type: "string", description: "Workspace directory shown to OpenCode desktop." },
        model: {
          type: "string",
          default: "deepseek/deepseek-v4-pro",
          description: "provider/model, for example deepseek/deepseek-v4-pro.",
        },
        agent: { type: "string", default: "build" },
        session: { type: "string", description: "Existing desktop session ID to use." },
        title: { type: "string", default: "Codex bridge" },
        select: {
          type: "boolean",
          default: true,
          description: "Ask the desktop sidecar to select the target session.",
        },
        noReply: {
          type: "boolean",
          default: false,
          description: "Only record the user message without asking the model to answer.",
        },
        timeoutMs: { type: "number", default: 180000 },
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

function text(content) {
  return { content: [{ type: "text", text: String(content) }] };
}

function runCommand(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs || 120000;

  return new Promise((resolve) => {
    if (!existsSync(OPENCODE)) {
      resolve({
        code: 127,
        stdout: "",
        stderr: `OpenCode binary not found: ${OPENCODE}`,
      });
      return;
    }

    const child = spawn(OPENCODE, args, {
      cwd,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      stderr += `\nTimed out after ${timeoutMs}ms`;
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      stderr += `\nTimed out after ${timeoutMs}ms`;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

async function getDesktopSidecar(timeoutMs = 30000) {
  const ps = await runProcess(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"name = 'opencode-cli.exe'\" | Select-Object -First 1 ProcessId,CommandLine | ConvertTo-Json -Compress",
    ],
    { timeoutMs },
  );
  if (ps.code !== 0 || !ps.stdout.trim()) {
    throw new Error(`OpenCode desktop sidecar is not running. ${ps.stderr}`.trim());
  }
  const proc = JSON.parse(ps.stdout);
  const port = /--port\s+(\d+)/.exec(proc.CommandLine || "")?.[1];
  if (!port) throw new Error(`Could not find sidecar port in command line: ${proc.CommandLine}`);

  const envScript = path.join(THIS_DIR, "read-process-env.ps1");
  const envResult = await runProcess(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", envScript, "-PidToRead", String(proc.ProcessId)],
    { timeoutMs },
  );
  if (envResult.code !== 0) throw new Error(envResult.stderr || "Failed to read sidecar environment.");
  const env = Object.fromEntries(
    envResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        return index < 0 ? [line, ""] : [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  const username = env.OPENCODE_SERVER_USERNAME;
  const password = env.OPENCODE_SERVER_PASSWORD;
  if (!username || !password) throw new Error("Sidecar auth variables were not found.");
  return {
    pid: proc.ProcessId,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    auth: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
  };
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

async function sidecarJson(sidecar, method, endpoint, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 180000);
  try {
    const response = await fetch(`${sidecar.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: sidecar.auth,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const textBody = await response.text();
    let parsed = textBody;
    try {
      parsed = textBody ? JSON.parse(textBody) : null;
    } catch {}
    if (!response.ok) {
      throw new Error(`OpenCode sidecar ${method} ${endpoint} failed: ${response.status} ${JSON.stringify(parsed)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

function readConfig() {
  if (!existsSync(CONFIG)) throw new Error(`Config not found: ${CONFIG}`);
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

function redacted(value) {
  if (Array.isArray(value)) return value.map(redacted);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/key|token|password|secret|authorization/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redacted(child);
    }
  }
  return out;
}

async function callTool(name, input = {}) {
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

  if (name === "opencode_desktop_send") {
    const timeoutMs = input.timeoutMs || 180000;
    const cwd = input.cwd || process.cwd();
    const query = `directory=${encodeURIComponent(cwd)}`;
    const sidecar = await getDesktopSidecar(Math.min(timeoutMs, 30000));
    const model = splitModel(input.model || "deepseek/deepseek-v4-pro");
    let sessionID = input.session;
    let created = false;

    if (!sessionID) {
      const createdSession = await sidecarJson(
        sidecar,
        "POST",
        `/session?${query}`,
        {
          title: input.title || "Codex bridge",
          agent: input.agent || "build",
          model: { providerID: model.providerID, id: model.modelID },
        },
        timeoutMs,
      );
      sessionID = createdSession.id;
      created = true;
    }

    const message = await sidecarJson(
      sidecar,
      "POST",
      `/session/${encodeURIComponent(sessionID)}/message?${query}`,
      {
        model,
        agent: input.agent || "build",
        noReply: Boolean(input.noReply),
        parts: [{ type: "text", text: input.message }],
      },
      timeoutMs,
    );

    let selected = false;
    if (input.select !== false) {
      selected = await sidecarJson(
        sidecar,
        "POST",
        `/tui/select-session?${query}`,
        { sessionID },
        timeoutMs,
      );
    }

    return text(
      JSON.stringify(
        {
          ok: true,
          desktopSidecar: { pid: sidecar.pid, port: sidecar.port },
          cwd,
          model: `${model.providerID}/${model.modelID}`,
          agent: input.agent || "build",
          sessionID,
          created,
          selected,
          assistantMessageID: message?.info?.id,
          partCount: Array.isArray(message?.parts) ? message.parts.length : undefined,
          responseText: collectTextParts(message?.parts),
        },
        null,
        2,
      ),
    );
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
    writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n", "utf8");
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

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let request;
    try {
      request = JSON.parse(line);
      if (request.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "opencode-control", version: "0.1.0" },
          },
        });
      } else if (request.method === "notifications/initialized") {
        continue;
      } else if (request.method === "tools/list") {
        send({ jsonrpc: "2.0", id: request.id, result: { tools } });
      } else if (request.method === "tools/call") {
        const result = await callTool(request.params.name, request.params.arguments || {});
        send({ jsonrpc: "2.0", id: request.id, result });
      } else {
        send({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: error.message },
      });
    }
  }
});
