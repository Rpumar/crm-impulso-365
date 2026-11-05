"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCrm } from "@/lib/data";
import { formatDay } from "@/lib/dates";
import { PRIORITIES, STATUSES, type Prospect } from "@/lib/types";
import { MessageButton } from "@/components/message-modal";
import { Board } from "@/components/board";
import { downloadCsv, prospectsCsv, stamp } from "@/lib/csv";
import {
  ContactButtons,
  FollowUp,
  Modal,
  OwnerCell,
  StatusBadge,
  StatusSelect,
} from "@/components/ui";
import { ProspectForm } from "@/components/prospect-form";

const uniq = (xs: (string | null)[]) =>
  [...new Set(xs.filter((x): x is string => !!x && x.trim() !== ""))].sort(
    (a, b) => a.localeCompare(b),
  );

type SortKey = "recientes" | "prioridad" | "seguimiento" | "nombre";

function PriorityBadge({ p }: { p: Prospect }) {
  const pr = PRIORITIES.find((x) => x.value === p.priority);
  if (!pr) return <span className="text-muted">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ color: pr.color, backgroundColor: `${pr.color}1f` }}
      title={p.score != null ? `Score ${p.score}` : undefined}
    >
      {pr.value}
      {p.score != null && (
        <span className="font-normal opacity-80">{p.score}</span>
      )}
    </span>
  );
}

function sortRows(list: Prospect[], sort: SortKey): Prospect[] {
  if (sort === "recientes") return list;
  const nullsLast = (a: string | null, b: string | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
  return [...list].sort((a, b) => {
    if (sort === "nombre") return a.company_name.localeCompare(b.company_name);
    if (sort === "seguimiento")
      return nullsLast(a.next_follow_up, b.next_follow_up);
    return (
      nullsLast(a.priority, b.priority) || (b.score ?? -1) - (a.score ?? -1)
    );
  });
}

function ProspectsView() {
  const { prospects, team, memberName } = useCrm();
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [status, setStatus] = useState(params.get("estado") ?? "");
  const [owner, setOwner] = useState(params.get("responsable") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [priority, setPriority] = useState(params.get("prioridad") ?? "");
  const [sort, setSort] = useState<SortKey>("recientes");
  const [view, setView] = useState<"lista" | "tablero">("lista");
  const [creating, setCreating] = useState(params.get("nuevo") === "1");

  const countries = useMemo(
    () => uniq(prospects.map((p) => p.country)),
    [prospects],
  );
  const industries = useMemo(
    () => uniq(prospects.map((p) => p.industry)),
    [prospects],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = prospects.filter((p) => {
      if (
        term &&
        !`${p.company_name} ${p.contact_name ?? ""}`
          .toLowerCase()
          .includes(term)
      )
        return false;
      if (country && p.country !== country) return false;
      if (industry && p.industry !== industry) return false;
      if (status && p.status !== status) return false;
      if (priority && p.priority !== priority) return false;
      if (
        owner === "none" ? p.owner_id !== null : owner && p.owner_id !== owner
      )
        return false;
      if (from && p.joined_at < from) return false;
      if (to && p.joined_at > to) return false;
      return true;
    });
    return sortRows(list, sort);
  }, [
    prospects,
    q,
    country,
    industry,
    status,
    owner,
    from,
    to,
    priority,
    sort,
  ]);

  const filtered = !!(
    q ||
    country ||
    industry ||
    status ||
    owner ||
    from ||
    to ||
    priority
  );
  const clear = () => {
    setQ("");
    setCountry("");
    setIndustry("");
    setStatus("");
    setOwner("");
    setFrom("");
    setTo("");
    setPriority("");
  };

  const sel = (
    value: string,
    set: (v: string) => void,
    label: string,
    opts: { v: string; l: string }[],
  ) => (
    <select
      aria-label={label}
      className="input"
      value={value}
      onChange={(e) => set(e.target.value)}
    >
      <option value="">{label}</option>
      {opts.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prospectos</h1>
          <p className="text-sm text-muted">
            {rows.length} {rows.length === 1 ? "resultado" : "resultados"}
            {filtered && ` de ${prospects.length}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-line p-0.5 text-sm"
            role="group"
            aria-label="Vista"
          >
            {(["lista", "tablero"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 capitalize ${
                  view === v
                    ? "bg-accent font-medium text-accent-ink"
                    : "text-muted hover:text-white"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            className="btn-ghost"
            disabled={rows.length === 0}
            title="Descarga los prospectos que ves ahora (con los filtros aplicados)"
            onClick={() =>
              downloadCsv(
                `impulso365-prospectos-${stamp()}.csv`,
                prospectsCsv(rows, memberName),
              )
            }
          >
            Exportar CSV
          </button>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Nuevo prospecto
          </button>
        </div>
      </div>

      <div className="card space-y-3 p-3">
        <input
          type="search"
          className="input"
          placeholder="Buscar por empresa o contacto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar"
        />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {sel(
            status,
            setStatus,
            "Todos los estados",
            STATUSES.map((s) => ({ v: s.value, l: s.label })),
          )}
          {sel(owner, setOwner, "Todos los responsables", [
            { v: "none", l: "Sin asignar" },
            ...team.map((m) => ({ v: m.id, l: m.full_name })),
          ])}
          {sel(
            country,
            setCountry,
            "Todos los países",
            countries.map((c) => ({ v: c, l: c })),
          )}
          {sel(
            industry,
            setIndustry,
            "Todos los rubros",
            industries.map((c) => ({ v: c, l: c })),
          )}
          {sel(
            priority,
            setPriority,
            "Todas las prioridades",
            PRIORITIES.map((x) => ({ v: x.value, l: x.label })),
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="from">
              Incorporado desde
            </label>
            <input
              id="from"
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="to">
              hasta
            </label>
            <input
              id="to"
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="sort">
              Ordenar por
            </label>
            <select
              id="sort"
              className="input"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              <option value="recientes">Más recientes</option>
              <option value="prioridad">Prioridad y score</option>
              <option value="seguimiento">Próximo seguimiento</option>
              <option value="nombre">Nombre (A–Z)</option>
            </select>
          </div>
          {filtered && (
            <button className="btn-ghost" onClick={clear}>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {prospects.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="mb-3 text-muted">Todavía no hay prospectos cargados.</p>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            Agregar el primero
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Ningún prospecto coincide con los filtros.
        </div>
      ) : view === "tablero" ? (
        <Board rows={rows} />
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Prio.</th>
                  <th className="px-4 py-3">Contactar</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Último contacto / respuesta</th>
                  <th className="px-4 py-3">Volver a contactar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/prospectos/${p.id}`)}
                    className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/prospectos/${p.id}`}
                        className="font-medium hover:text-accent"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.company_name}
                      </Link>
                      <div className="text-xs text-muted">
                        {[p.contact_name, p.industry, p.country]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge p={p} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ContactButtons prospect={p} />
                        <MessageButton prospect={p} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <OwnerCell prospect={p} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect prospect={p} />
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <div className="text-xs text-muted">
                        {p.last_contact_at
                          ? formatDay(p.last_contact_at)
                          : "Sin contacto"}
                      </div>
                      {p.last_response && (
                        <div className="line-clamp-2 text-sm">
                          {p.last_response}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <FollowUp prospect={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {rows.map((p) => (
              <ProspectCard key={p.id} p={p} owner={memberName(p.owner_id)} />
            ))}
          </ul>
        </>
      )}

      {creating && (
        <Modal title="Nuevo prospecto" onClose={() => setCreating(false)}>
          <ProspectForm
            onCancel={() => setCreating(false)}
            onSaved={(id) => {
              setCreating(false);
              router.push(`/prospectos/${id}`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function ProspectCard({ p, owner }: { p: Prospect; owner: string }) {
  return (
    <li className="card p-3">
      <Link href={`/prospectos/${p.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{p.company_name}</div>
            <div className="truncate text-xs text-muted">
              {[p.contact_name, p.industry, p.country]
                .filter(Boolean)
                .join(" · ") || "—"}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge status={p.status} />
            <PriorityBadge p={p} />
          </div>
        </div>
        {p.last_response && (
          <p className="mt-2 line-clamp-2 text-sm text-white/90">
            “{p.last_response}”
          </p>
        )}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted">Resp.: {owner}</span>
          <FollowUp prospect={p} />
        </div>
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <ContactButtons prospect={p} />
        <MessageButton prospect={p} />
      </div>
    </li>
  );
}

export default function ProspectsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
      <ProspectsView />
    </Suspense>
  );
}
