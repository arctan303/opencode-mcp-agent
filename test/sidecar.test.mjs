import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { sidecarJson } from "../src/sidecar.mjs";

test("sidecarJson classifies request timeouts", async () => {
  const server = http.createServer((_request, _response) => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const sidecar = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    auth: "Basic test",
  };

  try {
    await assert.rejects(
      () => sidecarJson(sidecar, "GET", "/slow", undefined, 25),
      (error) => {
        assert.equal(error.code, "OPENCODE_REQUEST_TIMEOUT");
        assert.match(error.message, /timed out after 25ms/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("sidecarJson classifies caller cancellation", async () => {
  const server = http.createServer((_request, _response) => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const sidecar = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    auth: "Basic test",
  };
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);

  try {
    await assert.rejects(
      () => sidecarJson(sidecar, "GET", "/cancel", undefined, 1000, {
        signal: controller.signal,
      }),
      (error) => {
        assert.equal(error.code, "OPENCODE_REQUEST_CANCELLED");
        assert.match(error.message, /was cancelled/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
