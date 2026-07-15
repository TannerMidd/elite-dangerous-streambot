/**
 * Safe expression evaluator for rule `when` conditions.
 *
 * Rules are shared between streamers, so by default conditions must not be
 * arbitrary JavaScript. This is a small recursive-descent parser/evaluator
 * covering everything real rules need — comparisons, boolean logic,
 * arithmetic, dotted paths on event/status/session, and a fixed set of
 * helper functions — with no access to anything else: no globals, no
 * prototypes, no method calls, no assignment.
 *
 * Rules that genuinely need full JavaScript can opt in per-rule with
 * `unsafe: true` (documented as running arbitrary code).
 *
 * Grammar:
 *   or      := and ('||' and)*
 *   and     := unary ('&&' unary)*
 *   unary   := '!' unary | cmp
 *   cmp     := add (('==='|'!=='|'=='|'!='|'>='|'<='|'>'|'<') add)?
 *   add     := mul (('+'|'-') mul)*
 *   mul     := neg (('*'|'/'|'%') neg)*
 *   neg     := '-' neg | primary
 *   primary := number | string | true | false | null | path
 *            | func '(' args ')' | '(' or ')'
 *   path    := ('event'|'status'|'session') ('.' ident)*
 */

export class ExprError extends Error {}

type Scope = Record<string, unknown>;
type EvalFn = (scope: Scope) => unknown;

const ROOTS = new Set(['event', 'status', 'session']);
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Helper functions available in conditions. String matching is case-insensitive. */
const FUNCS: Record<string, { arity: [number, number]; fn: (...args: unknown[]) => unknown }> = {
  contains: { arity: [2, 2], fn: (a, b) => str(a).toLowerCase().includes(str(b).toLowerCase()) },
  startsWith: { arity: [2, 2], fn: (a, b) => str(a).toLowerCase().startsWith(str(b).toLowerCase()) },
  endsWith: { arity: [2, 2], fn: (a, b) => str(a).toLowerCase().endsWith(str(b).toLowerCase()) },
  lower: { arity: [1, 1], fn: (a) => str(a).toLowerCase() },
  upper: { arity: [1, 1], fn: (a) => str(a).toUpperCase() },
  len: { arity: [1, 1], fn: (a) => (Array.isArray(a) ? a.length : str(a).length) },
  abs: { arity: [1, 1], fn: (a) => Math.abs(Number(a)) },
  round: { arity: [1, 1], fn: (a) => Math.round(Number(a)) },
  min: { arity: [2, 8], fn: (...a) => Math.min(...a.map(Number)) },
  max: { arity: [2, 8], fn: (...a) => Math.max(...a.map(Number)) },
};

interface Token {
  kind: 'num' | 'str' | 'ident' | 'op';
  value: string;
  pos: number;
}

const OPS = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '!', '+', '-', '*', '/', '%', '(', ')', ',', '.'];

function tokenize(src: string): Token[] {
  if (src.length > 1000) throw new ExprError('Expression is too long (max 1000 characters)');
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(src.slice(i))!;
      tokens.push({ kind: 'num', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { out += src[j + 1]; j += 2; }
        else { out += src[j]; j++; }
      }
      if (j >= src.length) throw new ExprError(`Unterminated string starting at position ${i}`);
      tokens.push({ kind: 'str', value: out, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      tokens.push({ kind: 'ident', value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected character "${c}" at position ${i}`);
    tokens.push({ kind: 'op', value: op, pos: i });
    i += op.length;
  }
  if (tokens.length > 200) throw new ExprError('Expression has too many terms');
  return tokens;
}

class Parser {
  private tokens: Token[];
  private i = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private takeOp(...ops: string[]): string | null {
    const t = this.peek();
    if (t && t.kind === 'op' && ops.includes(t.value)) {
      this.i++;
      return t.value;
    }
    return null;
  }

  parse(): EvalFn {
    const fn = this.or();
    const rest = this.peek();
    if (rest) throw new ExprError(`Unexpected "${rest.value}" at position ${rest.pos}`);
    return fn;
  }

  private or(): EvalFn {
    let left = this.and();
    while (this.takeOp('||')) {
      const l = left;
      const r = this.and();
      left = (s) => Boolean(l(s)) || Boolean(r(s));
    }
    return left;
  }

  private and(): EvalFn {
    let left = this.unary();
    while (this.takeOp('&&')) {
      const l = left;
      const r = this.unary();
      left = (s) => Boolean(l(s)) && Boolean(r(s));
    }
    return left;
  }

  private unary(): EvalFn {
    if (this.takeOp('!')) {
      const operand = this.unary();
      return (s) => !operand(s);
    }
    return this.cmp();
  }

  private cmp(): EvalFn {
    const left = this.add();
    const op = this.takeOp('===', '!==', '==', '!=', '>=', '<=', '>', '<');
    if (!op) return left;
    const right = this.add();
    switch (op) {
      case '===': case '==': return (s) => left(s) === right(s);
      case '!==': case '!=': return (s) => left(s) !== right(s);
      case '>=': return (s) => (left(s) as number) >= (right(s) as number);
      case '<=': return (s) => (left(s) as number) <= (right(s) as number);
      case '>': return (s) => (left(s) as number) > (right(s) as number);
      default: return (s) => (left(s) as number) < (right(s) as number);
    }
  }

  private add(): EvalFn {
    let left = this.mul();
    let op: string | null;
    while ((op = this.takeOp('+', '-'))) {
      const l = left;
      const r = this.mul();
      left = op === '+'
        ? (s) => (l(s) as number) + (r(s) as number)
        : (s) => (l(s) as number) - (r(s) as number);
    }
    return left;
  }

  private mul(): EvalFn {
    let left = this.neg();
    let op: string | null;
    while ((op = this.takeOp('*', '/', '%'))) {
      const l = left;
      const r = this.neg();
      if (op === '*') left = (s) => (l(s) as number) * (r(s) as number);
      else if (op === '/') left = (s) => (l(s) as number) / (r(s) as number);
      else left = (s) => (l(s) as number) % (r(s) as number);
    }
    return left;
  }

  private neg(): EvalFn {
    if (this.takeOp('-')) {
      const operand = this.neg();
      return (s) => -(operand(s) as number);
    }
    return this.primary();
  }

  private primary(): EvalFn {
    const t = this.peek();
    if (!t) throw new ExprError('Unexpected end of expression');

    if (t.kind === 'num') { this.i++; const v = Number(t.value); return () => v; }
    if (t.kind === 'str') { this.i++; const v = t.value; return () => v; }

    if (this.takeOp('(')) {
      const inner = this.or();
      if (!this.takeOp(')')) throw new ExprError('Missing closing ")"');
      return inner;
    }

    if (t.kind === 'ident') {
      this.i++;
      if (t.value === 'true') return () => true;
      if (t.value === 'false') return () => false;
      if (t.value === 'null') return () => null;
      if (t.value === 'undefined') return () => undefined;

      // function call
      if (this.takeOp('(')) {
        const def = FUNCS[t.value];
        if (!def) {
          throw new ExprError(
            `Unknown function "${t.value}" — available: ${Object.keys(FUNCS).join(', ')}`,
          );
        }
        const args: EvalFn[] = [];
        if (!this.takeOp(')')) {
          do { args.push(this.or()); } while (this.takeOp(','));
          if (!this.takeOp(')')) throw new ExprError(`Missing ")" after ${t.value}(...)`);
        }
        const [min, max] = def.arity;
        if (args.length < min || args.length > max) {
          throw new ExprError(`${t.value}() takes ${min === max ? min : `${min}–${max}`} argument(s)`);
        }
        return (s) => def.fn(...args.map((a) => a(s)));
      }

      // dotted path rooted at event/status/session
      if (!ROOTS.has(t.value)) {
        throw new ExprError(
          `Unknown name "${t.value}" — conditions can reference event.*, status.*, session.*, ` +
          `or the functions ${Object.keys(FUNCS).join(', ')}`,
        );
      }
      const segments: string[] = [t.value];
      while (this.takeOp('.')) {
        const seg = this.peek();
        if (!seg || seg.kind !== 'ident') throw new ExprError(`Expected a field name after "." at position ${t.pos}`);
        if (FORBIDDEN_SEGMENTS.has(seg.value)) throw new ExprError(`"${seg.value}" is not allowed in a path`);
        segments.push(seg.value);
        this.i++;
      }
      return (s) => {
        let cur: unknown = s;
        for (const seg of segments) {
          if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
          cur = (cur as Record<string, unknown>)[seg];
        }
        return cur;
      };
    }

    throw new ExprError(`Unexpected "${t.value}" at position ${t.pos}`);
  }
}

/**
 * Compile a condition to an evaluator. Throws ExprError with a
 * human-readable message when the expression isn't supported.
 */
export function compileSafe(expr: string): EvalFn {
  return new Parser(tokenize(expr)).parse();
}
