import path from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

function pathCandidates(name) {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
      .split(";")
      .filter(Boolean)
    : [""];
  const names = process.platform === "win32"
    ? extensions.map((extension) => name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension.toLowerCase()}`)
    : [name];
  return (process.env.PATH || "")
    .split(path.delimiter)
    .flatMap((dir) => names.map((candidate) => path.join(dir, candidate)));
}

function pathCandidatesWithExtensions(name, extensions) {
  return (process.env.PATH || "")
    .split(path.delimiter)
    .flatMap((dir) => extensions.map((extension) => path.join(dir, `${name}${extension}`)));
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const npmGlobalOpenCode = path.join(
  homedir(),
  "AppData",
  "Roaming",
  "npm",
  "opencode.cmd",
);

const npmGlobalOpenCodeExe = path.join(
  homedir(),
  "AppData",
  "Roaming",
  "npm",
  "node_modules",
  "opencode-ai",
  "bin",
  "opencode.exe",
);

const desktopBundledOpenCode = path.join(
  homedir(),
  "AppData",
  "Local",
  "OpenCode",
  "opencode-cli.exe",
);

export const OPENCODE = process.env.OPENCODE_BIN ||
  (process.platform === "win32"
    ? firstExisting([
      npmGlobalOpenCodeExe,
      ...pathCandidatesWithExtensions("opencode", [".exe", ".EXE"]),
      desktopBundledOpenCode,
      ...pathCandidatesWithExtensions("opencode", [".cmd", ".CMD", ".bat", ".BAT", ".com", ".COM"]),
      npmGlobalOpenCode,
    ]) || "opencode"
    : firstExisting([
      ...pathCandidates("opencode"),
      ...pathCandidates("opencode.exe"),
    ]) || "opencode");

export const OPENCODE_SOURCE =
  process.env.OPENCODE_BIN && OPENCODE === process.env.OPENCODE_BIN
    ? "env"
    : OPENCODE === npmGlobalOpenCode || OPENCODE === npmGlobalOpenCodeExe
      ? "npm-global"
      : OPENCODE === desktopBundledOpenCode
        ? "desktop-bundled"
        : "path";

export const OPENCODE_DESKTOP =
  process.env.OPENCODE_DESKTOP_BIN ||
  path.join(
    homedir(),
    "AppData",
    "Local",
    "OpenCode",
    "OpenCode.exe",
  );

export const CONFIG =
  process.env.OPENCODE_CONFIG ||
  path.join(homedir(), ".config", "opencode", "opencode.json");
