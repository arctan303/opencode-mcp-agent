import { tools } from "./tools.mjs";
import { callTool } from "./handlers.mjs";

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

async function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "opencode-control", version: "0.1.0" },
      },
    };
  }
  if (request.method === "notifications/initialized") return null;
  if (request.method === "tools/list") {
    return { jsonrpc: "2.0", id: request.id, result: { tools } };
  }
  if (request.method === "tools/call") {
    const result = await callTool(request.params.name, request.params.arguments || {});
    return { jsonrpc: "2.0", id: request.id, result };
  }
  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: `Method not found: ${request.method}` },
  };
}

let queue = Promise.resolve();

function enqueue(line) {
  queue = queue.then(async () => {
    let request;
    try {
      request = JSON.parse(line);
      const response = await handleRequest(request);
      if (response) send(response);
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: error.message },
      });
    }
  });
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    enqueue(line);
  }
});
