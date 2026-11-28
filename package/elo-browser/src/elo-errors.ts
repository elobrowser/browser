/**
 * Shared handling for elo-binding errors.
 *
 * Browser-side failures expose two signals (see the EloBindings JS API):
 *   - human-readable text (`error` on resolved results, `message` on rejected
 *     Errors), and
 *   - a stable `error_code` such as ELO_TASK_SPACE_USER_IN_CONTROL.
 *
 * The code is the durable contract; the wording can drift between builds. Branch
 * on the code (isEloUserControlError), not on the message. ELO_ERROR_MESSAGES is
 * where elo-browser owns its wording for the few codes an agent must act on; every
 * other code (and any unknown future code) defers to the native error message.
 *
 * Single source of truth — error handling was previously duplicated across
 * helpers.ts and driver/nav.ts.
 */

import { markHardStop } from "./output-sink.js";

/** Stable error codes emitted by the native elo bindings. */
export const ELO_ERROR_CODES = [
  "ELO_BROWSER_UNAVAILABLE",
  "ELO_CDP_CHANNEL_UNAVAILABLE",
  "ELO_CDP_SEND_FAILED",
  "ELO_INVALID_ARGUMENT",
  "ELO_INVALID_RESULT_PAYLOAD",
  "ELO_OPERATION_FAILED",
  "ELO_RESULT_CONVERSION_FAILED",
  "ELO_SNAPSHOT_FAILED",
  "ELO_TASK_HOST_DISCONNECTED",
  "ELO_TASK_SPACE_INACTIVE",
  "ELO_TASK_SPACE_NAME_IN_USE",
  "ELO_TASK_SPACE_NOT_FOUND",
  "ELO_TASK_SPACE_NOT_SELECTED",
  "ELO_TASK_SPACE_UNAVAILABLE",
  "ELO_TASK_SPACE_USER_IN_CONTROL",
  "ELO_WEB_CONTENTS_UNAVAILABLE",
] as const;

export type EloErrorCode = (typeof ELO_ERROR_CODES)[number];

/**
 * Codes whose wording elo-browser owns. A listed code returns this static, id-less
 * message instead of the native error message — reserved for the two business signals
 * an agent must react to, not just report. Every other code is absent here and defers
 * to the native error message (and any unknown future code does too), which is more
 * specific than any static line.
 */
const ELO_ERROR_MESSAGES: Partial<Record<EloErrorCode, string>> = {
  // The native code does not say who ended the task or moved control: the
  // agent's own task.finish() / task.handOff() produce the same codes as user
  // actions in the browser. Keep this wording neutral about the cause.
  ELO_TASK_SPACE_INACTIVE: [
    "This task space is no longer assigned to the agent: its task has ended, either through task.finish() or by the user, so browser commands are paused.",
    "This is a hard stop, not an obstacle to route around — do not retry and do not take ownership back on your own. takeOverTaskSpace() cannot resume an ended task.",
    "Wait until the user explicitly asks you to continue in this space, then claim it and resume:",
    "  const task = await claimTaskSpace(spaceId)",
    "",
    `Offer the user choices like "Continue" or "Done" if your harness supports it; otherwise tell them: "This task has ended and the space is yours. Reply 'continue' if you want me to resume in it."`,
  ].join("\n"),
  ELO_TASK_SPACE_USER_IN_CONTROL: [
    "Control of this task space is with the user, either through task.handOff() or a takeover in the browser, so browser commands are paused.",
    "This is a hard stop, not an obstacle to route around — do not retry and do not take control back on your own.",
    "Wait until the user explicitly asks you to continue, then take control back and resume:",
    "  const task = await takeOverTaskSpace(spaceId)",
    "",
    `Offer the user choices like "Continue" or "Finish task" if your harness supports it; otherwise tell them: "You now control this task space. Reply 'continue' when ready and I will resume."`,
  ].join("\n"),
};

const USER_CONTROL_GUIDANCE =
  ELO_ERROR_MESSAGES.ELO_TASK_SPACE_USER_IN_CONTROL as string;

const USER_CONTROL_REASON_MESSAGES = Object.freeze({
  notifications: permissionPrompt("notifications"),
  location: permissionPrompt("location access"),
  camera: permissionPrompt("camera access"),
  microphone: permissionPrompt("microphone access"),
  pan_tilt_zoom_microphone: permissionPrompt(
    "camera control and microphone access",
  ),
  midi: permissionPrompt("MIDI device access"),
  bluetooth: userPromptGuidance(
    "A browser device chooser for Bluetooth has appeared.",
  ),
  usb: userPromptGuidance("A browser device chooser for USB has appeared."),
  serial: userPromptGuidance(
    "A browser port chooser for serial access has appeared.",
  ),
  hid: userPromptGuidance("A browser device chooser for HID has appeared."),
  protocol_handler: permissionPrompt("protocol handler registration"),
  clipboard: permissionPrompt("clipboard access"),
  local_network_access: permissionPrompt("local network access"),
  storage_access: permissionPrompt("storage access"),
  window_management: permissionPrompt("window management"),
  local_fonts: permissionPrompt("local font access"),
  permission_prompt: userPromptGuidance(
    "A browser permission prompt or device chooser has appeared.",
  ),
  manual_takeover: USER_CONTROL_GUIDANCE,
});

function permissionPrompt(access: string): string {
  return userPromptGuidance(
    `A browser permission prompt for ${access} has appeared.`,
  );
}

function userPromptGuidance(firstLine: string): string {
  return [
    firstLine,
    "The user now controls this task space. Wait for the user to handle the prompt.",
    "Resume only after the user confirms, using takeOverTaskSpace(spaceId).",
  ].join("\n");
}

/** Type guard for codes this build knows about. */
export function isEloErrorCode(value: unknown): value is EloErrorCode {
  return (
    typeof value === "string" &&
    (ELO_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * Pull the stable error_code out of any Elo error shape: resolved
 * `{ error, error_code }` objects, rejected/thrown Errors carrying `.error_code`,
 * or a bare known code string. Returns the raw code (which may be one this build
 * does not know about yet) or undefined when none is present.
 */
export function eloErrorCode(err: unknown): string | undefined {
  if (typeof err === "string") {
    return isEloErrorCode(err) ? err : undefined;
  }
  if (err && typeof err === "object") {
    const code = (err as Record<string, unknown>).error_code;
    if (typeof code === "string" && code) return code;
  }
  return undefined;
}

/**
 * Resolve any Elo error into a stable `{ code, message }` pair.
 *
 * For a code elo-browser owns wording for, `message` is that owned wording.
 * Otherwise (a code not owned here, or an unknown future code) it falls back to
 * the native error message the binding returned, then the bare code, then a
 * generic string. `code` is the stable classifier and may be undefined.
 */
export function resolveEloError(err: unknown): {
  code?: string;
  message: string;
} {
  const code = eloErrorCode(err);
  const message =
    (code === "ELO_TASK_SPACE_USER_IN_CONTROL"
      ? resolveUserControlMessage(err)
      : isEloErrorCode(code)
        ? ELO_ERROR_MESSAGES[code]
        : undefined) ??
    nativeErrorText(err) ??
    code ??
    "Unknown Elo error";
  return { code, message };
}

function resolveUserControlMessage(err: unknown): string {
  const nativeText = nativeErrorText(err);
  if (nativeText && Object.hasOwn(USER_CONTROL_REASON_MESSAGES, nativeText)) {
    return USER_CONTROL_REASON_MESSAGES[
      nativeText as keyof typeof USER_CONTROL_REASON_MESSAGES
    ];
  }
  return USER_CONTROL_GUIDANCE;
}

/** Whether an Elo error means the task is currently under user control. */
export function isEloUserControlError(err: unknown): boolean {
  return eloErrorCode(err) === "ELO_TASK_SPACE_USER_IN_CONTROL";
}

/**
 * Probe control without turning the expected user-control response into a hard
 * stop. Elo bindings can report failures either by rejecting or by resolving an
 * `{ error, error_code }` object, so both paths must be inspected here.
 */
export async function probeAgentControl(
  invokeSnapshot: () => unknown | Promise<unknown>,
): Promise<boolean> {
  let result: unknown;
  try {
    result = await invokeSnapshot();
  } catch (error) {
    if (isEloUserControlError(error)) return false;
    throw error;
  }
  if (isResolvedEloError(result)) {
    if (isEloUserControlError(result)) return false;
    throw buildEloError(result);
  }
  return true;
}

function isResolvedEloError(
  value: unknown,
): value is { error: unknown; error_code?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    "error" in value &&
    (value as { error?: unknown }).error != null
  );
}

/**
 * Codes that halt the whole agent task rather than mark a routable obstacle: a task
 * space the user has taken back, or one that is inactive / not assigned to this agent.
 * Both require the user to explicitly hand control back before work can resume.
 */
function isEloHardStopCode(code: string | undefined): boolean {
  return (
    code === "ELO_TASK_SPACE_USER_IN_CONTROL" ||
    code === "ELO_TASK_SPACE_INACTIVE"
  );
}

/**
 * Build an Error carrying the resolved message and stable error_code from any Elo
 * error shape. `op`, when given, prefixes the message with the failing operation.
 * Shared by invokeElo and the CDP-send failure path so every Elo failure surfaces
 * an identical Error shape.
 */
export function buildEloError(
  err: unknown,
  op?: string,
): Error & { error_code?: string } {
  const { code, message } = resolveEloError(err);
  if (isEloHardStopCode(code)) {
    // buildEloError is the single birthplace of every Elo error — invokeElo and the
    // CDP-send failure path both route through it — so recording the hard stop here
    // catches it even when the agent's own try/catch later swallows the thrown Error.
    // The op-less owned message is the one the agent should see, regardless of which
    // operation surfaced it.
    markHardStop(message);
  }
  const error: Error & { error_code?: string } = new Error(
    op ? `${op}: ${message}` : message,
  );
  if (code) error.error_code = code;
  return error;
}

/**
 * Invoke a native binding and normalize synchronous throws, rejected Promises, and
 * resolved `{ error, error_code }` objects. Control-wait probes intentionally bypass
 * this helper because observing user control is their expected result, not a hard stop.
 */
export async function invokeElo<T>(
  op: string,
  invoke: () => T | Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await invoke();
  } catch (error) {
    throw buildEloError(error, op);
  }
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    result.error != null
  ) {
    throw buildEloError(result, op);
  }
  return result;
}

/**
 * The native error message from any Elo error shape — the binding's runtime
 * `error`/`message` text (dynamic, may vary across builds). Ignores bare codes.
 */
function nativeErrorText(err: unknown): string | undefined {
  if (typeof err === "string") {
    return isEloErrorCode(err) ? undefined : err;
  }
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (obj.error != null) return formatEloError(obj.error);
    if (typeof obj.message === "string" && obj.message) return obj.message;
  }
  return undefined;
}

export function formatEloError(err: unknown): string {
  if (err == null) return String(err);
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}
