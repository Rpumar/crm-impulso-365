"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCrm } from "@/lib/data";
import { addDaysISO, formatDateTime, toLocalInput } from "@/lib/dates";
import {
  ACTIVITY_KINDS,
  type Activity,
  type ActivityKind,
  type Prospect,
} from "@/lib/types";
import { ContactButtons, StatusBadge } from "@/components/ui";
import { ProspectForm } from "@/components/prospect-form";
import { MessageButton } from "@/components/message-modal";
import { WorkingNotice } from "@/components/notice";

const KIND_LABEL: Record<ActivityKind, string> = {
  contacto: "Contacto",
  respuesta: "Respuesta",
  reunion: "Reunión",
  nota: "Nota",
  estado: "Estado",
};

export default function ProspectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { prospects, me, supabase, reload, memberName } = useCrm();
  const prospect = prospects.find((p) => p.id === id);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadActivities = useCallback(async () => {
    const { data } = await supabase
      .from("i365_activities")
      .select("*")
      .eq("prospect_id", id)
      .order("contacted_at", { ascending: false })
      .order("created_at", { ascending: false });
    setActivities((data as Activity[]) ?? []);
  }, [supabase, id]);

  useEffect(() => {
    void loadActivities();
    const ch = supabase
      .channel(`i365-act-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "i365_activities",
          filter: `prospect_id=eq.${id}`,
        },
        () => void loadActivities(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, id, loadActivities]);

  if (!prospect) {
    return (
      <div className="card p-10 text-center">
        <p className="mb-3 text-muted">No encontramos este prospecto.</p>
        <Link href="/prospectos" className="btn-ghost">
          Volver a prospectos
        </Link>
      </div>
    );
  }

  async function remove() {
    const { error } = await supabase
      .from("i365_prospects")
      .delete()
      .eq("id", id);
    if (error) return;
    await reload();
    router.replace("/prospectos");
  }

  return (
    <div className="space-y-5">
      <Link href="/prospectos" className="text-sm text-muted hover:text-white">
        ← Prospectos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{prospect.company_name}</h1>
          <p className="text-sm text-muted">
            Responsable:{" "}
            <b className="text-white">{memberName(prospect.owner_id)}</b> ·
            Creado por {memberName(prospect.created_by)} · Última edición:{" "}
            {memberName(prospect.updated_by)},{" "}
            {formatDateTime(prospect.updated_at)}
          </p>
        </div>
        <StatusBadge status={prospect.status} />
      </div>

      <WorkingNotice prospect={prospect} />

      <div className="flex flex-wrap items-center gap-2">
        <ContactButtons prospect={prospect} all />
        <MessageButton prospect={prospect} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Datos del prospecto</h2>
          <ProspectForm
            key={prospect.updated_at}
            initial={prospect}
            onSaved={() => {
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            }}
          />
          {saved && (
            <p role="status" className="mt-3 text-sm text-accent">
              Guardado ✓
            </p>
          )}
          {me?.role === "admin" && (
            <div className="mt-6 border-t border-line pt-4">
              {confirmDelete ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-danger">
                    ¿Eliminar definitivamente?
                  </span>
                  <button className="btn-danger !py-1" onClick={remove}>
                    Sí, eliminar
                  </button>
                  <button
                    className="btn-ghost !py-1"
                    onClick={() => setConfirmDelete(false)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  className="text-xs text-muted underline hover:text-danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Eliminar prospecto
                </button>
              )}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <ActivityForm
            prospect={prospect}
            onAdded={() => void loadActivities()}
          />
          <div className="card p-5">
            <h2 className="mb-4 font-semibold">Historial</h2>
            {activities.length === 0 ? (
              <p className="text-sm text-muted">Sin actividad todavía.</p>
            ) : (
              <ol className="space-y-4">
                {activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-line pl-3">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span
                        className={
                          a.kind === "estado" ? "" : "font-medium text-accent"
                        }
                      >
                        {KIND_LABEL[a.kind]}
                      </span>
                      <span>· {memberName(a.author_id)}</span>
                      <span>· {formatDateTime(a.contacted_at)}</span>
                    </div>
                    {a.summary && (
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        {a.summary}
                      </p>
                    )}
                    {a.response && (
                      <p className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-sm">
                        <span className="text-xs text-muted">Respondió: </span>
                        {a.response}
                      </p>
                    )}
                    {a.next_follow_up && a.kind !== "estado" && (
                      <p className="mt-1 text-xs text-muted">
                        Volver a contactar: {a.next_follow_up}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ActivityForm({
  prospect,
  onAdded,
}: {
  prospect: Prospect;
  onAdded: () => void;
}) {
  const { supabase, me, reload } = useCrm();
  const [kind, setKind] = useState<ActivityKind>("contacto");
  const [when, setWhen] = useState(toLocalInput());
  const [summary, setSummary] = useState("");
  const [response, setResponse] = useState("");
  const [next, setNext] = useState(prospect.next_follow_up ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNote = kind === "nota";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!me) return;
    if (!summary.trim() && !response.trim())
      return setError("Contanos qué pasó o qué respondieron.");
    setBusy(true);
    const { error: err } = await supabase.from("i365_activities").insert({
      prospect_id: prospect.id,
      author_id: me.id,
      kind,
      contacted_at: new Date(when).toISOString(),
      summary: summary.trim(),
      response: response.trim() || null,
      next_follow_up: isNote ? null : next || null,
    });
    setBusy(false);
    if (err) return setError("No se pudo registrar. Reintentá.");
    setSummary("");
    setResponse("");
    setWhen(toLocalInput());
    await reload();
    onAdded();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <h2 className="font-semibold">Registrar actividad</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="a-kind">
            Tipo
          </label>
          <select
            id="a-kind"
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ActivityKind)}
          >
            {ACTIVITY_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="a-when">
            Cuándo
          </label>
          <input
            id="a-when"
            type="datetime-local"
            className="input"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="a-summary">
          Qué se habló / qué hicimos
        </label>
        <textarea
          id="a-summary"
          rows={2}
          maxLength={3000}
          className="input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </div>
      {!isNote && (
        <>
          <div>
            <label className="label" htmlFor="a-resp">
              Qué respondió el prospecto
            </label>
            <input
              id="a-resp"
              maxLength={3000}
              className="input"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="a-next">
              Volver a contactar el
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="a-next"
                type="date"
                className="input !w-auto"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              {[1, 3, 7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="btn-ghost !px-2.5 !py-1.5 text-xs"
                  onClick={() => setNext(addDaysISO(d))}
                >
                  +{d}d
                </button>
              ))}
              <button
                type="button"
                className="btn-ghost !px-2.5 !py-1.5 text-xs"
                onClick={() => setNext("")}
              >
                Sin fecha
              </button>
            </div>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Guardando…" : "Registrar"}
      </button>
    </form>
  );
}
