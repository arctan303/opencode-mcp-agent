import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG } from "./constants.mjs";

export function readConfig() {
  if (!existsSync(CONFIG)) throw new Error(`Config not found: ${CONFIG}`);
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

export function writeConfig(config) {
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function redacted(value) {
  if (Array.isArray(value)) return value.map(redacted);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/key|token|password|secret|authorization/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redacted(child);
    }
  }
  return out;
}
