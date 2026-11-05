"use client";

import { useState } from "react";
import { useCrm } from "@/lib/data";
import { contactLinks } from "@/lib/contact";
import { daysFromToday, formatDay, relativeFollowUp } from "@/lib/dates";
import {
  CLOSED_STATUSES,
  STATUSES,
  STATUS_MAP,
  type Prospect,
  type Status,
} from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_MAP[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ color: s.color, backgroundColor: `${s.color}1f` }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: s.color }}
      />
      {s.label}
    </span>
  );
}

/** Actualiza campos de un prospecto. Devuelve un mensaje de error o null. */
export function useUpdateProspect() {
  const { supabase, reload } = useCrm();
  const [error, setError] = useState<string | null>(null);
  async function update(id: string, patch: Partial<Prospect>) {
    const { error } = await supabase
      .from("i365_prospects")
      .update(patch)
      .eq("id", id);
    setError(error ? "No se pudo guardar el cambio. Reintentá." : null);
    if (!error) await reload();
    return !error;
  }
  return { update, error };
}

export function StatusSelect({
  prospect,
  className = "",
}: {
  prospect: Prospect;
  className?: string;
}) {
  const { update } = useUpdateProspect();
  const s = STATUS_MAP[prospect.status];
  return (
    <select
      aria-label="Estado"
      value={prospect.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) =>
        void update(prospect.id, { status: e.target.value as Status })
      }
      className={`cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-6 text-xs font-medium focus:outline-2 focus:outline-accent ${className}`}
      style={{ color: s.color, backgroundColor: `${s.color}1f` }}
    >
      {STATUSES.map((o) => (
        <option
          key={o.value}
          value={o.value}
          className="bg-surface-2 text-white"
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function OwnerCell({ prospect }: { prospect: Prospect }) {
  const { me, memberName } = useCrm();
  const { update } = useUpdateProspect();
  if (prospect.owner_id) return <span>{memberName(prospect.owner_id)}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (me) void update(prospect.id, { owner_id: me.id });
      }}
      className="rounded-md border border-dashed border-line px-2 py-0.5 text-xs text-accent hover:bg-surface-2"
    >
      Asignarme
    </button>
  );
}

export function FollowUp({ prospect }: { prospect: Prospect }) {
  if (!prospect.next_follow_up) return <span className="text-muted">—</span>;
  const closed = CLOSED_STATUSES.includes(prospect.status);
  const n = daysFromToday(prospect.next_follow_up);
  const tone = closed
    ? "text-muted"
    : n < 0
      ? "text-danger"
      : n === 0
        ? "text-warn"
        : "text-white";
  return (
    <span className={tone}>
      {formatDay(prospect.next_follow_up)}
      <span className="ml-1 text-xs opacity-70">
        · {relativeFollowUp(prospect.next_follow_up)}
      </span>
    </span>
  );
}

/** Botones de acción: Llamar, WhatsApp, Email (y web/Instagram si `all`). */
export function ContactButtons({
  prospect,
  all = false,
}: {
  prospect: Prospect;
  all?: boolean;
}) {
  const links = contactLinks(prospect).filter(
    (l) => all || ["call", "whatsapp", "email"].includes(l.key),
  );
  if (links.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => (
        <a
          key={l.key}
          href={l.href}
          title={`${l.label} a ${prospect.company_name}`}
          aria-label={`${l.label}: ${prospect.company_name}`}
          {...(l.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          onClick={(e) => {
            e.stopPropagation();
            // En compu no siempre hay un programa de correo asociado a mailto:
            // → abrimos la redacción de Gmail. En celular se usa el mail del teléfono.
            if (l.key === "email" && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
              e.preventDefault();
              const to = l.href.replace(/^mailto:/, "");
              window.open(
                `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}`,
                "_blank",
                "noopener,noreferrer",
              );
            }
          }}
          className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:brightness-125 ${
            l.key === "whatsapp"
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-line bg-surface-2 text-white"
          }`}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card max-h-[92dvh] w-full max-w-2xl overflow-y-auto p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 text-2xl leading-none text-muted hover:text-white"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
