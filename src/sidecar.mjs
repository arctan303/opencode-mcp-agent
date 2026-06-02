import { spawn } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { existsSync } from "node:fs";
import { OPENCODE, OPENCODE_SOURCE } from "./constants.mjs";

let runtime = null;
let runtimePromise = null;

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => {
        if (!port) reject(new Error("Failed to allocate a local port."));
        else resolve(port);
      });
    });
  });
}

function makeAuth() {
  const username = `bridge-${crypto.randomUUID()}`;
  const password = crypto.randomBytes(32).toString("base64url");
  const auth = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  return { username, password, auth };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRuntime(candidate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await sidecarJson(candidate, "GET", "/session", undefined, 5000);
      return;
    } catch (error) {
      lastError = error.message;
      await wait(500);
    }
  }
  throw new Error(`Timed out waiting for OpenCode runtime. ${lastError}`.trim());
}

export async function getManagedRuntime(options = {}) {
  if (runtime?.process && !runtime.process.killed) return runtime;
  if (runtimePromise) return runtimePromise;

  runtimePromise = startManagedRuntime(options).finally(() => {
    runtimePromise = null;
  });
  return runtimePromise;
}

export async function startManagedRuntime(options = {}) {
  if (!existsSync(OPENCODE)) {
    throw new Error(`OpenCode binary not found: ${OPENCODE}`);
  }

  const port = options.port || await getFreePort();
  const { username, password, auth } = makeAuth();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    OPENCODE_SERVER_USERNAME: username,
    OPENCODE_SERVER_PASSWORD: password,
  };
  const child = spawn(
    OPENCODE,
    ["serve", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: options.cwd || process.cwd(),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const candidate = {
    baseUrl,
    auth,
    port,
    pid: child.pid,
    opencodePath: OPENCODE,
    opencodeSource: OPENCODE_SOURCE,
    process: child,
    startedAt: new Date().toISOString(),
    stderr: "",
    stdout: "",
  };

  child.stdout.on("data", (chunk) => {
    candidate.stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    candidate.stderr += chunk.toString();
  });
  child.on("close", (code) => {
    candidate.exitCode = code;
    if (runtime === candidate) runtime = null;
  });

  try {
    await waitForRuntime(candidate, options.timeoutMs || 30000);
    runtime = candidate;
    return runtime;
  } catch (error) {
    child.kill();
    throw new Error(
      [
        error.message,
        candidate.stderr ? `stderr: ${candidate.stderr.trim()}` : "",
        candidate.stdout ? `stdout: ${candidate.stdout.trim()}` : "",
      ].filter(Boolean).join("\n"),
    );
  }
}

export function getRuntimeStatus() {
  if (!runtime) return { running: false };
  return {
    running: Boolean(runtime.process && !runtime.process.killed && runtime.exitCode === undefined),
    pid: runtime.pid,
    port: runtime.port,
    baseUrl: runtime.baseUrl,
    opencodePath: runtime.opencodePath,
    opencodeSource: runtime.opencodeSource,
    startedAt: runtime.startedAt,
    exitCode: runtime.exitCode,
  };
}

export function stopManagedRuntime() {
  if (!runtime) return { stopped: false, reason: "runtime_not_started" };
  const current = runtime;
  runtime = null;
  current.process.kill();
  return { stopped: true, pid: current.pid, port: current.port };
}

export async function sidecarJson(sidecar, method, endpoint, body, timeoutMs) {
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
      throw new Error(`OpenCode runtime ${method} ${endpoint} failed: ${response.status} ${JSON.stringify(parsed)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
