"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCrm } from "@/lib/data";
import { addDaysISO, formatDay, relativeFollowUp, todayISO } from "@/lib/dates";
import { PRIORITIES, STATUS_MAP, CLOSED_STATUSES, type Prospect, type Status } from "@/lib/types";
import { ContactButtons, StatusBadge } from "@/components/ui";
import { MessageButton } from "@/components/message-modal";
import { WorkingNotice } from "@/components/notice";
import { contactLinks } from "@/lib/contact";

type Scope = "mine_free" | "mine" | "all";
type OutcomeKey = "no_answer" | "waiting" | "interested" | "meeting" | "not_interested";

const OUTCOMES: {
  key: OutcomeKey;
  label: string;
  hint: string;
  days: number | null;
  status: Status | null;
  needsDate?: boolean;
}[] = [
  { key: "no_answer", label: "No atendió", hint: "Volver a intentar mañana", days: 1, status: null },
  { key: "waiting", label: "Hablamos / dejé mensaje", hint: "Esperando respuesta", days: 3, status: "esperando_respuesta" },
  { key: "interested", label: "Interesado", hint: "Quiere saber más", days: 2, status: "interesado" },
  { key: "meeting", label: "Reunión agendada", hint: "Elegí la fecha de la reunión", days: 2, status: "reunion_agendada", needsDate: true },
  { key: "not_interested", label: "No interesado", hint: "Se descarta y sale de la cola", days: null, status: "no_interesado" },
];

const prioRank = (p: Prospect) => (p.priority ? p.priority.charCodeAt(0) : 99);

/** Cola: primero lo vencido/de hoy, después lo nuevo por prioridad, después lo que no tiene fecha. */
function buildQueue(prospects: Prospect[], meId: string | undefined, scope: Scope, country: string, skipped: Set<string>) {
  const today = todayISO();
  const bucket = (p: Prospect) =>
    p.next_follow_up && p.next_follow_up <= today ? 0 : !p.next_follow_up && ["nuevo", "pendiente_contactar"].includes(p.status) ? 1 : !p.next_follow_up ? 2 : 9;
  return prospects
    .filter((p) => {
      if (CLOSED_STATUSES.includes(p.status) || skipped.has(p.id) || bucket(p) === 9) return false;
      if (country && p.country !== country) return false;
      if (scope === "mine" && p.owner_id !== meId) return false;
      if (scope === "mine_free" && p.owner_id !== null && p.owner_id !== meId) return false;
      return contactLinks(p).some((l) => ["call", "whatsapp", "email"].includes(l.key));
    })
    .sort((a, b) => {
      const ba = bucket(a), bb = bucket(b);
      if (ba !== bb) return ba - bb;
      if (ba === 0 && a.next_follow_up !== b.next_follow_up) return (a.next_follow_up ?? "") < (b.next_follow_up ?? "") ? -1 : 1;
      return prioRank(a) - prioRank(b) || (b.score ?? -1) - (a.score ?? -1);
    });
}

export default function CallsPage() {
  const { prospects, me, supabase, reload, memberName } = useCrm();
  const [scope, setScope] = useState<Scope>("mine_free");
  const [country, setCountry] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(0);

  const countries = useMemo(
    () => [...new Set(prospects.map((p) => p.country).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [prospects],
  );
  const queue = useMemo(() => buildQueue(prospects, me?.id, scope, country, skipped), [prospects, me, scope, country, skipped]);
  const current = queue[0];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Modo llamadas</h1>
        <p className="text-sm text-muted">
          Siempre el próximo a contactar: primero lo vencido, después lo nuevo por prioridad.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-3">
        <div>
          <label className="label" htmlFor="scope">Mostrar</label>
          <select id="scope" className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="mine_free">Míos y sin asignar</option>
            <option value="mine">Solo míos</option>
            <option value="all">Todos (incluye de otros)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="country">País</label>
          <select id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Todos</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ml-auto text-right text-sm">
          <div className="text-2xl font-semibold tabular-nums">{queue.length}</div>
          <div className="text-xs text-muted">en cola · {done} hechos hoy</div>
        </div>
      </div>

      {!current ? (
        <div className="card p-10 text-center">
          <p className="text-lg font-medium">Cola vacía 🎉</p>
          <p className="mt-1 text-sm text-muted">
            No quedan prospectos para contactar con estos filtros.
            {skipped.size > 0 && " Podés volver a ver los salteados."}
          </p>
          {skipped.size > 0 && (
            <button className="btn-ghost mt-4" onClick={() => setSkipped(new Set())}>Ver salteados</button>
          )}
        </div>
      ) : (
        <CallCard
          key={current.id}
          prospect={current}
          onSkip={() => setSkipped((s) => new Set(s).add(current.id))}
          onDone={() => {
            setSkipped((s) => new Set(s).add(current.id));
            setDone((n) => n + 1);
          }}
          supabase={supabase}
          meId={me?.id}
          reload={reload}
          ownerName={memberName(current.owner_id)}
        />
      )}
    </div>
  );
}

function CallCard({
  prospect: p, onSkip, onDone, supabase, meId, reload, ownerName,
}: {
  prospect: Prospect;
  onSkip: () => void;
  onDone: () => void;
  supabase: ReturnType<typeof useCrm>["supabase"];
  meId: string | undefined;
  reload: () => Promise<void>;
  ownerName: string;
}) {
  const [outcome, setOutcome] = useState<OutcomeKey | null>(null);
  const [note, setNote] = useState("");
  const [response, setResponse] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = OUTCOMES.find((o) => o.key === outcome);
  const prio = PRIORITIES.find((x) => x.value === p.priority);

  function pick(k: OutcomeKey) {
    const o = OUTCOMES.find((x) => x.key === k)!;
    setOutcome(k);
    setNext(o.days === null ? "" : addDaysISO(o.days));
  }

  async function save() {
    if (!chosen || !meId) return;
    setError(null);
    if (chosen.needsDate && !next) return setError("Elegí la fecha de la reunión.");
    setBusy(true);
    const summary = note.trim() || chosen.label;
    const { error: e1 } = await supabase.from("i365_activities").insert({
      prospect_id: p.id,
      author_id: meId,
      kind: "contacto",
      contacted_at: new Date().toISOString(),
      summary,
      response: response.trim() || null,
      next_follow_up: chosen.key === "not_interested" ? null : next || null,
    });
    if (e1) {
      setBusy(false);
      return setError("No se pudo guardar. Reintentá.");
    }
    // Quien registra el contacto queda como responsable si nadie lo era;
    // y si el resultado no define estado, pasa de Nuevo/Pendiente a Contactado.
    const patch: Partial<Prospect> = {};
    if (!p.owner_id) patch.owner_id = meId;
    const newStatus: Status | null = chosen.status ?? (["nuevo", "pendiente_contactar"].includes(p.status) ? "contactado" : null);
    if (newStatus && newStatus !== p.status) patch.status = newStatus;
    if (Object.keys(patch).length > 0) {
      const { error: e2 } = await supabase.from("i365_prospects").update(patch).eq("id", p.id);
      if (e2) setError("Se registró el contacto, pero no se pudo actualizar el estado.");
    }
    await reload();
    setBusy(false);
    onDone();
  }

  return (
    <div className="card space-y-4 p-5">
      <WorkingNotice prospect={p} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/prospectos/${p.id}`} className="text-xl font-semibold hover:text-accent">{p.company_name}</Link>
          <div className="text-sm text-muted">
            {[p.contact_name, p.industry, [p.city, p.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={p.status} />
          {prio && (
            <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ color: prio.color, backgroundColor: `${prio.color}1f` }}>
              Prioridad {prio.value}{p.score != null && ` · ${p.score}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ContactButtons prospect={p} all />
        <MessageButton prospect={p} />
      </div>
      {(p.phone || p.whatsapp || p.email) && (
        <div className="text-sm text-muted">
          {[p.phone, p.whatsapp && p.whatsapp !== p.phone ? `WhatsApp ${p.whatsapp}` : null, p.email].filter(Boolean).join(" · ")}
        </div>
      )}

      <dl className="grid gap-2 rounded-lg bg-surface-2 p-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Responsable</dt>
          <dd>{ownerName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Seguimiento</dt>
          <dd>{p.next_follow_up ? `${formatDay(p.next_follow_up)} · ${relativeFollowUp(p.next_follow_up)}` : "Sin fecha"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted">Última respuesta</dt>
          <dd>{p.last_response ?? "Todavía sin respuesta"}</dd>
        </div>
        {p.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Notas</dt>
            <dd className="line-clamp-4 whitespace-pre-wrap">{p.notes}</dd>
          </div>
        )}
      </dl>

      <div>
        <div className="label">¿Cómo salió?</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={outcome === o.key}
              onClick={() => pick(o.key)}
              className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                outcome === o.key ? "border-accent bg-accent/10" : "border-line hover:bg-surface-2"
              }`}
            >
              <div className="font-medium">{o.label}</div>
              <div className="text-xs text-muted">{o.key === "not_interested" ? o.hint : `${o.hint}${o.status ? ` · → ${STATUS_MAP[o.status].label}` : ""}`}</div>
            </button>
          ))}
        </div>
      </div>

      {chosen && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="c-note">Qué se habló (opcional)</label>
            <textarea id="c-note" rows={2} maxLength={3000} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {chosen.key !== "no_answer" && chosen.key !== "not_interested" && (
            <div>
              <label className="label" htmlFor="c-resp">Qué respondió (opcional)</label>
              <input id="c-resp" maxLength={3000} className="input" value={response} onChange={(e) => setResponse(e.target.value)} />
            </div>
          )}
          {chosen.key !== "not_interested" && (
            <div>
              <label className="label" htmlFor="c-next">{chosen.needsDate ? "Fecha de la reunión" : "Volver a contactar el"}</label>
              <div className="flex flex-wrap items-center gap-2">
                <input id="c-next" type="date" className="input !w-auto" value={next} onChange={(e) => setNext(e.target.value)} />
                {[1, 3, 7].map((d) => (
                  <button key={d} type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => setNext(addDaysISO(d))}>+{d}d</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={onSkip}>Saltear</button>
        <button type="button" className="btn-primary" disabled={!chosen || busy} onClick={() => void save()}>
          {busy ? "Guardando…" : "Guardar y siguiente"}
        </button>
      </div>
      {!p.owner_id && <p className="text-xs text-muted">Al guardar, quedás como responsable de esta empresa.</p>}
    </div>
  );
}
