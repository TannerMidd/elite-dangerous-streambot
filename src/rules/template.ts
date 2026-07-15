/**
 * Tiny template renderer for rule args: "{{ path.to.value | filter | filter }}".
 * Paths resolve against the scope object (event, status, session). Unknown
 * paths render as an empty string rather than failing the whole dispatch.
 */

type Filter = (value: unknown) => unknown;

const FILTERS: Record<string, Filter> = {
  credits: (v) => `${formatNumber(v)} CR`,
  number: (v) => formatNumber(v),
  round: (v) => (typeof v === 'number' ? String(Math.round(v)) : String(v ?? '')),
  fixed1: (v) => (typeof v === 'number' ? v.toFixed(1) : String(v ?? '')),
  ly: (v) => (typeof v === 'number' ? `${v.toFixed(1)} ly` : String(v ?? '')),
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
};

function formatNumber(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v).toLocaleString('en-US');
  return String(v ?? '');
}

function resolvePath(scope: Record<string, unknown>, dotted: string): unknown {
  let current: unknown = scope;
  for (const part of dotted.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderTemplate(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, inner: string) => {
    const segments = inner.split('|').map((s) => s.trim());
    const pathExpr = segments.shift();
    if (!pathExpr) return '';
    let value = resolvePath(scope, pathExpr);
    for (const name of segments) {
      const filter = FILTERS[name];
      if (filter) value = filter(value);
    }
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

export function renderArgs(
  args: Record<string, string> | undefined,
  scope: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, template] of Object.entries(args ?? {})) {
    out[key] = renderTemplate(String(template), scope);
  }
  return out;
}
