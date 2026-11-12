import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const rootDir = process.cwd();
const workerDir = path.join(rootDir, "cloudflare", "workers", "dailymotion-discovery-api");
const workerProdVarsPath = path.join(workerDir, ".prod.vars");
const rootProdVarsPath = path.join(rootDir, ".prod.vars");
const prodVarsPath = fs.existsSync(workerProdVarsPath) ? workerProdVarsPath : rootProdVarsPath;
const envPath = path.join(rootDir, ".env");

console.log("Checking .prod.vars existence...");
if (!fs.existsSync(prodVarsPath)) {
  console.error("FAIL: .prod.vars not found in worker directory or workspace root.");
  process.exit(1);
}
console.log(`PASS: Found .prod.vars at ${path.relative(rootDir, prodVarsPath)}`);

const prodVarsContent = fs.readFileSync(prodVarsPath, "utf8");
const prodVars = dotenv.parse(prodVarsContent);

const varNames = Object.keys(prodVars);
console.log(`PASS: .prod.vars is valid dotenv. Found ${varNames.length} variable(s):`);
for (const name of varNames) {
  const val = prodVars[name] ?? "";
  console.log(`  - ${name}: present (${val.length} chars)`);
}

let rootEnv = {};
if (fs.existsSync(envPath)) {
  rootEnv = dotenv.parse(fs.readFileSync(envPath, "utf8"));
}

const workerAuthSecret = prodVars["WORKER_AUTH_SECRET"];
const nextHmacSecret = rootEnv["CLOUDFLARE_R2_WORKER_HMAC_SECRET"];

if (!workerAuthSecret) {
  console.warn("WARN: WORKER_AUTH_SECRET is not set in .prod.vars");
} else {
  console.log("PASS: WORKER_AUTH_SECRET is present in .prod.vars");
}

if (!nextHmacSecret) {
  console.warn("WARN: CLOUDFLARE_R2_WORKER_HMAC_SECRET is not set in .env");
} else {
  console.log("PASS: CLOUDFLARE_R2_WORKER_HMAC_SECRET is present in .env");
}

if (workerAuthSecret && nextHmacSecret) {
  if (workerAuthSecret === nextHmacSecret) {
    console.log("PASS: WORKER_AUTH_SECRET matches CLOUDFLARE_R2_WORKER_HMAC_SECRET perfectly (values redacted).");
  } else {
    console.warn("INFO: WORKER_AUTH_SECRET and CLOUDFLARE_R2_WORKER_HMAC_SECRET differ or are set separately.");
  }
}
