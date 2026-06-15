export function projectNameFromPath(path) {
  const value = String(path ?? "").trim().replace(/[\\/]+$/, "");
  if (!value) return "";
  return value.split(/[\\/]+/).at(-1) ?? "";
}
