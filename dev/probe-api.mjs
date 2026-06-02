#!/usr/bin/env node
import { getDesktopSidecar } from "./src/sidecar.mjs";

async function probe() {
  try {
    const sidecar = await getDesktopSidecar(5000);
    const query = "?directory=" + encodeURIComponent("C:\\opencode");
    
    // Use the session ID we successfully created earlier today
    const sid = "ses_17d68fcd1ffeZGDno62n2WJC7r";

    const endpoints = [
      // Session lists
      "/session",
      "/sessions",
      "/api/session",
      "/api/sessions",
      "/api/v1/session",
      "/api/v1/sessions",
      "/history",
      "/api/history",
      "/session/list",
      "/sessions/list",
      "/tui/sessions",
      "/tui/session",
      "/tui/history",
      
      // Message lists
      `/session/${sid}`,
      `/session/${sid}/messages`,
      `/session/${sid}/history`,
      `/session/${sid}/log`,
      `/api/session/${sid}`,
      `/api/session/${sid}/messages`,
      `/api/session/${sid}/history`,
      `/tui/session/${sid}`,
      `/tui/session/${sid}/messages`
    ];

    console.log("Probing Sidecar Base URL:", sidecar.baseUrl);

    for (const ep of endpoints) {
      try {
        const res = await fetch(`${sidecar.baseUrl}${ep}${query}`, {
          method: "GET",
          headers: { Authorization: sidecar.auth }
        });
        
        const contentType = res.headers.get("content-type") || "";
        
        // We only care about successful JSON responses (or something that isn't the HTML fallback)
        if (res.ok && contentType.includes("application/json")) {
          const body = await res.text();
          console.log(`[SUCCESS] GET ${ep} -> JSON length: ${body.length}`);
          if (body.length < 500) {
             console.log("Response:", body);
          } else {
             console.log("Response (truncated):", body.substring(0, 500) + "...");
          }
        } else {
           // It's either an error or returned HTML fallback
           if (res.ok && contentType.includes("text/html")) {
              console.log(`[HTML FALLBACK] GET ${ep}`);
           } else {
              console.log(`[FAILED] GET ${ep} -> ${res.status} ${contentType}`);
           }
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
