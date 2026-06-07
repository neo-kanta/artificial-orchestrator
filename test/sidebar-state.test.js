import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDEBAR_LIMITS,
  clampSidebarWidth,
  normalizeSidebarState,
  parseSidebarPreference,
  serializeSidebarPreference,
  setSidebarCollapsed,
  setSidebarWidth,
  sidebarCssWidth
} from "../desktop/renderer/sidebar-state.js";

test("sidebar state normalizes invalid preferences", () => {
  assert.deepEqual(normalizeSidebarState({ collapsed: true, width: "wide" }), {
    collapsed: true,
    width: SIDEBAR_LIMITS.default
  });
  assert.deepEqual(parseSidebarPreference("{not json"), {
    collapsed: false,
    width: SIDEBAR_LIMITS.default
  });
});

test("sidebar width is clamped and rounded for dragging", () => {
  assert.equal(clampSidebarWidth(100), SIDEBAR_LIMITS.min);
  assert.equal(clampSidebarWidth(1000), SIDEBAR_LIMITS.max);
  assert.equal(clampSidebarWidth(301.6), 302);

  const resized = setSidebarWidth({ collapsed: true, width: 286 }, 390.4);
  assert.deepEqual(resized, {
    collapsed: false,
    width: 390
  });
});

test("sidebar collapse keeps the last expanded width", () => {
  const expanded = setSidebarWidth({}, 340);
  const collapsed = setSidebarCollapsed(expanded, true);

  assert.equal(sidebarCssWidth(collapsed), SIDEBAR_LIMITS.collapsed);
  assert.equal(collapsed.width, 340);
  assert.deepEqual(setSidebarCollapsed(collapsed, false), {
    collapsed: false,
    width: 340
  });
});

test("sidebar preference round trips through storage JSON", () => {
  const raw = serializeSidebarPreference({ collapsed: true, width: 375 });
  assert.deepEqual(parseSidebarPreference(raw), {
    collapsed: true,
    width: 375
  });
});
