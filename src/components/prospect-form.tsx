"use client";

import { useState } from "react";
import { useCrm } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import {
  INDUSTRY_SUGGESTIONS,
  PRIORITIES,
  STATUSES,
  type Priority,
  type Prospect,
  type Status,
} from "@/lib/types";

type FormState = {
  company_name: string;
  contact_name: string;
  country: string;
  city: string;
  industry: string;
  website: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  email: string;
  owner_id: string;
  joined_at: string;
  status: Status;
  priority: Priority | "";
  score: string;
  next_follow_up: string;
  notes: string;
};

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
const norm = (v: string | null) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const host = (v: string | null) =>
  (v ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

export function ProspectForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Prospect;
  onSaved: (id: string) => void;
  onCancel?: () => void;
}) {
  const { supabase, team, me, prospects, reload, memberName } = useCrm();
  const [f, setF] = useState<FormState>({
    company_name: initial?.company_name ?? "",
    contact_name: initial?.contact_name ?? "",
    country: initial?.country ?? "",
    city: initial?.city ?? "",
    industry: initial?.industry ?? "",
    website: initial?.website ?? "",
    phone: initial?.phone ?? "",
    whatsapp: initial?.whatsapp ?? "",
    instagram: initial?.instagram ?? "",
    email: initial?.email ?? "",
    owner_id: initial ? (initial.owner_id ?? "") : (me?.id ?? ""),
    joined_at: initial?.joined_at ?? todayISO(),
    status: initial?.status ?? "nuevo",
    priority: initial?.priority ?? "",
    score: initial?.score != null ? String(initial.score) : "",
    next_follow_up: initial?.next_follow_up ?? "",
    notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupOk, setDupOk] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }));

  // Aviso anti-duplicados: misma empresa o mismo sitio web que otro prospecto.
  const duplicate = initial
    ? undefined
    : prospects.find(
        (p) =>
          (norm(f.company_name).length > 0 &&
            norm(p.company_name) === norm(f.company_name)) ||
          (host(f.website).length > 3 && host(p.website) === host(f.website)),
      );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.company_name.trim())
      return setError("El nombre de la empresa es obligatorio.");
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim()))
      return setError("El correo no parece válido.");
    if (f.score.trim() !== "" && !(Number(f.score) >= 0 && Number(f.score) <= 100))
      return setError("El score tiene que estar entre 0 y 100.");
    if (duplicate && !dupOk) return setDupOk(true);

    setBusy(true);
    const payload = {
      company_name: f.company_name.trim(),
      contact_name: orNull(f.contact_name),
      country: orNull(f.country),
      city: orNull(f.city),
      industry: orNull(f.industry),
      website: orNull(f.website),
      phone: orNull(f.phone),
      whatsapp: orNull(f.whatsapp),
      instagram: orNull(f.instagram),
      email: orNull(f.email),
      owner_id: f.owner_id || null,
      joined_at: f.joined_at || todayISO(),
      status: f.status,
      priority: f.priority || null,
      score: f.score.trim() === "" ? null : Math.round(Number(f.score)),
      next_follow_up: f.next_follow_up || null,
      notes: orNull(f.notes),
    };
    const q = initial
      ? supabase
          .from("i365_prospects")
          .update(payload)
          .eq("id", initial.id)
          .select("id")
          .single()
      : supabase.from("i365_prospects").insert(payload).select("id").single();
    const { data, error: err } = await q;
    setBusy(false);
    if (err || !data)
      return setError(
        "No se pudo guardar. Revisá los datos e intentá de nuevo.",
      );
    await reload();
    onSaved(data.id);
  }

  const text = (
    k: keyof FormState,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div>
      <label className="label" htmlFor={`f-${k}`}>
        {label}
      </label>
      <input
        id={`f-${k}`}
        className="input"
        value={f[k]}
        onChange={(e) => set(k, e.target.value as never)}
        {...props}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {text("company_name", "Empresa *", {
            required: true,
            maxLength: 200,
            autoFocus: !initial,
          })}
        </div>
        {text("contact_name", "Nombre del contacto", { maxLength: 200 })}
        <div>
          <label className="label" htmlFor="f-industry">
            Rubro
          </label>
          <input
            id="f-industry"
            list="industries"
            className="input"
            value={f.industry}
            maxLength={100}
            onChange={(e) => set("industry", e.target.value)}
            placeholder="Inmobiliaria, clínica…"
          />
          <datalist id="industries">
            {INDUSTRY_SUGGESTIONS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </div>
        {text("country", "País", { maxLength: 100 })}
        {text("city", "Ciudad", { maxLength: 100 })}
        {text("website", "Sitio web", {
          maxLength: 300,
          placeholder: "ejemplo.com",
        })}
        {text("phone", "Teléfono", {
          maxLength: 50,
          inputMode: "tel",
          placeholder: "+52 55 1234 5678",
        })}
        {text("whatsapp", "WhatsApp", {
          maxLength: 50,
          inputMode: "tel",
          placeholder: "+54 9 11…",
        })}
        {text("instagram", "Instagram", {
          maxLength: 150,
          placeholder: "@usuario",
        })}
        {text("email", "Correo electrónico", { type: "email", maxLength: 200 })}
        <div>
          <label className="label" htmlFor="f-owner">
            Responsable
          </label>
          <select
            id="f-owner"
            className="input"
            value={f.owner_id}
            onChange={(e) => set("owner_id", e.target.value)}
          >
            <option value="">Sin asignar</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-status">
            Estado
          </label>
          <select
            id="f-status"
            className="input"
            value={f.status}
            onChange={(e) => set("status", e.target.value as Status)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-priority">
            Prioridad
          </label>
          <select
            id="f-priority"
            className="input"
            value={f.priority}
            onChange={(e) => set("priority", e.target.value as Priority | "")}
          >
            <option value="">Sin prioridad</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {text("score", "Score (0–100)", {
          type: "number",
          min: 0,
          max: 100,
          inputMode: "numeric",
        })}
        {text("joined_at", "Fecha de incorporación", { type: "date" })}
        {text("next_follow_up", "Próximo seguimiento", { type: "date" })}
        <div className="sm:col-span-2">
          <label className="label" htmlFor="f-notes">
            Notas y observaciones
          </label>
          <textarea
            id="f-notes"
            rows={3}
            maxLength={5000}
            className="input"
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      {duplicate && (
        <div
          role="alert"
          className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn"
        >
          Ojo: ya existe <b>{duplicate.company_name}</b> (responsable:{" "}
          {memberName(duplicate.owner_id)}). Verificá que nadie la esté
          contactando.
          {dupOk && " Tocá «Guardar» otra vez para crearla igual."}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="btn-primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
