/** Tiny argv parser: positional args + --flag / --key value / --key=value. */
export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const out: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          out.flags[a.slice(2)] = next;
          i++;
        } else {
          out.flags[a.slice(2)] = true;
        }
      }
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

export function flagStr(flags: ParsedArgs['flags'], key: string, def: string): string {
  const v = flags[key];
  return typeof v === 'string' ? v : def;
}

export function flagNum(flags: ParsedArgs['flags'], key: string, def: number): number {
  const v = flags[key];
  if (typeof v !== 'string') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number, got ${v}`);
  return n;
}

export function flagBool(flags: ParsedArgs['flags'], key: string): boolean {
  const v = flags[key];
  return v === true || v === 'true' || v === '1';
}
