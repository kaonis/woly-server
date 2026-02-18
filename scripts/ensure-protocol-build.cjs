#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const protocolRoot = path.join(repoRoot, "packages", "protocol");

const protocolDistEntrypoints = [
  path.join(protocolRoot, "dist", "index.js"),
  path.join(protocolRoot, "dist", "index.d.ts"),
];

const protocolSourceRoots = [
  path.join(protocolRoot, "src"),
  path.join(protocolRoot, "package.json"),
  path.join(protocolRoot, "tsconfig.json"),
];

function pathExists(filepath) {
  try {
    fs.accessSync(filepath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getLatestMtimeMs(filepath) {
  const stats = fs.statSync(filepath);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latest = stats.mtimeMs;
  const entries = fs.readdirSync(filepath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(filepath, entry.name);
    latest = Math.max(latest, getLatestMtimeMs(entryPath));
  }

  return latest;
}

function buildProtocolWorkspace() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npmCommand,
    ["run", "build", "--workspace=@kaonis/woly-protocol"],
    {
      cwd: repoRoot,
      stdio: "inherit",
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function shouldBuildProtocol() {
  if (protocolDistEntrypoints.some((filepath) => !pathExists(filepath))) {
    return true;
  }

  const newestSourceMtime = protocolSourceRoots.reduce((latest, filepath) => {
    if (!pathExists(filepath)) {
      return latest;
    }

    return Math.max(latest, getLatestMtimeMs(filepath));
  }, 0);

  const oldestDistMtime = protocolDistEntrypoints.reduce((oldest, filepath) => {
    const mtime = getLatestMtimeMs(filepath);
    return Math.min(oldest, mtime);
  }, Number.POSITIVE_INFINITY);

  return newestSourceMtime > oldestDistMtime;
}

function ensureProtocolBuild() {
  if (!shouldBuildProtocol()) {
    return;
  }

  process.stdout.write(
    "[preflight] Protocol artifacts missing or stale; building @kaonis/woly-protocol...\n"
  );
  buildProtocolWorkspace();
}

module.exports = {
  ensureProtocolBuild,
};

if (require.main === module) {
  ensureProtocolBuild();
}
