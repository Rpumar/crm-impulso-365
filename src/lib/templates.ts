import type { Prospect } from "@/lib/types";

export const PLACEHOLDERS = [
  { key: "saludo", help: "«Hola Ana» o «Hola» si no hay nombre de contacto" },
  { key: "empresa", help: "Nombre de la empresa" },
  { key: "contacto", help: "Nombre del contacto (vacío si no hay)" },
  { key: "mi_nombre", help: "Tu nombre en el CRM" },
  { key: "rubro", help: "Rubro (inmobiliaria, estudio jurídico…)" },
  { key: "ciudad", help: "Ciudad" },
  { key: "pais", help: "País" },
] as const;

/** Reemplaza {variables}. Las desconocidas se dejan tal cual para que se noten. */
export function renderTemplate(text: string, prospect: Prospect, myName: string): string {
  const contact = prospect.contact_name?.trim() ?? "";
  const values: Record<string, string> = {
    saludo: contact ? `Hola ${contact}` : "Hola",
    empresa: prospect.company_name,
    contacto: contact,
    mi_nombre: myName,
    rubro: (prospect.industry ?? "").toLowerCase(),
    ciudad: prospect.city ?? "",
    pais: prospect.country ?? "",
  };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}
