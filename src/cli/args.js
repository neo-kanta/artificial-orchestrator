export function parseArgs(argv) {
  const out = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }

    if (!arg.startsWith("-")) {
      out._.push(arg);
      continue;
    }

    if (arg.startsWith("--no-")) {
      out[toCamel(arg.slice(5))] = false;
      continue;
    }

    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const rawKey = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const key = toCamel(rawKey);
      const value = eq === -1 ? undefined : arg.slice(eq + 1);

      if (value !== undefined) {
        out[key] = coerce(value);
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        out[key] = coerce(next);
        i += 1;
      } else {
        out[key] = true;
      }
      continue;
    }

    const short = arg.slice(1);
    if (short.length > 1) {
      for (const flag of short) out[flag] = true;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("-")) {
      out[short] = coerce(next);
      i += 1;
    } else {
      out[short] = true;
    }
  }

  return out;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function coerce(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
