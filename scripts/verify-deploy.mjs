#!/usr/bin/env node
// Verify that Aural's Git-Integration production deployment reached READY.
//
//   node scripts/verify-deploy.mjs               # look back 15 minutes
//   node scripts/verify-deploy.mjs --since 3600  # look back 1 hour
//
// Exit 0: Ready (prints the deployment URL)
// Exit 1: the deployment ended in ERROR/CANCELED
// Exit 2: no Ready production deployment within the 6-minute watch budget
//
// Selects deployments by creation time + production target + state — NEVER by
// name or URL substring. Git-Integration deployments carry no stable name
// token: a `grep git-main` watcher false-failed twice (2026-11-05) on Ready
// deployments named aural-deploy-<hash>-rlaksanas-projects.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const project = JSON.parse(
  readFileSync(new URL("../.vercel/project.json", import.meta.url), "utf8"),
).projectName;

const sinceArg = process.argv.indexOf("--since");
const sinceSeconds = sinceArg >= 0 ? Number(process.argv[sinceArg + 1]) || 900 : 900;
const sinceMs = Date.now() - sinceSeconds * 1000;

function listProductionDeployments() {
  const r = spawnSync("npx", ["--yes", "vercel", "ls", project, "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0 || !r.stdout) return [];
  try {
    return JSON.parse(r.stdout).deployments ?? [];
  } catch {
    return [];
  }
}

const deadline = Date.now() + 6 * 60_000;
for (;;) {
  const d = listProductionDeployments()
    .filter((x) => x.target === "production" && x.createdAt >= sinceMs)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (d) {
    if (d.state === "READY") {
      console.log(
        `deploy READY: https://${d.url} (created ${new Date(d.createdAt).toISOString()})`,
      );
      process.exit(0);
    }
    if (d.state === "ERROR" || d.state === "CANCELED") {
      console.error(`deploy FAILED (${d.state}): https://${d.url}`);
      process.exit(1);
    }
    console.log(`building (${d.state}) - polling every 15s`);
  }
  if (Date.now() >= deadline) break;
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
console.error(
  `no READY production deployment since ${new Date(sinceMs).toISOString()} within the 6-minute budget`,
);
process.exit(2);
