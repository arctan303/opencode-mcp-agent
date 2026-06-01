#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(__dirname, "server.mjs");

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const message = arg("message");
if (!message) {
  console.error("Missing --message=...");
  process.exit(2);
}

const cwd = arg("cwd", process.cwd());
const model = arg("model", "deepseek/deepseek-v4-pro");
const title = arg("title", "Codex bridge");
const session = arg("session");

const child = spawn(process.execPath, [server], {
  cwd: __dirname,
  windowsHide: true,
  stdio: ["pipe", "pipe", "inherit"],
});

const requests = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "opencode_desktop_send",
      arguments: {
        message,
        cwd,
        model,
        title,
        ...(session ? { session } : {}),
      },
    },
  },
];

child.stdin.end(requests.map((request) => JSON.stringify(request)).join("\n") + "\n", "utf8");

let stdout = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});

child.on("close", (code) => {
  process.stdout.write(stdout);
  process.exit(code ?? 0);
});
