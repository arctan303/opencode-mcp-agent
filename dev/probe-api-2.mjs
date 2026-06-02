#!/usr/bin/env node
import { getDesktopSidecar } from "./src/sidecar.mjs";

async function probe() {
  try {
    const sidecar = await getDesktopSidecar(5000);
    const query = "?directory=" + encodeURIComponent("C:\\opencode");
    const sid = "ses_17d68fcd1ffeZGDno62n2WJC7r";

    const endpoints = [
      `/session/${sid}/state`,
      `/api/v1/session/${sid}`,
      `/api/v1/session/${sid}/messages`,
      `/api/v1/session/${sid}/history`,
      `/session/${sid}/history`,
      `/session/${sid}/log`,
      `/log/${sid}`
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(`${sidecar.baseUrl}${ep}${query}`, {
          method: "GET",
          headers: { Authorization: sidecar.auth }
        });
        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          const body = await res.text();
          console.log(`[SUCCESS] GET ${ep} -> JSON length: ${body.length}`);
          if (body.length < 500) console.log("Response:", body);
          else console.log("Response (truncated):", body.substring(0, 500) + "...");
        } else {
           if (res.ok && contentType.includes("text/html")) console.log(`[HTML FALLBACK] GET ${ep}`);
           else console.log(`[FAILED] GET ${ep} -> ${res.status} ${contentType}`);
        }
      } catch (err) {
        console.log(`[ERROR] GET ${ep} -> ${err.message}`);
      }
    }
  } catch (e) {
    console.error("Probe failed:", e.message);
  }
}

probe();
