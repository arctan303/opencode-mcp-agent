import test from "node:test";
import assert from "node:assert/strict";
import { compactMessages, deriveProgress } from "../src/messages.mjs";

test("compactMessages keeps tool metadata but truncates large outputs", () => {
  const messages = [{
    info: { id: "msg_1", role: "assistant" },
    parts: [{
      id: "part_1",
      type: "tool",
      tool: "read",
      state: {
        status: "completed",
        input: { filePath: "C:/repo/src/App.jsx" },
        output: "x".repeat(1000),
      },
    }],
  }];

  const compact = compactMessages(messages, { maxPartText: 20 });
  assert.equal(compact[0].parts[0].state.input.filePath, "C:/repo/src/App.jsx");
  assert.match(compact[0].parts[0].state.outputPreview, /\[truncated 980 chars\]/);
});

test("deriveProgress summarizes active messages and tool activity", () => {
  const messages = [{
    info: { id: "msg_1", role: "assistant", time: { created: 1000 } },
    parts: [
      {
        id: "part_1",
        type: "tool",
        tool: "read",
        state: { status: "completed", input: { filePath: "C:/repo/package.json" } },
        time: { start: 1200, end: 1300 },
      },
      {
        id: "part_2",
        type: "reasoning",
        text: "Analyzing performance hot spots",
        time: { start: 1400 },
      },
    ],
  }];

  const progress = deriveProgress(messages);
  assert.equal(progress.messageCount, 1);
  assert.equal(progress.hasOpenAssistantMessage, true);
  assert.equal(progress.toolCalls.completed, 1);
  assert.deepEqual(progress.filesRead, ["C:/repo/package.json"]);
  assert.equal(progress.lastTextPreview, "Analyzing performance hot spots");
});
