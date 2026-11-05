export const STATUSES = [
  { value: "nuevo", label: "Nuevo", color: "#8b98a8" },
  {
    value: "pendiente_contactar",
    label: "Pendiente de contactar",
    color: "#a78bfa",
  },
  { value: "contactado", label: "Contactado", color: "#38bdf8" },
  {
    value: "esperando_respuesta",
    label: "Esperando respuesta",
    color: "#f5b84b",
  },
  { value: "interesado", label: "Interesado", color: "#1be38b" },
  { value: "reunion_agendada", label: "Reunión agendada", color: "#22d3ee" },
  { value: "negociacion", label: "Negociación", color: "#fb923c" },
  { value: "cliente_cerrado", label: "Cliente cerrado", color: "#4ade80" },
  { value: "no_interesado", label: "No interesado", color: "#ff6b6b" },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export const STATUS_MAP = Object.fromEntries(
  STATUSES.map((s) => [s.value, s]),
) as Record<Status, (typeof STATUSES)[number]>;

// "Contactado" = ya se hizo al menos un primer contacto.
export const NOT_CONTACTED: Status[] = ["nuevo", "pendiente_contactar"];
export const CLOSED_STATUSES: Status[] = ["cliente_cerrado", "no_interesado"];

export const ACTIVITY_KINDS = [
  { value: "contacto", label: "Contacto realizado" },
  { value: "respuesta", label: "Respuesta recibida" },
  { value: "reunion", label: "Reunión" },
  { value: "nota", label: "Nota / comentario" },
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]["value"] | "estado";

export const INDUSTRY_SUGGESTIONS = [
  "Inmobiliaria",
  "Estudio jurídico",
  "Clínica",
  "Gimnasio",
  "Restaurante",
  "Comercio",
  "Educación",
  "Contabilidad",
  "Turismo",
  "Otro",
];

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "member";
  active: boolean;
}

export interface Prospect {
  id: string;
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
  owner_id: string | null;
  joined_at: string;
  status: Status;
  notes: string | null;
  priority: Priority | null;
  score: number | null;
  last_contact_at: string | null;
  last_contact_by: string | null;
  last_response: string | null;
  next_follow_up: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  prospect_id: string;
  author_id: string | null;
  kind: ActivityKind;
  contacted_at: string;
  summary: string;
  response: string | null;
  next_follow_up: string | null;
  created_at: string;
}

export type Priority = "A" | "B" | "C";

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "A", label: "A · Alta", color: "#1be38b" },
  { value: "B", label: "B · Media", color: "#f5b84b" },
  { value: "C", label: "C · Baja", color: "#8b98a8" },
];

export interface MessageTemplate {
  id: string;
  name: string;
  channel: "whatsapp" | "email";
  subject: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
