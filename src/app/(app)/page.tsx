"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCrm } from "@/lib/data";
import { formatDateTime, todayISO } from "@/lib/dates";
import {
  CLOSED_STATUSES,
  NOT_CONTACTED,
  STATUSES,
  type Activity,
} from "@/lib/types";

type Recent = Activity & {
  prospect: { id: string; company_name: string } | null;
};

function Stat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href?: string;
  accent?: string;
}) {
  const body = (
    <div className="card h-full p-4 transition-colors hover:bg-surface-2">
      <div className="text-xs text-muted">{label}</div>
      <div
        className="mt-1 text-3xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Dashboard() {
  const { prospects, team, supabase, memberName, me } = useCrm();
  const [recent, setRecent] = useState<Recent[]>([]);
  const [noMfa, setNoMfa] = useState(false);

  useEffect(() => {
    void supabase.auth.mfa
      .listFactors()
      .then(({ data }) => setNoMfa(!!data && data.totp.length === 0));
  }, [supabase]);
  const today = todayISO();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("i365_activities")
        .select("*, prospect:i365_prospects(id, company_name)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (alive && data) setRecent(data as unknown as Recent[]);
    };
    void load();
    const ch = supabase
      .channel("i365-recent")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "i365_activities" },
        () => void load(),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [supabase]);

  const s = useMemo(() => {
    const count = (st: string) =>
      prospects.filter((p) => p.status === st).length;
    const open = prospects.filter(
      (p) => !CLOSED_STATUSES.includes(p.status) && p.next_follow_up,
    );
    return {
      total: prospects.length,
      contacted: prospects.filter((p) => !NOT_CONTACTED.includes(p.status))
        .length,
      interested: count("interesado"),
      waiting: count("esperando_respuesta"),
      meetings: count("reunion_agendada"),
      closed: count("cliente_cerrado"),
      lost: count("no_interesado"),
      overdue: open.filter((p) => p.next_follow_up! < today).length,
      today: open.filter((p) => p.next_follow_up === today).length,
      byStatus: STATUSES.map((st) => ({ ...st, n: count(st.value) })),
    };
  }, [prospects, today]);

  const maxN = Math.max(1, ...s.byStatus.map((b) => b.n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Hola, {me?.full_name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted">
            Resumen de la actividad comercial de Impulso 365.
          </p>
        </div>
        <Link href="/prospectos?nuevo=1" className="btn-primary">
          + Nuevo prospecto
        </Link>
      </div>

      {noMfa && (
        <Link
          href="/cuenta"
          className="card flex flex-wrap items-center justify-between gap-2 border-accent/40 bg-accent/5 p-4 text-sm"
        >
          <span>
            <b>Protegé tu cuenta:</b> activá la verificación en dos pasos. Los
            contactos de Impulso 365 son datos reales.
          </span>
          <span className="text-accent">Activar →</span>
        </Link>
      )}

      {(s.overdue > 0 || s.today > 0) && (
        <Link
          href="/seguimientos"
          className="card flex flex-wrap items-center justify-between gap-2 border-warn/40 bg-warn/5 p-4 text-sm"
        >
          <span>
            {s.overdue > 0 && (
              <b className="text-danger">
                {s.overdue} seguimiento{s.overdue > 1 ? "s" : ""} atrasado
                {s.overdue > 1 ? "s" : ""}
              </b>
            )}
            {s.overdue > 0 && s.today > 0 && " · "}
            {s.today > 0 && <b className="text-warn">{s.today} para hoy</b>}
          </span>
          <span className="text-accent">Ver seguimientos →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Prospectos registrados"
          value={s.total}
          href="/prospectos"
        />
        <Stat label="Contactados" value={s.contacted} />
        <Stat
          label="Interesados"
          value={s.interested}
          href="/prospectos?estado=interesado"
          accent="#1be38b"
        />
        <Stat
          label="Pendientes de respuesta"
          value={s.waiting}
          href="/prospectos?estado=esperando_respuesta"
          accent="#f5b84b"
        />
        <Stat
          label="Reuniones agendadas"
          value={s.meetings}
          href="/prospectos?estado=reunion_agendada"
          accent="#22d3ee"
        />
        <Stat
          label="Clientes cerrados"
          value={s.closed}
          href="/prospectos?estado=cliente_cerrado"
          accent="#4ade80"
        />
        <Stat
          label="Descartados"
          value={s.lost}
          href="/prospectos?estado=no_interesado"
          accent="#ff6b6b"
        />
      </div>

      {s.total === 0 ? (
        <div className="card p-10 text-center">
          <p className="mb-3 text-muted">
            Todavía no hay prospectos. Cargá el primero para empezar.
          </p>
          <Link href="/prospectos?nuevo=1" className="btn-primary">
            Agregar prospecto
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Embudo por estado</h2>
            <ul className="space-y-2.5">
              {s.byStatus.map((b) => (
                <li key={b.value}>
                  <Link
                    href={`/prospectos?estado=${b.value}`}
                    className="group block"
                  >
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted group-hover:text-white">
                        {b.label}
                      </span>
                      <span className="tabular-nums">{b.n}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${(b.n / maxN) * 100}%`,
                          backgroundColor: b.color,
                        }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="space-y-5">
            <section className="card p-5">
              <h2 className="mb-4 font-semibold">Por integrante</h2>
              <ul className="space-y-2 text-sm">
                {[
                  ...team.map((m) => ({
                    id: m.id as string | null,
                    name: m.full_name,
                  })),
                  { id: null, name: "Sin asignar" },
                ].map((m) => {
                  const mine = prospects.filter((p) => p.owner_id === m.id);
                  if (m.id === null && mine.length === 0) return null;
                  return (
                    <li
                      key={m.id ?? "none"}
                      className="flex items-center justify-between"
                    >
                      <Link
                        href={`/prospectos?responsable=${m.id ?? "none"}`}
                        className="hover:text-accent"
                      >
                        {m.name}
                      </Link>
                      <span className="text-muted">
                        <b className="text-white tabular-nums">{mine.length}</b>{" "}
                        prospectos ·{" "}
                        <span className="text-[#4ade80]">
                          {
                            mine.filter((p) => p.status === "cliente_cerrado")
                              .length
                          }{" "}
                          cerrados
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="card p-5">
              <h2 className="mb-4 font-semibold">Actividad reciente</h2>
              {recent.length === 0 ? (
                <p className="text-sm text-muted">Sin actividad todavía.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {recent.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/prospectos/${a.prospect_id}`}
                        className="block hover:text-accent"
                      >
                        <span className="font-medium">
                          {a.prospect?.company_name ?? "—"}
                        </span>
                        <span className="text-muted">
                          {" "}
                          · {memberName(a.author_id)} ·{" "}
                          {formatDateTime(a.created_at)}
                        </span>
                        <div className="line-clamp-1 text-muted">
                          {a.response ? `Respondió: ${a.response}` : a.summary}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
