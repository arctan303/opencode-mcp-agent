#!/usr/bin/env node
import { getDesktopSidecar, sidecarJson } from "./src/sidecar.mjs";

async function run() {
  try {
    const sidecar = await getDesktopSidecar(5000);
    const query = "?directory=" + encodeURIComponent("C:\\opencode");
    
    console.log("Fetching sessions...");
    try {
      const sessions = await sidecarJson(sidecar, "GET", `/sessions${query}`, undefined, 5000);
      console.log("Sessions:", JSON.stringify(sessions).substring(0, 500));
      
      if (sessions && sessions.length > 0) {
        const sessionId = sessions[0].id;
        console.log(`\nFetching messages for ${sessionId}...`);
        const messages = await sidecarJson(sidecar, "GET", `/session/${sessionId}/messages${query}`, undefined, 5000);
        console.log("Messages:", JSON.stringify(messages).substring(0, 500));
      }
    } catch (e) {
      console.log("Failed to fetch:", e.message);
    }

  } catch (e) {
    console.error("Sidecar not running:", e.message);
  }
}

run();
