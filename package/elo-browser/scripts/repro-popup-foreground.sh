#!/usr/bin/env bash

set -euo pipefail

# Minimal macOS reproduction for Elo being activated when a page-created
# popup opens. This deliberately keeps the TaskSpace Agent-owned throughout.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SDK_PATH="${PACKAGE_DIR}/dist/out/index.js"
DEFAULT_ELO_CLI="/Applications/Elo.app/Contents/Frameworks/Elo Framework.framework/Versions/Current/Helpers/elo-browser"
ELO_CLI="${ELO_BROWSER_REAL_E2E_CLI:-${DEFAULT_ELO_CLI}}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This reproduction currently targets Elo on macOS." >&2
  exit 1
fi

if [[ ! -x "${ELO_CLI}" ]]; then
  echo "Elo CLI was not found at: ${ELO_CLI}" >&2
  echo "Override it with ELO_BROWSER_REAL_E2E_CLI=/path/to/elo-browser" >&2
  exit 1
fi

echo "Building the workspace SDK..."
(cd "${PACKAGE_DIR}" && npm run build)

if [[ ! -f "${SDK_PATH}" ]]; then
  echo "SDK build output was not created at: ${SDK_PATH}" >&2
  exit 1
fi

echo
echo "The popup will open in 5 seconds."
echo "Keep another application in front and watch whether Elo takes focus."
sleep 5

"${ELO_CLI}" nodejs --sdk-path "${SDK_PATH}" <<'EOF'
const task = await taskSpace(`popup foreground reproduction ${Date.now()}`);

try {
  const page = task.page("p1");
  const html = `
    <!doctype html>
    <meta charset="utf-8">
    <title>Elo popup foreground reproduction</title>
    <button id="open-popup">Open popup</button>
  `;

  await page.goto(
    "data:text/html;base64," + Buffer.from(html).toString("base64"),
  );
  await page.evaluate(() => {
    document.querySelector("#open-popup").addEventListener("click", () => {
      window.open("about:blank", "_blank");
    });
  });

  // A trusted browser click makes the site create a popup target. The popup
  // creation is the event under test; no handoff or permission prompt occurs.
  const receipt = await page.click("#open-popup");
  console.log(
    JSON.stringify({
      reproduced: true,
      spaceId: task.spaceId,
      ownership: task.ownership,
      popups: receipt.popups || [],
    }),
  );

  // Leave the result visible briefly, then remove all reproduction state.
  await new Promise((resolve) => setTimeout(resolve, 8_000));
} finally {
  await task.finish({ keep: [] }).catch((error) => {
    console.error(`Cleanup failed for TaskSpace ${task.spaceId}: ${error.message}`);
  });
}
EOF

echo "Reproduction finished; the temporary TaskSpace was cleaned up."
