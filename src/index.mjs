import { readFileSync } from "node:fs";
import { tools } from "./tools.mjs";
import { callTool } from "./handlers.mjs";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

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
        serverInfo: {
          name: "opencode-control",
          version: packageMetadata.version,
        },
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

async function processLine(line) {
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
    void processLine(line);
  }
});
