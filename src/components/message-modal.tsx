"use client";

import { useEffect, useMemo, useState } from "react";
import { useCrm } from "@/lib/data";
import { addDaysISO } from "@/lib/dates";
import { emailComposeUrl, whatsappDigits } from "@/lib/contact";
import { renderTemplate } from "@/lib/templates";
import type { MessageTemplate, Prospect } from "@/lib/types";
import { Modal } from "@/components/ui";
import { WorkingNotice } from "@/components/notice";

/** Botón + ventana para enviar un mensaje armado con una plantilla. */
export function MessageButton({ prospect }: { prospect: Prospect }) {
  const [open, setOpen] = useState(false);
  const hasWa = !!whatsappDigits(prospect);
  const hasMail = !!prospect.email;
  if (!hasWa && !hasMail) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-md border border-accent bg-accent px-2 py-1 text-xs font-semibold text-accent-ink hover:brightness-110"
      >
        Mensaje
      </button>
      {open && (
        <span onClick={(e) => e.stopPropagation()}>
          <MessageModal prospect={prospect} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}

function MessageModal({
  prospect,
  onClose,
}: {
  prospect: Prospect;
  onClose: () => void;
}) {
  const { supabase, me, reload } = useCrm();
  const wa = whatsappDigits(prospect);
  const mail = (prospect.email ?? "").trim();

  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [channel, setChannel] = useState<"whatsapp" | "email">(
    wa ? "whatsapp" : "email",
  );
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [register, setRegister] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase
      .from("i365_templates")
      .select("*")
      .order("name")
      .then(
        ({ data }) => alive && setTemplates((data as MessageTemplate[]) ?? []),
      );
    return () => {
      alive = false;
    };
  }, [supabase]);

  const options = useMemo(
    () => (templates ?? []).filter((t) => t.channel === channel),
    [templates, channel],
  );

  // Al cambiar de canal o plantilla, se vuelve a armar el texto (editable a mano).
  useEffect(() => {
    const t = options.find((o) => o.id === templateId) ?? options[0];
    if (!t) {
      setTemplateId("");
      setSubject("");
      setBody("");
      return;
    }
    setTemplateId(t.id);
    setSubject(renderTemplate(t.subject ?? "", prospect, me?.full_name ?? ""));
    setBody(renderTemplate(t.body, prospect, me?.full_name ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, templateId, prospect.id]);

  async function send() {
    setError(null);
    if (!body.trim()) return setError("El mensaje está vacío.");
    // window.open va primero y sin await, para que el navegador no lo bloquee.
    const url =
      channel === "whatsapp"
        ? `https://wa.me/${wa}?text=${encodeURIComponent(body)}`
        : emailComposeUrl(mail, subject, body);
    window.open(url, "_blank", "noopener,noreferrer");

    if (register && me) {
      const tpl = options.find((o) => o.id === templateId);
      const { error: err } = await supabase.from("i365_activities").insert({
        prospect_id: prospect.id,
        author_id: me.id,
        kind: "contacto",
        contacted_at: new Date().toISOString(),
        summary: `Mensaje por ${channel === "whatsapp" ? "WhatsApp" : "email"}${tpl ? ` (plantilla: ${tpl.name})` : ""}`,
        next_follow_up: addDaysISO(3),
      });
      if (err)
        return setError(
          "Se abrió el mensaje, pero no se pudo registrar el contacto.",
        );
      const patch: Partial<Prospect> = {};
      if (
        ["nuevo", "pendiente_contactar", "contactado"].includes(prospect.status)
      )
        patch.status = "esperando_respuesta";
      if (!prospect.owner_id) patch.owner_id = me.id; // quien escribe queda como responsable
      if (Object.keys(patch).length > 0) {
        await supabase.from("i365_prospects").update(patch).eq("id", prospect.id);
      }
      await reload();
    }
    onClose();
  }

  return (
    <Modal title={`Mensaje para ${prospect.company_name}`} onClose={onClose}>
      <div className="space-y-4">
        <WorkingNotice prospect={prospect} />
        <div
          className="inline-flex rounded-lg border border-line p-0.5 text-sm"
          role="group"
          aria-label="Canal"
        >
          {(
            [
              ["whatsapp", "WhatsApp", !!wa],
              ["email", "Email", !!mail],
            ] as const
          ).map(([v, l, ok]) => (
            <button
              key={v}
              type="button"
              disabled={!ok}
              aria-pressed={channel === v}
              onClick={() => setChannel(v)}
              className={`rounded-md px-3 py-1.5 disabled:opacity-40 ${
                channel === v
                  ? "bg-accent font-medium text-accent-ink"
                  : "text-muted hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {templates === null ? (
          <p className="text-sm text-muted">Cargando plantillas…</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted">
            No hay plantillas de {channel === "whatsapp" ? "WhatsApp" : "email"}
            . Creá una en la sección Plantillas.
          </p>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="m-tpl">
                Plantilla
              </label>
              <select
                id="m-tpl"
                className="input"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            {channel === "email" && (
              <div>
                <label className="label" htmlFor="m-sub">
                  Asunto
                </label>
                <input
                  id="m-sub"
                  className="input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor="m-body">
                Mensaje (podés editarlo antes de enviar)
              </label>
              <textarea
                id="m-body"
                rows={7}
                className="input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={register}
                onChange={(e) => setRegister(e.target.checked)}
              />
              <span>
                Registrar el contacto en el historial
                <span className="block text-xs text-muted">
                  Si está en Nuevo/Pendiente/Contactado pasa a «Esperando
                  respuesta» y se agenda seguimiento en 3 días.
                </span>
              </span>
            </label>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!body.trim()}
            onClick={() => void send()}
          >
            {channel === "whatsapp" ? "Abrir WhatsApp" : "Abrir Gmail"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
