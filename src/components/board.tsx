"use client";

import { useState } from "react";
import Link from "next/link";
import { useCrm } from "@/lib/data";
import { FollowUp, StatusSelect, useUpdateProspect } from "@/components/ui";
import { PRIORITIES, STATUSES, type Prospect, type Status } from "@/lib/types";

const PAGE = 25;

function Card({ p, owner }: { p: Prospect; owner: string }) {
  const prio = PRIORITIES.find((x) => x.value === p.priority);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="card cursor-grab space-y-1.5 bg-surface-2 p-2.5 text-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/prospectos/${p.id}`} className="font-medium leading-snug hover:text-accent">
          {p.company_name}
        </Link>
        {prio && (
          <span
            className="shrink-0 rounded px-1.5 text-xs font-semibold"
            style={{ color: prio.color, backgroundColor: `${prio.color}1f` }}
            title={p.score != null ? `Score ${p.score}` : undefined}
          >
            {prio.value}
          </span>
        )}
      </div>
      <div className="truncate text-xs text-muted">
        {[p.industry, p.city ?? p.country].filter(Boolean).join(" · ") || "—"}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="truncate text-muted">{owner}</span>
        <FollowUp prospect={p} />
      </div>
      {/* En celular no hay arrastrar y soltar: se cambia el estado desde acá */}
      <div className="md:hidden">
        <StatusSelect prospect={p} />
      </div>
    </div>
  );
}

function Column({ status, rows }: { status: (typeof STATUSES)[number]; rows: Prospect[] }) {
  const { memberName } = useCrm();
  const { update, error } = useUpdateProspect();
  const [over, setOver] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  return (
    <section
      aria-label={status.label}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) void update(id, { status: status.value as Status });
      }}
      className={`flex max-h-[70vh] w-72 shrink-0 flex-col rounded-xl border bg-surface transition-colors ${
        over ? "border-accent bg-accent/5" : "border-line"
      }`}
    >
      <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
          {status.label}
        </span>
        <span className="rounded-full bg-surface-2 px-2 text-xs tabular-nums text-muted">{rows.length}</span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {rows.slice(0, limit).map((p) => (
          <Card key={p.id} p={p} owner={memberName(p.owner_id)} />
        ))}
        {rows.length > limit && (
          <button className="btn-ghost w-full !py-1.5 text-xs" onClick={() => setLimit((n) => n + PAGE)}>
            Ver {Math.min(PAGE, rows.length - limit)} más ({rows.length - limit} restantes)
          </button>
        )}
        {rows.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Soltá una tarjeta acá</p>}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </section>
  );
}

/** Tablero por estado. Arrastrar una tarjeta a otra columna cambia su estado. */
export function Board({ rows }: { rows: Prospect[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
      <div className="flex gap-3">
        {STATUSES.map((s) => (
          <Column key={s.value} status={s} rows={rows.filter((p) => p.status === s.value)} />
        ))}
      </div>
    </div>
  );
}
