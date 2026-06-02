import { tools } from "./tools.mjs";
import { callTool } from "./handlers.mjs";

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let request;
    try {
      request = JSON.parse(line);
      if (request.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "opencode-control", version: "0.1.0" },
          },
        });
      } else if (request.method === "notifications/initialized") {
        continue;
      } else if (request.method === "tools/list") {
        send({ jsonrpc: "2.0", id: request.id, result: { tools } });
      } else if (request.method === "tools/call") {
        const result = await callTool(request.params.name, request.params.arguments || {});
        send({ jsonrpc: "2.0", id: request.id, result });
      } else {
        send({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32000, message: error.message },
      });
    }
  }
});
