#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runStreaming(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", encoding: "utf8" });
}

function getMergeBase() {
  const candidates = [
    ["merge-base", "HEAD", "@{upstream}"],
    ["merge-base", "HEAD", "origin/master"],
    ["rev-parse", "HEAD~1"],
  ];

  for (const args of candidates) {
    try {
      return run("git", args);
    } catch {
      // Try the next fallback.
    }
  }

  return "";
}

function getChangedSourceFiles(baseRef) {
  if (!baseRef) {
    return [];
  }

  let output = "";
  try {
    output = run("git", ["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`]);
  } catch {
    return [];
  }

  return output
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((filepath) => /\.(cjs|mjs|js|jsx|ts|tsx)$/.test(filepath));
}

function getWorkspaceChangedFiles(changedFiles, workspacePrefix) {
  const files = changedFiles
    .filter((filepath) => filepath.startsWith(workspacePrefix))
    .map((filepath) => filepath.slice(workspacePrefix.length))
    .filter(Boolean);

  return [...new Set(files)];
}

console.log("[pre-push] Running typecheck...");
runStreaming("npm", ["run", "typecheck"]);

const mergeBase = getMergeBase();
const changedSourceFiles = getChangedSourceFiles(mergeBase);

if (changedSourceFiles.length === 0) {
  console.log("[pre-push] No changed JS/TS files found; skipping related Jest tests.");
  process.exit(0);
}

const workspaceChecks = [
  {
    name: "@woly-server/node-agent",
    prefix: "apps/node-agent/",
  },
  {
    name: "@woly-server/cnc",
    prefix: "apps/cnc/",
  },
  {
    name: "@kaonis/woly-protocol",
    prefix: "packages/protocol/",
  },
];

for (const workspace of workspaceChecks) {
  const relatedFiles = getWorkspaceChangedFiles(changedSourceFiles, workspace.prefix);
  if (relatedFiles.length === 0) {
    continue;
  }

  console.log(
    `[pre-push] Running related Jest tests for ${workspace.name} (${relatedFiles.length} changed file(s))...`
  );
  runStreaming("npm", [
    "run",
    "test",
    `--workspace=${workspace.name}`,
    "--",
    "--bail",
    "--passWithNoTests",
    "--findRelatedTests",
    ...relatedFiles,
  ]);
}
