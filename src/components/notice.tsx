"use client";

import { useCrm } from "@/lib/data";
import { CLOSED_STATUSES, type Prospect } from "@/lib/types";

const DAY = 86_400_000;

/**
 * Avisos para no pisarse entre integrantes: otra persona es la responsable
 * o contactó a la empresa hace poco. Devuelve [] si no hay nada que avisar.
 */
export function useWorkingNotices(p: Prospect): string[] {
  const { me, memberName } = useCrm();
  if (!me || CLOSED_STATUSES.includes(p.status)) return [];
  const out: string[] = [];
  if (p.owner_id && p.owner_id !== me.id) {
    out.push(`${memberName(p.owner_id)} es la persona responsable de esta empresa. Coordiná con ${memberName(p.owner_id)} antes de contactarla.`);
  }
  if (p.last_contact_by && p.last_contact_by !== me.id && p.last_contact_at) {
    const days = Math.floor((Date.now() - new Date(p.last_contact_at).getTime()) / DAY);
    if (days <= 7) {
      const when = days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} días`;
      out.push(`${memberName(p.last_contact_by)} ya la contactó ${when}.`);
    }
  }
  return out;
}

export function WorkingNotice({ prospect }: { prospect: Prospect }) {
  const notices = useWorkingNotices(prospect);
  if (notices.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
      <b>Ojo:</b>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
