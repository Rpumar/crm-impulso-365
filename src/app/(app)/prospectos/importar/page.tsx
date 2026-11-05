"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCrm } from "@/lib/data";
import { decodeCsvBytes, parseCsv } from "@/lib/csv-parse";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  IMPORT_FIELDS, MAX_BYTES, MAX_ROWS, TEMPLATE_HEADERS, autoMap, cleanRow, dedupeKeys,
  type CleanRow, type FieldKey, type Mapping,
} from "@/lib/import";
import { STATUSES, type Status } from "@/lib/types";

type Parsed = { fileName: string; headers: string[]; rows: string[][] };
type RowState =
  | { kind: "ok"; line: number; data: CleanRow; warnings: string[] }
  | { kind: "dup"; line: number; data: CleanRow; warnings: string[]; of: string }
  | { kind: "invalid"; line: number; reason: string };

const BATCH = 100;

export default function ImportPage() {
  const { prospects, team, me, supabase, reload } = useCrm();

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [owner, setOwner] = useState<string>("");
  const [status, setStatus] = useState<Status>("nuevo");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [includeDup, setIncludeDup] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setFileError(null);
    setResult(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setFileError("El archivo pesa más de 2 MB. Dividilo en partes.");
    if (/\.xlsx?$/i.test(file.name)) {
      return setFileError("Eso es un Excel. Guardalo como CSV (Archivo → Guardar como → CSV UTF-8) y subilo de nuevo.");
    }
    const rows = parseCsv(decodeCsvBytes(await file.arrayBuffer()));
    if (rows.length < 2) return setFileError("No encontré filas. El archivo tiene que tener encabezados y al menos un prospecto.");
    if (rows.length - 1 > MAX_ROWS) return setFileError(`Máximo ${MAX_ROWS} filas por carga. Este archivo tiene ${rows.length - 1}.`);
    const headers = rows[0].map((h) => h.trim());
    setParsed({ fileName: file.name, headers, rows: rows.slice(1) });
    setMap(autoMap(headers));
  }

  // Análisis: limpieza de cada fila y detección de duplicados (contra el CRM y dentro del archivo).
  const analysis = useMemo<RowState[]>(() => {
    if (!parsed || !map || map.company_name < 0) return [];
    const seen = new Map<string, string>();
    for (const p of prospects) for (const k of dedupeKeys(p)) if (!seen.has(k)) seen.set(k, p.company_name);

    return parsed.rows.map((raw, i): RowState => {
      const line = i + 2; // fila en el archivo (1 = encabezados)
      const { data, warnings } = cleanRow(raw, map, { country, industry });
      if (!data.company_name) return { kind: "invalid", line, reason: "Sin nombre de empresa" };
      const keys = dedupeKeys(data);
      const hit = keys.map((k) => seen.get(k)).find(Boolean);
      for (const k of keys) if (!seen.has(k)) seen.set(k, `${data.company_name} (fila ${line} del archivo)`);
      return hit ? { kind: "dup", line, data, warnings, of: hit } : { kind: "ok", line, data, warnings };
    });
  }, [parsed, map, prospects, country, industry]);

  const counts = useMemo(() => {
    const c = { ok: 0, dup: 0, invalid: 0 };
    for (const r of analysis) c[r.kind]++;
    return c;
  }, [analysis]);

  const toImport = analysis.filter((r) => r.kind === "ok" || (includeDup && r.kind === "dup")) as Extract<RowState, { data: CleanRow }>[];

  async function runImport() {
    if (toImport.length === 0) return;
    setBusy(true);
    setProgress(0);
    setResult(null);
    const payloads = toImport.map((r) => ({ line: r.line, row: { ...r.data, owner_id: owner || null, status } }));
    let ok = 0;
    const failed: string[] = [];

    for (let i = 0; i < payloads.length; i += BATCH) {
      const chunk = payloads.slice(i, i + BATCH);
      const { error } = await supabase.from("i365_prospects").insert(chunk.map((c) => c.row));
      if (!error) {
        ok += chunk.length;
      } else {
        // Un lote falló: se reintenta fila por fila para aislar cuál tiene el problema.
        for (const c of chunk) {
          const { error: e1 } = await supabase.from("i365_prospects").insert(c.row);
          if (e1) failed.push(`Fila ${c.line} (${c.row.company_name.slice(0, 40)})`);
          else ok++;
        }
      }
      setProgress(Math.min(i + BATCH, payloads.length));
    }
    await reload();
    setResult({ ok, failed });
    setBusy(false);
    if (ok > 0) setParsed(null);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/prospectos" className="text-sm text-muted hover:text-white">← Prospectos</Link>
      <div>
        <h1 className="text-2xl font-semibold">Importar prospectos desde CSV</h1>
        <p className="text-sm text-muted">
          Subí una lista, revisá cómo se entendió y confirmá. Los duplicados se detectan solos.
        </p>
      </div>

      {result && (
        <div role="status" className={`card p-4 text-sm ${result.failed.length ? "border-warn/40" : "border-accent/40"}`}>
          <p className="font-medium">
            {result.ok > 0 ? `✓ Se importaron ${result.ok} prospectos.` : "No se importó ningún prospecto."}
            {result.failed.length > 0 && ` ${result.failed.length} no se pudieron cargar:`}
          </p>
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted">
              {result.failed.slice(0, 20).map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          <Link href="/prospectos" className="mt-2 inline-block text-accent">Ver prospectos →</Link>
        </div>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">1. Elegí el archivo</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => void onFile(e)}
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-4 file:py-2 file:text-white hover:file:brightness-125" />
          <button type="button" className="text-sm text-accent underline"
            onClick={() => downloadCsv("plantilla-prospectos.csv", toCsv(TEMPLATE_HEADERS, []))}>
            Descargar plantilla vacía
          </button>
        </div>
        <p className="text-xs text-muted">
          Formato CSV (en Excel: Guardar como → CSV UTF-8). Hasta {MAX_ROWS} filas. La primera fila son los encabezados.
          Solo la Empresa es obligatoria.
        </p>
        {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
      </section>

      {parsed && map && (
        <>
          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">2. Revisá las columnas</h2>
            <p className="text-sm text-muted">
              {parsed.fileName} · {parsed.rows.length} filas. Si alguna columna quedó mal asignada, corregila.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="label" htmlFor={`m-${f.key}`}>
                    {f.label}{"required" in f && f.required ? " *" : ""}
                  </label>
                  <select id={`m-${f.key}`} className="input" value={map[f.key as FieldKey]}
                    onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>— No importar —</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `(columna ${i + 1})`}</option>)}
                  </select>
                  {map[f.key as FieldKey] >= 0 && (
                    <p className="mt-0.5 truncate text-xs text-muted">Ej.: {parsed.rows[0]?.[map[f.key as FieldKey]] || "—"}</p>
                  )}
                </div>
              ))}
            </div>
            {map.company_name < 0 && (
              <p role="alert" className="text-sm text-danger">Elegí qué columna es la Empresa para continuar.</p>
            )}
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">3. Opciones para todos los importados</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor="o-owner">Responsable</label>
                <select id="o-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.id === me?.id ? " (yo)" : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="o-status">Estado inicial</label>
                <select id="o-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="o-country">País si falta</label>
                <input id="o-country" className="input" maxLength={100} value={country} onChange={(e) => setCountry(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="o-ind">Rubro si falta</label>
                <input id="o-ind" className="input" maxLength={100} value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </div>
            </div>
          </section>

          {map.company_name >= 0 && (
            <section className="card space-y-3 p-5">
              <h2 className="font-semibold">4. Resultado del análisis</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-accent/15 px-3 py-1 text-accent">{counts.ok} nuevos</span>
                <span className="rounded-full bg-warn/15 px-3 py-1 text-warn">{counts.dup} duplicados</span>
                <span className="rounded-full bg-danger/15 px-3 py-1 text-danger">{counts.invalid} sin empresa</span>
              </div>
              {counts.dup > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={includeDup} onChange={(e) => setIncludeDup(e.target.checked)} />
                  <span>Importar también los duplicados <span className="text-muted">(no recomendado: evita que dos personas contacten a la misma empresa)</span></span>
                </label>
              )}

              <div className="max-h-96 overflow-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-muted">
                    <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">País</th><th className="px-3 py-2">Contacto</th><th className="px-3 py-2">Estado</th></tr>
                  </thead>
                  <tbody>
                    {analysis.slice(0, 100).map((r) => (
                      <tr key={r.line} className="border-t border-line/60">
                        <td className="px-3 py-1.5 text-muted">{r.line}</td>
                        <td className="px-3 py-1.5">{r.kind === "invalid" ? "—" : r.data.company_name}</td>
                        <td className="px-3 py-1.5">{r.kind === "invalid" ? "" : (r.data.country ?? "")}</td>
                        <td className="px-3 py-1.5">{r.kind === "invalid" ? "" : [r.data.phone, r.data.email].filter(Boolean).join(" · ")}</td>
                        <td className="px-3 py-1.5">
                          {r.kind === "ok" && <span className="text-accent">Nuevo{r.warnings.length > 0 && ` · ${r.warnings.join(", ")}`}</span>}
                          {r.kind === "dup" && <span className="text-warn">Ya existe: {r.of}</span>}
                          {r.kind === "invalid" && <span className="text-danger">{r.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analysis.length > 100 && <p className="text-xs text-muted">Se muestran las primeras 100 filas de {analysis.length}.</p>}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
                {busy && <span className="text-sm text-muted">Importando {progress} de {toImport.length}…</span>}
                <button className="btn-primary" disabled={busy || toImport.length === 0} onClick={() => void runImport()}>
                  Importar {toImport.length} prospectos
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
