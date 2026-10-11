const PROJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function projectFormState(input = {}, projects = []) {
  const name = String(input.name ?? "").trim();
  const path = String(input.path ?? "").trim();
  const errors = [];

  const existingName = projects.find((project) => project.name.toLowerCase() === name.toLowerCase());
  const existingPath = projects.find((project) => sameProjectPath(project.path, path));

  if (!name) {
    errors.push("Enter a project name.");
  } else if (!PROJECT_NAME_PATTERN.test(name)) {
    errors.push("Project names must start with a letter or number and use only letters, numbers, dots, dashes, or underscores.");
  } else if (existingName) {
    errors.push(`Project name "${existingName.name}" already exists.`);
  }

  if (!path) {
    errors.push("Choose a project folder.");
  } else if (!isLikelyAbsolutePath(path)) {
    errors.push("Use Browse or enter an absolute project path.");
  } else if (existingPath) {
    errors.push(`That folder is already registered as "${existingPath.name}".`);
  }

  return {
    ok: errors.length === 0,
    name,
    path,
    errors,
    message:
      errors[0] ??
      "Ready to add project. The desktop app will verify the folder exists before saving.",
    status: errors.length === 0 ? "ready" : "blocked"
  };
}

export function isLikelyAbsolutePath(path) {
  const value = String(path ?? "").trim();
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value) || value.startsWith("/");
}

function sameProjectPath(left, right) {
  const normalizedLeft = normalizeComparablePath(left);
  const normalizedRight = normalizeComparablePath(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizeComparablePath(path) {
  return String(path ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/g, "")
    .toLowerCase();
}
