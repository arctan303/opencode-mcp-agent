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

test("deriveProgress captures completed assistant answer", () => {
  const messages = [{
    info: {
      id: "msg_final",
      role: "assistant",
      finish: "stop",
      time: { created: 1000, completed: 2000 },
    },
    parts: [
      { id: "part_text", type: "text", text: "Done with analysis" },
    ],
  }];

  const progress = deriveProgress(messages);
  assert.equal(progress.lastAssistantMessageID, "msg_final");
  assert.equal(progress.lastAssistantFinish, "stop");
  assert.equal(progress.lastAssistantCompleted, true);
  assert.equal(progress.lastAssistantText, "Done with analysis");
});

test("deriveProgress exposes running tool details", () => {
  const messages = [{
    info: { id: "msg_running", role: "assistant", time: { created: 1000 } },
    parts: [{
      id: "part_edit",
      messageID: "msg_running",
      type: "tool",
      tool: "edit",
      callID: "call_edit",
      state: {
        status: "running",
        title: "Update app",
        input: { filePath: "C:/repo/app.js", oldString: "before", newString: "after" },
      },
      time: { start: Date.now() - 2500 },
    }],
  }];

  const progress = deriveProgress(messages);
  assert.equal(progress.toolCalls.running, 1);
  assert.equal(progress.runningTools[0].tool, "edit");
  assert.equal(progress.runningTools[0].callID, "call_edit");
  assert.match(progress.runningTools[0].inputSummary, /C:\/repo\/app\.js/);
  assert.ok(progress.runningTools[0].durationMs >= 2000);
});
