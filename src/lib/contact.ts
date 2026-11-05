import type { Prospect } from "@/lib/types";

export interface ContactLink {
  key: "call" | "whatsapp" | "email" | "web" | "instagram";
  label: string;
  href: string;
  external: boolean;
}

const digitsOf = (v: string | null) => (v ?? "").replace(/\D/g, "");

/**
 * Enlaces de acción de un prospecto. Los hrefs se construyen solo con partes
 * validadas (dígitos, handle, URL http/https) para evitar esquemas peligrosos.
 */
export function contactLinks(p: Prospect): ContactLink[] {
  const links: ContactLink[] = [];

  const tel = (p.phone ?? "").replace(/[^\d+]/g, "");
  if (digitsOf(tel).length >= 6) {
    links.push({ key: "call", label: "Llamar", href: `tel:${tel}`, external: false });
  }

  // WhatsApp usa su propio campo; si está vacío, prueba con el teléfono
  // (si es un fijo, WhatsApp simplemente avisará que no existe).
  const wa = digitsOf(p.whatsapp) || digitsOf(p.phone);
  if (wa.length >= 8 && wa.length <= 15) {
    links.push({ key: "whatsapp", label: "WhatsApp", href: `https://wa.me/${wa}`, external: true });
  }

  const email = (p.email ?? "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    links.push({ key: "email", label: "Email", href: `mailto:${email}`, external: false });
  }

  const site = (p.website ?? "").trim();
  if (site) {
    try {
      const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
      if (u.protocol === "https:" || u.protocol === "http:") {
        links.push({ key: "web", label: "Sitio web", href: u.href, external: true });
      }
    } catch {
      /* web inválida: sin botón */
    }
  }

  const ig = (p.instagram ?? "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/.*$/, "");
  if (/^[A-Za-z0-9._]{1,30}$/.test(ig)) {
    links.push({ key: "instagram", label: "Instagram", href: `https://instagram.com/${ig}`, external: true });
  }

  return links;
}

/** Dígitos para wa.me: campo WhatsApp o, si está vacío, el teléfono. */
export function whatsappDigits(p: Prospect): string {
  const d = digitsOf(p.whatsapp) || digitsOf(p.phone);
  return d.length >= 8 && d.length <= 15 ? d : "";
}

export function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

/** Gmail en compu (no hay programa de correo asociado); mailto en celular. */
export function emailComposeUrl(to: string, subject: string, body: string): string {
  const q = (s: string) => encodeURIComponent(s);
  return isMobile()
    ? `mailto:${to}?subject=${q(subject)}&body=${q(body)}`
    : `https://mail.google.com/mail/?view=cm&fs=1&to=${q(to)}&su=${q(subject)}&body=${q(body)}`;
}
