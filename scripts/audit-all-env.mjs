#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  "build",
  ".agents",
  ".claude",
  ".cursor",
  ".devin",
  ".aider-desk",
  ".augment",
  ".autohand",
  ".bob",
  ".codeartsdoer",
  ".codebuddy",
  ".codemaker",
  ".codestudio",
  ".commandcode",
  ".continue",
  ".cortex",
  ".crush",
  ".mux",
  ".qwen",
  ".zcode",
  ".zencoder",
]);

const IGNORED_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".zip",
  ".tar",
  ".gz",
  ".lock",
]);

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walk(fullPath, fileList);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!IGNORED_EXTS.has(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

const allFiles = walk(rootDir);

const envMap = new Map(); // varName -> Set of relative file paths

const PROCESS_ENV_REGEX = /process\.env\.([A-Z0-9_]+)|process\.env\[["']([A-Z0-9_]+)["']\]/g;
const WORKER_ENV_REGEX = /env\.([A-Z0-9_]+)/g;
const IMPORT_META_REGEX = /import\.meta\.env\.([A-Z0-9_]+)/g;

for (const filePath of allFiles) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");
  // Don't scan this script itself or .env files for occurrences
  if (relPath.startsWith("scripts/audit-all-env.mjs") || relPath.endsWith(".env") || relPath.endsWith(".vars")) {
    continue;
  }
  const content = fs.readFileSync(filePath, "utf-8");

  let match;
  while ((match = PROCESS_ENV_REGEX.exec(content)) !== null) {
    const varName = match[1] || match[2];
    if (varName && varName !== "NODE_ENV") {
      if (!envMap.has(varName)) envMap.set(varName, new Set());
      envMap.get(varName).add(relPath);
    }
  }

  if (relPath.startsWith("cloudflare/")) {
    while ((match = WORKER_ENV_REGEX.exec(content)) !== null) {
      const varName = match[1];
      if (varName && varName !== "NODE_ENV" && !["TEXT", "JSON", "BLOB"].includes(varName)) {
        if (!envMap.has(varName)) envMap.set(varName, new Set());
        envMap.get(varName).add(relPath);
      }
    }
  }

  while ((match = IMPORT_META_REGEX.exec(content)) !== null) {
    const varName = match[1];
    if (varName && varName !== "NODE_ENV") {
      if (!envMap.has(varName)) envMap.set(varName, new Set());
      envMap.get(varName).add(relPath);
    }
  }
}

console.log("=== Active Environment Variables Found in Codebase ===");
const sorted = Array.from(envMap.keys()).sort();
console.log(`Total unique active environment variables: ${sorted.length}\n`);

for (const name of sorted) {
  const files = Array.from(envMap.get(name));
  console.log(`- ${name} (used in ${files.length} files: ${files.slice(0, 3).join(", ")}${files.length > 3 ? "..." : ""})`);
}
