import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile as loadNodeEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SRC_DIR, "..");

export function agentWorkspace() {
  if (process.env.ELO_BROWSER_AGENT_WORKSPACE) {
    return resolvePath(process.env.ELO_BROWSER_AGENT_WORKSPACE);
  }

  const bundledSkill = resolve(SRC_DIR, "agent-skills", "elo-browser");
  if (existsSync(bundledSkill)) {
    return bundledSkill;
  }

  return resolve(REPO_ROOT, "..", "..", "skills", "elo-browser");
}

/**
 * Root of the per-user state elo-browser keeps between rounds: Page ledgers
 * and the shared download directory.
 */
export function runtimeStateDir() {
  return resolvePath(
    process.env.ELO_BROWSER_STATE_DIR ||
      join(homedir(), ".elo-browser", "state"),
  );
}

function resolvePath(path) {
  if (path.startsWith("~")) {
    return resolve(
      process.env.HOME || process.env.USERPROFILE || ".",
      path.slice(1),
    );
  }
  return resolve(path);
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }
  loadNodeEnvFile(path);
}

export function loadEnv() {
  loadEnvFile(resolve(REPO_ROOT, ".env"));
  loadEnvFile(resolve(agentWorkspace(), ".env"));
}
