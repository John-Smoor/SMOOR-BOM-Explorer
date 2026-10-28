/**
 * Numeric helpers that reproduce the exact Python / numpy / pandas semantics the
 * original Streamlit app relied on. Do not "simplify" these — they exist so the
 * TypeScript port returns bit-identical numbers.
 */

/** numpy rint: round half to even. Exact for |x| < 2^52. */
export function rint(x: number): number {
  if (!Number.isFinite(x)) return x;
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** numpy.round(x, decimals) / np.float64.__round__ (used by Series.round and round(np.float64, n)). */
export function npRound(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return x;
  const p = Math.pow(10, decimals);
  return rint(x * p) / p;
}

/**
 * numpy add.reduce for float64 (Series.sum / nansum) over a contiguous array.
 * Mirrors numpy's DOUBLE_pairwise_sum (verified empirically against pandas).
 */
function pairwise(a: number[], start: number, n: number): number {
  if (n < 8) {
    let res = -0;
    for (let i = 0; i < n; i++) res += a[start + i];
    return res;
  }
  if (n <= 128) {
    const r = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 8; j++) r[j] = a[start + j];
    let i = 8;
    for (; i < n - (n % 8); i += 8) {
      for (let j = 0; j < 8; j++) r[j] += a[start + i + j];
    }
    let res = (r[0] + r[1] + (r[2] + r[3])) + (r[4] + r[5] + (r[6] + r[7]));
    for (; i < n; i++) res += a[start + i];
    return res;
  }
  let n2 = Math.floor(n / 2);
  n2 -= n2 % 8;
  return pairwise(a, start, n2) + pairwise(a, start + n2, n - n2);
}

export function npSum(a: number[]): number {
  if (a.length === 0) return 0;
  return pairwise(a, 0, a.length);
}

/** pandas groupby(...).sum(): Kahan-compensated sum, NaN/null skipped, empty -> 0. */
export function kahanSum(values: (number | null)[]): number {
  let sum = 0;
  let comp = 0;
  for (const v of values) {
    if (v === null || Number.isNaN(v)) continue;
    const y = v - comp;
    const t = sum + y;
    if (!Number.isFinite(t)) {
      sum = t;
      comp = 0;
      continue;
    }
    comp = t - sum - y;
    sum = t;
  }
  return sum;
}

/** Python repr(float). */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  const [mant, expS] = Math.abs(x).toExponential().split("e");
  const exp = parseInt(expS, 10);
  const digits = mant.replace(".", "");
  if (exp >= -4 && exp < 16) {
    let s: string;
    if (exp >= 0) {
      const intPart = digits.length > exp + 1 ? digits.slice(0, exp + 1) : digits.padEnd(exp + 1, "0");
      const frac = digits.length > exp + 1 ? digits.slice(exp + 1) : "0";
      s = `${intPart}.${frac}`;
    } else {
      s = `0.${"0".repeat(-exp - 1)}${digits}`;
    }
    return sign + s;
  }
  const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  const e = exp < 0 ? `-${String(-exp).padStart(2, "0")}` : `+${String(exp).padStart(2, "0")}`;
  return `${sign}${m}e${e}`;
}

/** Python str(v) for the scalar types we meet in BOM cells. */
export function pyStr(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e16 ? String(v) : pyFloatRepr(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  return String(v);
}

/** Python format(x, f".{d}f") — correctly rounded, exact ties go to even. */
export function fmtFixed(x: number, d: number, thousands = false): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  let s = Math.abs(x) >= 1e21 ? `${x < 0 ? "-" : ""}${BigInt(Math.abs(x)).toString()}${d > 0 ? "." + "0".repeat(d) : ""}` : x.toFixed(d);
  if (Object.is(x, -0)) s = "-" + s;
  // toFixed rounds exact ties away from zero; Python rounds them to even.
  const t = x * Math.pow(2, d + 1); // exact (power of two)
  if (Number.isInteger(t) && Math.abs(t) % 2 === 1 && Math.abs(x) < 1e15) {
    const scaled = Math.abs(t) * Math.pow(5, d); // = 2·|x|·10^d, odd integer
    const lo = (scaled - 1) / 2;
    const q = lo % 2 === 0 ? lo : lo + 1;
    const str = String(q).padStart(d + 1, "0");
    const body = d > 0 ? `${str.slice(0, str.length - d)}.${str.slice(str.length - d)}` : str;
    s = (x < 0 && q !== 0 ? "-" : x < 0 ? "-" : "") + body;
  }
  if (thousands) {
    const neg = s.startsWith("-");
    const [i, f] = (neg ? s.slice(1) : s).split(".");
    const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    s = (neg ? "-" : "") + withSep + (f !== undefined ? `.${f}` : "");
  }
  return s;
}

/** Python format(x, "g") — 6 significant digits, exact ties to even. */
export function fmtG(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const P = 6;
  const sign = x < 0 ? "-" : "";
  const ax = Math.abs(x);
  const strip = (t: string) => (t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t);
  const sci = (mant: string, e: number) =>
    `${sign}${strip(mant)}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  let e0 = parseInt(ax.toExponential().split("e")[1], 10);
  let digits: string; // P significant digits, correctly rounded (ties to even)
  if (P - 1 - e0 >= 0 && e0 >= -4) {
    digits = fmtFixed(ax, P - 1 - e0).replace(".", "").replace(/^0+/, "");
  } else if (Number.isInteger(ax)) {
    const full = BigInt(ax).toString();
    const keep = full.slice(0, P);
    const rest = full.slice(P);
    let q = BigInt(keep);
    const half = "5" + "0".repeat(rest.length - 1);
    if (rest > half || (rest === half && q % 2n === 1n)) q += 1n;
    digits = q.toString();
  } else {
    digits = ax.toExponential(P - 1).split("e")[0].replace(".", "");
  }
  if (digits.length > P) { e0 += 1; digits = digits.slice(0, P); } // rounded up to the next power of ten
  digits = digits.padEnd(P, "0");
  if (e0 >= -4 && e0 < P) {
    const t = e0 >= 0 ? `${digits.slice(0, e0 + 1)}.${digits.slice(e0 + 1)}` : `0.${"0".repeat(-e0 - 1)}${digits}`;
    return sign + strip(t);
  }
  return sci(`${digits[0]}.${digits.slice(1)}`, e0);
}

/** pandas.to_numeric(errors="coerce") for a single cell. */
export function toNumeric(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  if (s === "") return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) && !/^[+-]?(inf|infinity|nan)$/i.test(s)) return null;
  const n = Number(s.replace(/^([+-]?)inf(inity)?$/i, "$1Infinity"));
  return Number.isNaN(n) ? null : n;
}

export const isNum = (v: number | null | undefined): v is number => typeof v === "number" && !Number.isNaN(v);
