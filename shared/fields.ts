// A board's custom fields. Values are stored as strings; the field's type decides how they are checked and shown.

export const FIELD_TYPES = ["text", "number", "date", "link", "select"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export type Field = { id: string; name: string; type: FieldType; options?: string[] };

export const MAX_FIELDS = 20;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_LIKE = /^(https?:\/\/\S+|([\w-]+\.)+[a-z]{2,}(\/\S*)?)$/i; // a full URL, or a bare domain with an optional path

export function inferType(value: string): FieldType {
  const v = value.trim();
  if (DATE.test(v)) return "date";
  if (toNumber(v) !== undefined) return "number";
  if (URL_LIKE.test(v)) return "link";
  return "text";
}

/** "$45,000" -> 45000, "1.5M" -> 1500000, "50k" -> 50000. */
function toNumber(v: string) {
  const m = /^[$€£¥]?\s*(-?[\d,]*\.?\d+)\s*([kmb])?$/i.exec(v.trim());
  if (!m) return undefined;
  const n = Number(m[1]!.replace(/,/g, "")) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k"] ?? 1);
  return Number.isFinite(n) ? n : undefined;
}

/** "" clears the field; undefined means the value doesn't fit the type. */
export function cleanValue(field: Field, raw: unknown): string | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const v = String(raw).trim().slice(0, 500);
  if (!v) return "";
  switch (field.type) {
    case "number": { const n = toNumber(v); return n === undefined ? undefined : String(n); }
    case "date": return DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;
    case "link": return URL_LIKE.test(v) ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : undefined;
    case "select": return field.options?.find((o) => o.toLowerCase() === v.toLowerCase());
    default: return v;
  }
}

export function parseFields(v: unknown): Field[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.slice(0, MAX_FIELDS).flatMap((f: any) => {
    const id = typeof f?.id === "string" && /^[\w-]{1,40}$/.test(f.id) ? f.id : "";
    const name = typeof f?.name === "string" ? f.name.trim().slice(0, 40) : "";
    if (!id || !name || seen.has(id) || !FIELD_TYPES.includes(f.type)) return [];
    seen.add(id);
    const options = f.type === "select" && Array.isArray(f.options)
      ? [...new Set(f.options.filter((o: unknown) => typeof o === "string" && o.trim()).map((o: string) => o.trim().slice(0, 40)))].slice(0, 30) as string[]
      : undefined;
    return [{ id, name, type: f.type, ...(options ? { options } : {}) }];
  });
}

/** Keeps only the board's fields, each value fitting its type. */
export function parseValues(v: unknown, fields: Field[]): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const f of fields) {
    const clean = Object.hasOwn(v, f.id) ? cleanValue(f, (v as any)[f.id]) : undefined;
    if (clean) out[f.id] = clean;
  }
  return Object.keys(out).length ? out : undefined;
}

export function fieldId(name: string, fields: Field[]) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "field";
  let id = base;
  for (let i = 2; fields.some((f) => f.id === id); i++) id = `${base}-${i}`;
  return id;
}
