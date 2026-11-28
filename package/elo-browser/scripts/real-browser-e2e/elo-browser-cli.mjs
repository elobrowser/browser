import { existsSync } from "node:fs";

export const MACOS_ELO_CLI =
  "/Applications/Elo.app/Contents/Frameworks/Elo Framework.framework/Versions/Current/Helpers/elo-browser";

export function resolveEloBrowserCli({
  configured = process.env.ELO_BROWSER_REAL_E2E_CLI,
  platform = process.platform,
  pathExists = existsSync,
} = {}) {
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  if (platform === "darwin" && pathExists(MACOS_ELO_CLI)) {
    return MACOS_ELO_CLI;
  }
  return "elo-browser";
}
