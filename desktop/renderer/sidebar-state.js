export const SIDEBAR_STORAGE_KEY = "ao.projectSidebar";

export const SIDEBAR_LIMITS = Object.freeze({
  collapsed: 58,
  default: 286,
  min: 220,
  max: 420
});

export function normalizeSidebarState(value = {}, limits = SIDEBAR_LIMITS) {
  return {
    collapsed: Boolean(value?.collapsed),
    width: clampSidebarWidth(value?.width, limits)
  };
}

export function parseSidebarPreference(raw, limits = SIDEBAR_LIMITS) {
  if (!raw) return normalizeSidebarState({}, limits);
  try {
    return normalizeSidebarState(JSON.parse(raw), limits);
  } catch {
    return normalizeSidebarState({}, limits);
  }
}

export function serializeSidebarPreference(state, limits = SIDEBAR_LIMITS) {
  return JSON.stringify(normalizeSidebarState(state, limits));
}

export function setSidebarCollapsed(state, collapsed, limits = SIDEBAR_LIMITS) {
  return {
    ...normalizeSidebarState(state, limits),
    collapsed: Boolean(collapsed)
  };
}

export function setSidebarWidth(state, width, limits = SIDEBAR_LIMITS) {
  return {
    ...normalizeSidebarState(state, limits),
    collapsed: false,
    width: clampSidebarWidth(width, limits)
  };
}

export function sidebarCssWidth(state, limits = SIDEBAR_LIMITS) {
  const normalized = normalizeSidebarState(state, limits);
  return normalized.collapsed ? limits.collapsed : normalized.width;
}

export function clampSidebarWidth(width, limits = SIDEBAR_LIMITS) {
  const value = Number(width);
  if (!Number.isFinite(value)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}
