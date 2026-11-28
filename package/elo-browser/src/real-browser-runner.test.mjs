import test from "node:test";
import assert from "node:assert/strict";

import {
  MACOS_ELO_CLI,
  resolveEloBrowserCli,
} from "../scripts/real-browser-e2e/elo-browser-cli.mjs";
import { pageActionabilityCase } from "../scripts/real-browser-e2e/cases/page-actionability.mjs";
import { pageScrolledScreenshotCase } from "../scripts/real-browser-e2e/cases/page-screenshot.mjs";
import {
  extractCaseError,
  parseOnlyCases,
} from "../scripts/real-browser-e2e/runner.mjs";

test("real-browser E2E honors an explicit Elo CLI", () => {
  assert.equal(
    resolveEloBrowserCli({
      configured: "/custom/elo/elo-browser",
      platform: "darwin",
      pathExists: () => true,
    }),
    "/custom/elo/elo-browser",
  );
});

test("real-browser E2E prefers the stable Elo app path on macOS", () => {
  assert.equal(
    resolveEloBrowserCli({
      configured: "",
      platform: "darwin",
      pathExists: (path) => path === MACOS_ELO_CLI,
    }),
    MACOS_ELO_CLI,
  );
});

test("real-browser E2E falls back to PATH when no app-specific CLI exists", () => {
  assert.equal(
    resolveEloBrowserCli({
      platform: "linux",
      pathExists: () => false,
    }),
    "elo-browser",
  );
});

test("real-browser E2E selects an exact case name that contains commas", () => {
  assert.deepEqual(
    [
      ...parseOnlyCases("wait, fetch, cdp, js, help", [
        "wait, fetch, cdp, js, help",
        "Page API alignment",
      ]),
    ],
    ["wait, fetch, cdp, js, help"],
  );
});

test("real-browser E2E accepts a JSON array for multiple exact case names", () => {
  assert.deepEqual(
    [
      ...parseOnlyCases(
        '["wait, fetch, cdp, js, help", "Page API alignment"]',
        ["wait, fetch, cdp, js, help", "Page API alignment"],
      ),
    ],
    ["wait, fetch, cdp, js, help", "Page API alignment"],
  );
});

test("real-browser E2E keeps legacy comma-separated case selection", () => {
  assert.deepEqual(
    [
      ...parseOnlyCases("first case, second case", [
        "first case",
        "second case",
      ]),
    ],
    ["first case", "second case"],
  );
});

test("real-browser E2E rejects unknown selected cases instead of skipping all", () => {
  assert.throws(
    () => parseOnlyCases("Page API aligment", ["Page API alignment"]),
    /unknown real-browser E2E case.*Page API aligment.*Page API alignment/i,
  );
});

test("real-browser E2E rejects an explicitly empty selection", () => {
  assert.throws(
    () => parseOnlyCases("[]", ["Page API alignment"]),
    /must select at least one/i,
  );
});

test("real-browser E2E reports the reason a case logged for failing", () => {
  const stdout = [
    "[elo-browser:notice] an update is available",
    '{"ok":false,"assertions":15,"error":"page.click timed out"}',
    "",
    "elo's nodejs process exited with code 1.",
  ].join("\n");
  assert.equal(extractCaseError(stdout, ""), "page.click timed out");
  assert.equal(extractCaseError('{"ok":true,"assertions":3}'), null);
  assert.equal(extractCaseError(undefined, "plain stack trace"), null);
});

test("the scrolled screenshot fixture is larger than the live viewport", () => {
  const source = pageScrolledScreenshotCase();

  assert.match(source, /viewportWidth \+ 1000/);
  assert.match(source, /viewportHeight \+ 100/);
  assert.match(source, /scrollPosition\.x > 0 && scrollPosition\.y > 0/);
});

test("Page E2E cases close their managed Page from finally", () => {
  for (const source of [
    pageScrolledScreenshotCase(),
    pageActionabilityCase(),
  ]) {
    assert.match(
      source,
      /try\s*\{[\s\S]*\}\s*finally\s*\{\s*await page\.close\(\)/,
    );
  }
});
