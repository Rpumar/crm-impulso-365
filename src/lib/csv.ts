import { STATUS_MAP, type Activity, type Prospect } from "@/lib/types";

type Cell = string | number | null | undefined;

const PLAIN_PHONE = /^[+-]\d[\d\s().-]*$/;

/**
 * Escapa una celda para CSV y neutraliza «inyección de fórmulas»: si empieza con
 * = + - @ (o tab/enter) Excel/Sheets podrían ejecutarla. Los teléfonos normales se dejan tal cual.
 */
function cell(v: Cell, sep: string): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_PHONE.test(s)) s = `'${s}`;
  return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM (acentos en Excel) y «;» como separador (Excel en español; Sheets lo detecta solo). */
export function toCsv(header: string[], rows: Cell[][]): string {
  const sep = ";";
  const lines = [header, ...rows].map((r) => r.map((c) => cell(c, sep)).join(sep));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 10);

const dt = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

export function prospectsCsv(rows: Prospect[], name: (id: string | null) => string): string {
  const header = [
    "Empresa", "Contacto", "País", "Ciudad", "Rubro", "Sitio web", "Teléfono", "WhatsApp", "Instagram", "Email",
    "Responsable", "Estado", "Prioridad", "Score", "Fecha de incorporación", "Último contacto", "Último contacto por",
    "Última respuesta", "Próximo seguimiento", "Notas", "Creado por", "Creado el", "Editado por", "Editado el",
  ];
  return toCsv(
    header,
    rows.map((p) => [
      p.company_name, p.contact_name, p.country, p.city, p.industry, p.website, p.phone, p.whatsapp, p.instagram, p.email,
      p.owner_id ? name(p.owner_id) : "", STATUS_MAP[p.status]?.label ?? p.status, p.priority, p.score,
      p.joined_at, dt(p.last_contact_at), p.last_contact_by ? name(p.last_contact_by) : "",
      p.last_response, p.next_follow_up, p.notes,
      p.created_by ? name(p.created_by) : "", dt(p.created_at), p.updated_by ? name(p.updated_by) : "", dt(p.updated_at),
    ]),
  );
}

const KIND: Record<string, string> = {
  contacto: "Contacto", respuesta: "Respuesta", reunion: "Reunión", nota: "Nota", estado: "Cambio de estado",
};

export function activitiesCsv(rows: Activity[], company: (id: string) => string, name: (id: string | null) => string): string {
  return toCsv(
    ["Empresa", "Fecha", "Tipo", "Autor", "Qué se habló / hizo", "Respuesta del prospecto", "Próximo seguimiento"],
    rows.map((a) => [company(a.prospect_id), dt(a.contacted_at), KIND[a.kind] ?? a.kind, a.author_id ? name(a.author_id) : "", a.summary, a.response, a.next_follow_up]),
  );
}
