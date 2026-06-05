import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

function defaultStateFile() {
  if (process.env.OPENCODE_BRIDGE_STATE) return process.env.OPENCODE_BRIDGE_STATE;
  const base = process.env.LOCALAPPDATA ||
    (process.platform === "win32"
      ? path.join(homedir(), "AppData", "Local")
      : path.join(homedir(), ".local", "state"));
  return path.join(base, "codex-opencode-bridge", "tasks.json");
}

export const STATE_FILE = defaultStateFile();

function emptyState() {
  return { version: 1, tasks: {} };
}

export function loadState() {
  if (!existsSync(STATE_FILE)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return {
      version: 1,
      tasks: parsed && typeof parsed.tasks === "object" && parsed.tasks ? parsed.tasks : {},
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  renameSync(tmp, STATE_FILE);
}

export function taskMapFromState() {
  return new Map(Object.entries(loadState().tasks));
}

export function persistTasks(tasks) {
  saveState({ version: 1, tasks: Object.fromEntries(tasks) });
}
