#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(__dirname, "server.mjs");

const child = spawn(process.execPath, [server], {
  cwd: __dirname,
  windowsHide: true,
  stdio: ["pipe", "pipe", "inherit"],
});

let taskID = null;

child.stdout.setEncoding("utf8");
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    
    console.log("->", line);
    try {
      const response = JSON.parse(line);
      
      if (response.id === 2 && !taskID) {
        // Start response
        const resultText = response.result.content[0].text;
        const resultData = JSON.parse(resultText);
        taskID = resultData.taskID;
        console.log(`Task started: ${taskID}`);
        
        // Start polling
        pollTask();
      } else if (response.id > 2) {
        // Poll response
        const resultText = response.result.content[0].text;
        const resultData = JSON.parse(resultText);
        console.log(`Task status: ${resultData.status}`);
        if (resultData.status === "completed" || resultData.status === "failed") {
          console.log("Final result:", resultData.responseText || resultData.error);
          process.exit(0);
        }
      }
    } catch (e) {
      // Ignore parse errors from non-json logs
    }
  }
});

let msgId = 3;
function pollTask() {
  setTimeout(() => {
    const req = {
      jsonrpc: "2.0",
      id: msgId++,
      method: "tools/call",
      params: {
        name: "opencode_task_result",
        arguments: { taskID },
      },
    };
    child.stdin.write(JSON.stringify(req) + "\n");
    if (msgId < 150) { // Max 300 seconds
      pollTask();
    } else {
      console.log("Timed out polling");
      process.exit(1);
    }
  }, 2000);
}

const startReq = {
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "opencode_task_start",
    arguments: {
      message: "测试异步任务机制，收到请立刻回复 'ASYNC_OK'",
      cwd: "C:\\opencode"
    },
  },
};

child.stdin.write(JSON.stringify(startReq) + "\n");
