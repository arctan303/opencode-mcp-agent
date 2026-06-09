import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

function request(payloads) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "server.mjs")], {
      cwd: root,
      env: { ...process.env, OPENCODE_BRIDGE_STATE: path.join(root, ".test-tasks.json") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`protocol test timed out\n${stderr}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length >= payloads.length) {
        clearTimeout(timer);
        child.kill();
        resolve(lines.map((line) => JSON.parse(line)).sort((a, b) => a.id - b.id));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.stdin.end(payloads.map((payload) => JSON.stringify(payload)).join("\n") + "\n");
  });
}

test("MCP initialize and tools/list work over stdio", async () => {
  const responses = await request([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);

  assert.equal(responses[0].result.serverInfo.name, "opencode-control");
  assert.equal(responses[0].result.serverInfo.version, packageJson.version);
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "opencode_task_start"));
  assert.equal(responses[1].result.tools.some((tool) => tool.name === "opencode_run"), false);
});

