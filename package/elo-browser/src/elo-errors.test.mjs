import test from "node:test";
import assert from "node:assert/strict";

import {
  eloErrorCode,
  invokeElo,
  isEloErrorCode,
  isEloUserControlError,
  probeAgentControl,
  resolveEloError,
} from "../dist/src/elo-errors.js";

test("probeAgentControl treats both native user-control shapes as waiting", async () => {
  assert.equal(
    await probeAgentControl(async () => ({
      error: "manual_takeover",
      error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
    })),
    false,
  );
  assert.equal(
    await probeAgentControl(async () => {
      throw Object.assign(new Error("manual_takeover"), {
        error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
      });
    }),
    false,
  );
});

test("probeAgentControl propagates non-user-control native errors", async () => {
  await assert.rejects(
    () =>
      probeAgentControl(async () => ({
        error: "renderer failed",
        error_code: "ELO_SNAPSHOT_FAILED",
      })),
    /renderer failed/,
  );
});

test("invokeElo recognizes a permission reason from a resolved native error", async () => {
  await assert.rejects(
    () =>
      invokeElo("task.listTabs", () =>
        Promise.resolve({
          error: "location",
          error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
        }),
      ),
    (error) => {
      assert.equal(error.error_code, "ELO_TASK_SPACE_USER_IN_CONTROL");
      assert.match(
        error.message,
        /^task\.listTabs: A browser permission prompt/,
      );
      assert.match(error.message, /location access/);
      assert.match(error.message, /takeOverTaskSpace\(spaceId\)/);
      return true;
    },
  );
});

test("invokeElo recognizes a permission reason from a rejected native call", async () => {
  const nativeError = Object.assign(new Error("camera"), {
    error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
  });
  await assert.rejects(
    () => invokeElo("snapshot", () => Promise.reject(nativeError)),
    (error) => {
      assert.equal(error.error_code, "ELO_TASK_SPACE_USER_IN_CONTROL");
      assert.match(error.message, /^snapshot: A browser permission prompt/);
      assert.match(error.message, /camera access/);
      return true;
    },
  );
});

for (const [reason, firstLine] of [
  [
    "clipboard",
    "A browser permission prompt for clipboard access has appeared.",
  ],
  [
    "local_network_access",
    "A browser permission prompt for local network access has appeared.",
  ],
  [
    "storage_access",
    "A browser permission prompt for storage access has appeared.",
  ],
  [
    "window_management",
    "A browser permission prompt for window management has appeared.",
  ],
  [
    "local_fonts",
    "A browser permission prompt for local font access has appeared.",
  ],
  [
    "permission_prompt",
    "A browser permission prompt or device chooser has appeared.",
  ],
]) {
  test(`the ${reason} reason names the prompt the user must handle`, () => {
    const { code, message } = resolveEloError({
      error: reason,
      error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
    });
    assert.equal(code, "ELO_TASK_SPACE_USER_IN_CONTROL");
    const lines = message.split("\n");
    assert.equal(lines[0], firstLine);
    assert.match(message, /Wait for the user to handle the prompt/);
    assert.match(message, /takeOverTaskSpace\(spaceId\)/);
  });
}

test("manual_takeover keeps the generic user-control guidance", () => {
  const { message } = resolveEloError({
    error: "manual_takeover",
    error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /permission prompt/);
});

test("user-control reason lookup ignores inherited object properties", () => {
  const { message } = resolveEloError({
    error: "constructor",
    error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /constructor/);
});

test("unknown user-control reasons fall back without exposing the raw key", () => {
  const { message } = resolveEloError({
    error: "future_permission_reason",
    error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /future_permission_reason/);
});

test("the retired site-dialog handoff reason uses generic user-control guidance", () => {
  const { message } = resolveEloError({
    error: "fallback_site_dialog_required_notice",
    error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /dialog that requires review/);
  assert.doesNotMatch(message, /fallback_site_dialog_required_notice/);
});

test("invokeElo preserves non-user-control native failures", async () => {
  await assert.rejects(
    () =>
      invokeElo("snapshot", () =>
        Promise.reject(
          Object.assign(new Error("snapshot renderer failed"), {
            error_code: "ELO_SNAPSHOT_FAILED",
          }),
        ),
      ),
    (error) => {
      assert.equal(error.error_code, "ELO_SNAPSHOT_FAILED");
      assert.equal(error.message, "snapshot: snapshot renderer failed");
      return true;
    },
  );
});

test("eloErrorCode extracts the code from every error shape", () => {
  // resolved { error, error_code } object
  assert.equal(
    eloErrorCode({ error: "nope", error_code: "ELO_BROWSER_UNAVAILABLE" }),
    "ELO_BROWSER_UNAVAILABLE",
  );
  // rejected / thrown Error carrying .error_code
  const err = Object.assign(new Error("boom"), {
    error_code: "ELO_SNAPSHOT_FAILED",
  });
  assert.equal(eloErrorCode(err), "ELO_SNAPSHOT_FAILED");
  // bare known code string (e.g. onSendCDPMessageError second arg)
  assert.equal(
    eloErrorCode("ELO_TASK_SPACE_USER_IN_CONTROL"),
    "ELO_TASK_SPACE_USER_IN_CONTROL",
  );
  // future code this build does not know about is still returned
  assert.equal(
    eloErrorCode({ error_code: "ELO_FUTURE_CODE" }),
    "ELO_FUTURE_CODE",
  );
  // no code present
  assert.equal(eloErrorCode({ error: "plain message" }), undefined);
  assert.equal(eloErrorCode("plain message"), undefined);
});

test("isEloErrorCode narrows to known codes only", () => {
  assert.equal(isEloErrorCode("ELO_TASK_SPACE_NOT_FOUND"), true);
  assert.equal(isEloErrorCode("ELO_FUTURE_CODE"), false);
  assert.equal(isEloErrorCode(undefined), false);
});

test("resolveEloError overrides the native error message with the owned wording for an owned code", () => {
  const { code, message } = resolveEloError({
    error: "Task space 7 is not assigned to an agent.",
    error_code: "ELO_TASK_SPACE_INACTIVE",
  });
  assert.equal(code, "ELO_TASK_SPACE_INACTIVE");
  // Owned id-less guidance replaces the native "Task space 7 ..." text.
  assert.match(message, /claimTaskSpace\(spaceId\)/);
  assert.doesNotMatch(message, /\b7\b/);
});

test("inactive guidance does not attribute an agent-finished task to the user", () => {
  // task.finish({ keep: [...] }) leaves the space user-owned; a later
  // takeOverTaskSpace() gets this code without any user action.
  const { message } = resolveEloError("ELO_TASK_SPACE_INACTIVE");
  assert.doesNotMatch(message, /user has taken control/i);
  assert.match(message, /task\.finish\(\)/);
  assert.match(message, /takeOverTaskSpace\(\) cannot resume/);
  assert.match(message, /claimTaskSpace\(spaceId\)/);
});

test("user-control guidance names both the agent handoff and a browser takeover", () => {
  const { message } = resolveEloError("ELO_TASK_SPACE_USER_IN_CONTROL");
  assert.doesNotMatch(message, /user has taken control/i);
  assert.match(message, /task\.handOff\(\)/);
  assert.match(message, /takeover in the browser/);
});

test("resolveEloError keeps the native error message for an unknown future code", () => {
  assert.deepEqual(
    resolveEloError({
      error: "Some build-specific detail",
      error_code: "ELO_FUTURE_CODE",
    }),
    {
      code: "ELO_FUTURE_CODE",
      message: "Some build-specific detail",
    },
  );
});

test("resolveEloError defers to the native error message for a code elo-browser does not own", () => {
  // ELO_OPERATION_FAILED is not owned: the client wording (e.g. which operation
  // failed) is more specific than any static line.
  assert.deepEqual(
    resolveEloError({
      error: "Failed to create task space",
      error_code: "ELO_OPERATION_FAILED",
    }),
    {
      code: "ELO_OPERATION_FAILED",
      message: "Failed to create task space",
    },
  );
});

test("resolveEloError falls back to the raw code for a bare non-owned code", () => {
  // elo-browser does not own NOT_SELECTED and a bare code carries no native error message,
  // so the stable code itself is the most specific thing to surface.
  assert.deepEqual(resolveEloError("ELO_TASK_SPACE_NOT_SELECTED"), {
    code: "ELO_TASK_SPACE_NOT_SELECTED",
    message: "ELO_TASK_SPACE_NOT_SELECTED",
  });
});

test("resolveEloError uses the id-less guidance block for a bare user-control code", () => {
  const { code, message } = resolveEloError("ELO_TASK_SPACE_USER_IN_CONTROL");
  assert.equal(code, "ELO_TASK_SPACE_USER_IN_CONTROL");
  assert.match(message, /Control of this task space is with the user/);
  assert.match(message, /takeOverTaskSpace\(spaceId\)/);
  assert.doesNotMatch(message, /<id>/);
});

test("resolveEloError falls back to the raw code, then a generic message", () => {
  assert.deepEqual(resolveEloError({ error_code: "ELO_FUTURE_CODE" }), {
    code: "ELO_FUTURE_CODE",
    message: "ELO_FUTURE_CODE",
  });
  assert.deepEqual(resolveEloError({}), {
    code: undefined,
    message: "Unknown Elo error",
  });
});

test("isEloUserControlError keys on the stable code, not wording", () => {
  assert.equal(
    isEloUserControlError(
      Object.assign(new Error("anything at all"), {
        error_code: "ELO_TASK_SPACE_USER_IN_CONTROL",
      }),
    ),
    true,
  );
  // wording that mentions user control but lacks the code is not a match
  assert.equal(
    isEloUserControlError(new Error("the user is controlling this")),
    false,
  );
  assert.equal(
    isEloUserControlError({ error_code: "ELO_SNAPSHOT_FAILED" }),
    false,
  );
});

test("invokeElo resolves native error objects and attaches error_code", async () => {
  await assert.rejects(
    () =>
      invokeElo("listTabs", () => ({
        error: "Task space not selected",
        error_code: "ELO_TASK_SPACE_NOT_SELECTED",
      })),
    (error) => {
      assert.equal(error.message, "listTabs: Task space not selected");
      assert.equal(error.error_code, "ELO_TASK_SPACE_NOT_SELECTED");
      return true;
    },
  );
});

test("invokeElo normalizes synchronous native throws", async () => {
  const nativeError = Object.assign(new Error("native setup failed"), {
    error_code: "ELO_OPERATION_FAILED",
  });
  await assert.rejects(
    () =>
      invokeElo("createTab", () => {
        throw nativeError;
      }),
    (error) => {
      assert.equal(error.message, "createTab: native setup failed");
      assert.equal(error.error_code, "ELO_OPERATION_FAILED");
      return true;
    },
  );
});

test("invokeElo passes through successful results", async () => {
  const ok = { tabs: [] };
  assert.equal(await invokeElo("listTabs", () => ok), ok);
});
