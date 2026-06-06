import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const npmCli = process.env.npm_execpath;
const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
);

function runNpm(args) {
  if (npmCli) {
    execFileSync(process.execPath, [npmCli, ...args], {
      cwd: root,
      stdio: "inherit",
    });
    return;
  }
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: root,
    stdio: "inherit",
  });
}

runNpm(["run", "check"]);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

runNpm(["pack", "--pack-destination", dist]);

const artifacts = readdirSync(dist).filter((name) => name.endsWith(".tgz"));
if (artifacts.length !== 1) {
  throw new Error(`Expected one npm tarball, found ${artifacts.length}.`);
}

const artifact = artifacts[0];
const artifactPath = path.join(dist, artifact);
const bytes = readFileSync(artifactPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const builtAt = new Date().toISOString();

writeFileSync(
  path.join(dist, "SHA256SUMS"),
  `${sha256}  ${artifact}\n`,
  "utf8",
);
writeFileSync(
  path.join(dist, "manifest.json"),
  JSON.stringify({
    name: packageJson.name,
    version: packageJson.version,
    artifact,
    bytes: bytes.length,
    sha256,
    node: process.version,
    builtAt,
  }, null, 2) + "\n",
  "utf8",
);

console.log(`Built ${path.relative(root, artifactPath)}`);
console.log(`SHA-256 ${sha256}`);
