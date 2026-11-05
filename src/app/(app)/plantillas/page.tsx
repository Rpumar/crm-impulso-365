"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrm } from "@/lib/data";
import { PLACEHOLDERS } from "@/lib/templates";
import type { MessageTemplate } from "@/lib/types";
import { Modal } from "@/components/ui";

type Draft = { id?: string; name: string; channel: "whatsapp" | "email"; subject: string; body: string };
const EMPTY: Draft = { name: "", channel: "whatsapp", subject: "", body: "" };

export default function TemplatesPage() {
  const { supabase, memberName } = useCrm();
  const [items, setItems] = useState<MessageTemplate[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("i365_templates").select("*").order("channel").order("name");
    setItems((data as MessageTemplate[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("i365-templates")
      .on("postgres_changes", { event: "*", schema: "public", table: "i365_templates" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    if (!draft.name.trim() || !draft.body.trim()) return setError("Poné un nombre y el texto del mensaje.");
    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      channel: draft.channel,
      subject: draft.channel === "email" ? draft.subject.trim() || null : null,
      body: draft.body.trim(),
      updated_at: new Date().toISOString(),
    };
    const { error: err } = draft.id
      ? await supabase.from("i365_templates").update(payload).eq("id", draft.id)
      : await supabase.from("i365_templates").insert(payload);
    setBusy(false);
    if (err) return setError("No se pudo guardar. Reintentá.");
    setDraft(null);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("i365_templates").delete().eq("id", id);
    setConfirmId(null);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plantillas de mensaje</h1>
          <p className="text-sm text-muted">
            Textos listos para WhatsApp y email. Desde un prospecto, el botón «Mensaje» completa los datos solo.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setDraft({ ...EMPTY })}>+ Nueva plantilla</button>
      </div>

      {items === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-muted">Todavía no hay plantillas.</div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((t) => (
            <li key={t.id} className="card space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted">Creada por {memberName(t.created_by)}</div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    t.channel === "whatsapp" ? "bg-accent/15 text-accent" : "bg-surface-2 text-white"
                  }`}
                >
                  {t.channel === "whatsapp" ? "WhatsApp" : "Email"}
                </span>
              </div>
              {t.subject && <div className="text-sm"><span className="text-muted">Asunto: </span>{t.subject}</div>}
              <p className="line-clamp-5 whitespace-pre-wrap text-sm text-white/90">{t.body}</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  className="btn-ghost !px-3 !py-1.5 text-xs"
                  onClick={() => setDraft({ id: t.id, name: t.name, channel: t.channel, subject: t.subject ?? "", body: t.body })}
                >
                  Editar
                </button>
                {confirmId === t.id ? (
                  <>
                    <button className="btn-danger !px-3 !py-1.5 text-xs" onClick={() => void remove(t.id)}>Sí, eliminar</button>
                    <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setConfirmId(null)}>No</button>
                  </>
                ) : (
                  <button className="text-xs text-muted underline hover:text-danger" onClick={() => setConfirmId(t.id)}>
                    Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <Modal title={draft.id ? "Editar plantilla" : "Nueva plantilla"} onClose={() => setDraft(null)}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="t-name">Nombre</label>
                <input id="t-name" className="input" maxLength={100} value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="t-ch">Canal</label>
                <select id="t-ch" className="input" value={draft.channel}
                  onChange={(e) => setDraft({ ...draft, channel: e.target.value as Draft["channel"] })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
              </div>
            </div>
            {draft.channel === "email" && (
              <div>
                <label className="label" htmlFor="t-sub">Asunto</label>
                <input id="t-sub" className="input" maxLength={200} value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="t-body">Mensaje</label>
              <textarea id="t-body" rows={8} maxLength={3000} className="input" value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.help}
                    onClick={() => setDraft({ ...draft, body: `${draft.body}{${p.key}}` })}
                    className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-white"
                  >
                    {`{${p.key}}`}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Tocá una variable para agregarla al final; se reemplaza con los datos del prospecto.</p>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
