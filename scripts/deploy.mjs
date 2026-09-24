#!/usr/bin/env node
// Official deploy pipelines for Aural.
//
//   npm run deploy:vercel
//   AURAL_DEPLOY_HOST=user@vps npm run deploy:docker
//
// Docker options:
//   AURAL_DEPLOY_DIR   repo path on the server (default /opt/aural)
//   AURAL_DEPLOY_URL   post-deploy health check (e.g. https://your-domain)
//
// Gates for both paths: branch main, clean working tree, local HEAD == origin/main.
// Deploying exactly origin/main means the commit already passed CI (lint, tsc, tests, build).
import { execSync, spawnSync } from "node:child_process";

const TARGETS = ["vercel", "docker"];
const target = process.argv[2];

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function die(msg) {
  console.error(`deploy aborted: ${msg}`);
  process.exit(1);
}

if (!TARGETS.includes(target)) {
  console.error(
    `Usage: node scripts/deploy.mjs <${TARGETS.join("|")}>\n` +
      "  or: npm run deploy:vercel / npm run deploy:docker",
  );
  process.exit(1);
}

// ---- gates ----
if (run("git rev-parse --abbrev-ref HEAD") !== "main") {
  die("not on branch main");
}
if (run("git status --porcelain") !== "") {
  die("working tree is not clean - commit or stash first");
}
run("git fetch origin");
const head = run("git rev-parse HEAD");
const remote = run("git rev-parse origin/main");
if (head !== remote) {
  die(
    `local main (${head.slice(0, 7)}) != origin/main (${remote.slice(0, 7)}) - run git pull --rebase origin main and push first`,
  );
}
console.log(`gates passed - deploying origin/main @ ${head.slice(0, 7)}`);

// ---- paths ----
if (target === "vercel") {
  // Production env vars live in the linked Vercel project (.vercel/project.json).
  const r = spawnSync("npx", ["vercel", "--prod"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) die("vercel deploy failed");
  console.log("deployed to Vercel production");
} else {
  const host = process.env.AURAL_DEPLOY_HOST;
  if (!host) {
    die("set AURAL_DEPLOY_HOST=user@vps (ssh target of the server running the compose stack)");
  }
  const dir = process.env.AURAL_DEPLOY_DIR ?? "/opt/aural";
  // The server pulls from the public origin and rebuilds; its .env is managed there.
  const r = spawnSync(
    "ssh",
    [host, `cd ${dir} && git pull --rebase && docker compose up -d --build`],
    { stdio: "inherit" },
  );
  if (r.status !== 0) die("remote docker deploy failed");
  console.log(`docker stack updated on ${host}`);

  const url = process.env.AURAL_DEPLOY_URL;
  if (url) {
    const res = await fetch(url).catch(() => null);
    if (!res || !res.ok) {
      die(`deployed, but health check failed for ${url} - inspect the stack before treating this as done`);
    }
    console.log(`health check ${url} -> ${res.status}`);
  }
}
