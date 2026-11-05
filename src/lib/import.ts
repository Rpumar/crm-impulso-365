import type { Priority } from "@/lib/types";

export const IMPORT_FIELDS = [
  { key: "company_name", label: "Empresa", required: true, aliases: ["empresa", "nombre de la empresa", "nombre empresa", "razon social", "company", "negocio", "organizacion", "cliente", "nombre"] },
  { key: "contact_name", label: "Contacto", aliases: ["contacto", "nombre contacto", "nombre del contacto", "persona de contacto", "contact"] },
  { key: "country", label: "País", aliases: ["pais", "country"] },
  { key: "city", label: "Ciudad", aliases: ["ciudad", "zona ciudad", "localidad", "city", "zona"] },
  { key: "industry", label: "Rubro", aliases: ["rubro", "industria", "categoria", "sector", "tipo de negocio"] },
  { key: "website", label: "Sitio web", aliases: ["sitio web", "web", "website", "pagina web", "sitio", "url"] },
  { key: "phone", label: "Teléfono", aliases: ["telefono", "tel", "celular", "movil", "phone", "fono"] },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "wpp", "wsp"] },
  { key: "instagram", label: "Instagram", aliases: ["instagram", "insta", "ig"] },
  { key: "email", label: "Correo electrónico", aliases: ["correo electronico", "email", "e mail", "correo", "mail"] },
  { key: "notes", label: "Notas", aliases: ["notas", "observaciones", "comentarios", "nota", "notes"] },
  { key: "priority", label: "Prioridad (A/B/C)", aliases: ["prioridad", "prio", "priority"] },
  { key: "score", label: "Score (0–100)", aliases: ["score", "puntaje", "puntuacion"] },
] as const;

export type FieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Record<FieldKey, number>; // índice de columna, -1 = no importar

export const MAX_ROWS = 2000;
export const MAX_BYTES = 2 * 1024 * 1024;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const normHeader = (s: string) => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const alnum = (s: string) => strip(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Adivina qué columna del archivo corresponde a cada campo del CRM. */
export function autoMap(headers: string[]): Mapping {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const map = {} as Mapping;
  for (const f of IMPORT_FIELDS) {
    let idx = -1;
    for (const a of f.aliases) {
      idx = norm.findIndex((h, i) => !used.has(i) && h === a);
      if (idx >= 0) break;
    }
    if (idx < 0) {
      for (const a of f.aliases) {
        idx = norm.findIndex((h, i) => !used.has(i) && ` ${h} `.includes(` ${a} `));
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) used.add(idx);
    map[f.key] = idx;
  }
  return map;
}

export interface ImportDefaults {
  country: string;
  industry: string;
}

export interface CleanRow {
  company_name: string;
  contact_name: string | null;
  country: string | null;
  city: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  notes: string | null;
  priority: Priority | null;
  score: number | null;
}

const LIMITS: Partial<Record<keyof CleanRow, number>> = {
  company_name: 200, contact_name: 200, country: 100, city: 100, industry: 100,
  website: 300, phone: 50, whatsapp: 50, instagram: 150, email: 200, notes: 5000,
};

/** Limpia una fila del archivo. Devuelve los datos y avisos (qué se corrigió o descartó). */
export function cleanRow(raw: string[], map: Mapping, defaults: ImportDefaults): { data: CleanRow; warnings: string[] } {
  const warnings: string[] = [];
  const get = (k: FieldKey) => (map[k] >= 0 ? (raw[map[k]] ?? "").trim() : "");
  const text = (k: keyof CleanRow & FieldKey) => {
    let v = get(k);
    const max = LIMITS[k];
    if (max && v.length > max) {
      v = v.slice(0, max);
      warnings.push(`${k} recortado`);
    }
    return v === "" ? null : v;
  };

  let email = text("email");
  if (email) {
    email = email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      warnings.push("email inválido (se omitió)");
      email = null;
    }
  }

  let website = text("website");
  if (website) website = website.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  const prioRaw = get("priority").toUpperCase();
  const priority = (["A", "B", "C"] as const).find((p) => p === prioRaw) ?? null;
  if (prioRaw && !priority) warnings.push("prioridad inválida (se omitió)");

  let score: number | null = null;
  const scoreRaw = get("score");
  if (scoreRaw !== "") {
    const n = Number(scoreRaw.replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 100) score = Math.round(n);
    else warnings.push("score inválido (se omitió)");
  }

  return {
    data: {
      company_name: text("company_name") ?? "",
      contact_name: text("contact_name"),
      country: text("country") ?? (defaults.country.trim() || null),
      city: text("city"),
      industry: text("industry") ?? (defaults.industry.trim() || null),
      website: website || null,
      phone: text("phone"),
      whatsapp: text("whatsapp"),
      instagram: text("instagram"),
      email,
      notes: text("notes"),
      priority,
      score,
    },
    warnings,
  };
}

/** Claves para detectar duplicados: empresa, sitio web, email o teléfono iguales. */
export function dedupeKeys(p: {
  company_name?: string | null; website?: string | null; email?: string | null; phone?: string | null; whatsapp?: string | null;
}): string[] {
  const keys: string[] = [];
  const c = alnum(p.company_name ?? "");
  if (c.length >= 3) keys.push(`c:${c}`);
  const host = (p.website ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (host.length >= 4) keys.push(`w:${host}`);
  const mail = (p.email ?? "").trim().toLowerCase();
  if (mail.includes("@")) keys.push(`e:${mail}`);
  for (const ph of [p.phone, p.whatsapp]) {
    const d = (ph ?? "").replace(/\D/g, "");
    if (d.length >= 8) keys.push(`p:${d}`);
  }
  return keys;
}

/** Plantilla descargable: solo encabezados, sin datos. */
export const TEMPLATE_HEADERS = ["Empresa", "Contacto", "País", "Ciudad", "Rubro", "Sitio web", "Teléfono", "WhatsApp", "Instagram", "Email", "Notas", "Prioridad", "Score"];
