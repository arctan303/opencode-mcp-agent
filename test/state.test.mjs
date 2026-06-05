import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

test("task state persists as a JSON task map", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencode-bridge-state-"));
  process.env.OPENCODE_BRIDGE_STATE = path.join(dir, "tasks.json");
  const state = await import(`../src/state.mjs?state-test=${Date.now()}`);

  const tasks = new Map([
    ["task_1", { taskID: "task_1", status: "completed", sessionID: "ses_1" }],
  ]);
  state.persistTasks(tasks);

  const loaded = state.taskMapFromState();
  assert.equal(loaded.get("task_1").status, "completed");
  assert.equal(loaded.get("task_1").sessionID, "ses_1");

  rmSync(dir, { recursive: true, force: true });
});
