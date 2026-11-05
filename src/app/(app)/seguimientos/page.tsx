"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCrm } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { CLOSED_STATUSES, type Prospect } from "@/lib/types";
import { FollowUp, StatusBadge } from "@/components/ui";

function Section({ title, tone, items, empty }: { title: string; tone: string; items: Prospect[]; empty: string }) {
  const { memberName } = useCrm();
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className={`font-semibold ${tone}`}>{title}</h2>
        <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/prospectos/${p.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.company_name}</div>
                  <div className="truncate text-xs text-muted">
                    {memberName(p.owner_id)}
                    {p.last_response ? ` · “${p.last_response}”` : ""}
                  </div>
                </div>
                <StatusBadge status={p.status} />
                <div className="w-36 text-right text-sm"><FollowUp prospect={p} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function FollowUpsPage() {
  const { prospects, me } = useCrm();
  const [mine, setMine] = useState(false);
  const today = todayISO();

  const { overdue, todayList, upcoming, meetings } = useMemo(() => {
    const open = prospects.filter((p) => !CLOSED_STATUSES.includes(p.status) && (!mine || p.owner_id === me?.id));
    const byDate = (a: Prospect, b: Prospect) => (a.next_follow_up ?? "").localeCompare(b.next_follow_up ?? "");
    const dated = open.filter((p) => p.next_follow_up);
    return {
      overdue: dated.filter((p) => p.next_follow_up! < today).sort(byDate),
      todayList: dated.filter((p) => p.next_follow_up === today),
      upcoming: dated.filter((p) => p.next_follow_up! > today).sort(byDate),
      meetings: open.filter((p) => p.status === "reunion_agendada").sort(byDate),
    };
  }, [prospects, mine, me, today]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Próximos seguimientos</h1>
          <p className="text-sm text-muted">Para que ningún prospecto se nos olvide.</p>
        </div>
        <div className="inline-flex rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="Filtro">
          {[{ v: false, l: "Todos" }, { v: true, l: "Solo míos" }].map((o) => (
            <button key={o.l} onClick={() => setMine(o.v)} aria-pressed={mine === o.v}
              className={`rounded-md px-3 py-1.5 ${mine === o.v ? "bg-accent font-medium text-accent-ink" : "text-muted hover:text-white"}`}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <Section title="Atrasados" tone="text-danger" items={overdue} empty="Nada atrasado. ¡Bien!" />
      <Section title="Para hoy" tone="text-warn" items={todayList} empty="No hay seguimientos para hoy." />
      <Section title="Próximos" tone="text-white" items={upcoming} empty="No hay seguimientos futuros cargados." />
      <Section title="Reuniones agendadas" tone="text-accent" items={meetings} empty="No hay reuniones agendadas." />
    </div>
  );
}
