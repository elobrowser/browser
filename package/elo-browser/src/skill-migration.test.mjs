import test from "node:test";
import assert from "node:assert/strict";

import {
  STALE_SKILL_PREFIX,
  createStaleEloBrowserGuard,
  installStaleEloBrowserGuard,
} from "../dist/src/skill-migration.js";

test("the 1.3 eloBrowser namespace stops with current API guidance", () => {
  const eloBrowser = createStaleEloBrowserGuard();

  for (const method of ["newTaskSpace", "switchTaskSpace", "helper", "site"]) {
    assert.throws(
      () => eloBrowser[method],
      (error) => {
        assert.equal(error.name, "EloBrowserSkillStaleError");
        assert.ok(error.message.startsWith(STALE_SKILL_PREFIX));
        assert.match(error.message, new RegExp(`eloBrowser\\.${method}`));
        assert.match(error.message, /Run `elo-browser skill`/);
        assert.match(error.message, /taskSpace\(nameOrId\)/);
        return true;
      },
    );
  }
});

test("the stale-skill guard does not invent unrelated namespace members", () => {
  const eloBrowser = createStaleEloBrowserGuard();

  assert.equal(eloBrowser.unknownFutureMethod, undefined);
  assert.equal(eloBrowser.then, undefined);
  assert.equal(eloBrowser[Symbol.toStringTag], undefined);
  assert.deepEqual(Object.keys(eloBrowser), []);
});

test("the SDK guard is non-enumerable and leaves 1.2.3 globals alone", () => {
  const legacyClick = () => {};
  const target = { click: legacyClick };

  installStaleEloBrowserGuard(target);

  assert.equal(target.click, legacyClick);
  assert.equal(
    Object.prototype.propertyIsEnumerable.call(target, "eloBrowser"),
    false,
  );
  assert.throws(() => target.eloBrowser.newTaskSpace, /skill-stale/);
});
