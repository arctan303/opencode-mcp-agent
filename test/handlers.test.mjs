import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

test("opencode_task_start requires explicit workspace", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-bridge-handlers-"));
  process.env.OPENCODE_BRIDGE_STATE = path.join(dir, "tasks.json");
  const { callTool } = await import(`../src/handlers.mjs?handlers-test=${Date.now()}`);

  await assert.rejects(
    () => callTool("opencode_task_start", { prompt: "hello" }),
    /workspace is required/,
  );

  rmSync(dir, { recursive: true, force: true });
});
