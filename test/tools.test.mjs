import test from "node:test";
import assert from "node:assert/strict";

test("default tool list exposes only sub-agent core tools", async () => {
  const { tools } = await import("../src/tools.mjs");
  const names = tools.map((tool) => tool.name);
  assert.ok(names.includes("opencode_task_start"));
  assert.ok(names.includes("opencode_task_list"));
  assert.ok(names.includes("opencode_task_cancel"));
  assert.ok(names.includes("opencode_permission_list"));
  assert.ok(names.includes("opencode_permission_reply"));
  assert.ok(names.includes("opencode_model_list"));
  assert.equal(names.includes("opencode_run"), false);
  assert.equal(names.includes("opencode_start_server"), false);

  const taskStart = tools.find((tool) => tool.name === "opencode_task_start");
  assert.match(taskStart.inputSchema.properties.timeoutMs.description, /still applies when wait=false/);
  const cancel = tools.find((tool) => tool.name === "opencode_task_cancel");
  assert.match(cancel.description, /confirmation continues in the background/);
});
