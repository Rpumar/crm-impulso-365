// Resumen diario de seguimientos por email (Impulso 365 CRM).
// Lo invoca pg_cron (lunes a viernes 09:00 Uruguay) con el header x-cron-secret.
// Proveedor de correo (Supabase → Edge Functions → Secrets), uno de los dos:
//   A) Gmail (gratis, sin dominio):  GMAIL_USER  y  GMAIL_APP_PASSWORD (contraseña de aplicación)
//   B) Resend (requiere dominio):    RESEND_API_KEY  y  MAIL_FROM
//   APP_URL (opcional)  URL del CRM
// Modos de prueba (siempre requieren el secreto del cron):
//   {"probe":true}            verifica la conexión SMTP, no envía
//   {"dry":true}              calcula el resumen, no envía
//   {"test_to":"mail@..."}    envía un mensaje de prueba a un integrante activo del equipo
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const TZ = "America/Montevideo";
const MAX_ITEMS = 30;
const CLOSED = ["cliente_cerrado", "no_interesado"];

type Row = {
  id: string;
  company_name: string;
  owner_id: string | null;
  status: string;
  next_follow_up: string | null;
  last_response: string | null;
  priority: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function dayISO(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function gmailTransport(user: string, pass: string) {
  // 465 = TLS implícito (los puertos 25/587 están bloqueados en Edge Functions)
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
}

function section(title: string, color: string, rows: Row[], appUrl: string) {
  if (rows.length === 0) return { html: "", text: "" };
  const shown = rows.slice(0, MAX_ITEMS);
  const extra = rows.length - shown.length;
  const li = shown
    .map((r) => {
      const resp = r.last_response ? ` — <span style="color:#666">“${esc(r.last_response.slice(0, 80))}”</span>` : "";
      return `<li style="margin:4px 0"><a href="${esc(appUrl)}/prospectos/${esc(r.id)}" style="color:#0b7a4b;text-decoration:none"><b>${esc(r.company_name)}</b></a> <span style="color:#888">(${esc(r.next_follow_up ?? "")})</span>${resp}</li>`;
    })
    .join("");
  const html = `<h3 style="margin:20px 0 6px;color:${color}">${esc(title)} (${rows.length})</h3><ul style="padding-left:18px;margin:0">${li}</ul>${
    extra > 0 ? `<p style="color:#888;margin:4px 0">… y ${extra} más</p>` : ""
  }`;
  const text =
    `${title} (${rows.length})\n` +
    shown.map((r) => `- ${r.company_name} (${r.next_follow_up ?? ""})`).join("\n") +
    (extra > 0 ? `\n… y ${extra} más` : "") +
    "\n\n";
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok } = await supabase.rpc("i365_verify_cron_secret", { s: secret });
  if (ok !== true) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const dry = body?.dry === true;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("MAIL_FROM");
  const gmailUser = Deno.env.get("GMAIL_USER");
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
  const provider: "resend" | "gmail" | null =
    resendKey && resendFrom ? "resend" : gmailUser && gmailPass ? "gmail" : null;

  // Prueba de conectividad SMTP (no envía nada; con claves falsas debe fallar por autenticación, no por red).
  if (body?.probe === true) {
    try {
      await gmailTransport(gmailUser ?? "probe@example.com", gmailPass ?? "probe").verify();
      return json({ probe: "ok" });
    } catch (e) {
      const err = e as { code?: string; responseCode?: number };
      return json({ probe: "error", code: err.code ?? null, responseCode: err.responseCode ?? null });
    }
  }

  if (!dry && !provider) {
    return json({ error: "not_configured", need: "GMAIL_USER + GMAIL_APP_PASSWORD, o RESEND_API_KEY + MAIL_FROM" }, 503);
  }
  const appUrl = (Deno.env.get("APP_URL") ?? "https://crm-impulso-365.vercel.app").replace(/\/$/, "");

  const transport = provider === "gmail" ? gmailTransport(gmailUser!, gmailPass!) : null;
  const deliver = async (to: string, subject: string, html: string, text: string) => {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: resendFrom, to: [to], subject, html, text }),
      });
      if (!res.ok) throw Object.assign(new Error("resend"), { code: `resend_${res.status}` });
    } else {
      await transport!.sendMail({ from: `Impulso 365 <${gmailUser}>`, to, subject, html, text });
    }
  };

  // Mensaje de prueba a un integrante activo del equipo.
  if (typeof body?.test_to === "string") {
    const to = body.test_to.trim().toLowerCase();
    const { data: m } = await supabase
      .from("i365_team")
      .select("full_name,email")
      .eq("active", true)
      .eq("email", to)
      .maybeSingle();
    if (!m) return json({ error: "not_a_team_member" }, 400);
    const first = m.full_name.split(" ")[0];
    try {
      await deliver(
        m.email,
        "Impulso 365 · prueba del recordatorio diario",
        `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111"><h2>Hola ${esc(first)} 👋</h2><p>Este es un mensaje de <b>prueba</b>. Si lo estás leyendo, el recordatorio diario de seguimientos de Impulso 365 funciona.</p><p>Cada día hábil a las 09:00 vas a recibir tus seguimientos atrasados, de hoy y tus reuniones de la semana.</p><p><a href="${esc(appUrl)}/llamadas" style="background:#1be38b;color:#04130c;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir el CRM</a></p></div>`,
        `Hola ${first},\n\nEste es un mensaje de prueba. Si lo estás leyendo, el recordatorio diario de Impulso 365 funciona.\n\n${appUrl}/llamadas\n`,
      );
      return json({ test: "sent", provider });
    } catch (e) {
      return json({ test: "failed", code: (e as { code?: string }).code ?? "unknown" }, 502);
    }
  }

  const today = dayISO(new Date());
  const in7 = dayISO(new Date(Date.now() + 7 * 86_400_000));

  const [team, prospects] = await Promise.all([
    supabase.from("i365_team").select("id,email,full_name").eq("active", true),
    supabase
      .from("i365_prospects")
      .select("id,company_name,owner_id,status,next_follow_up,last_response,priority")
      .not("owner_id", "is", null)
      .not("next_follow_up", "is", null)
      .lte("next_follow_up", in7)
      .not("status", "in", `(${CLOSED.join(",")})`)
      .order("next_follow_up"),
  ]);
  if (team.error || prospects.error) return json({ error: "query_failed" }, 500);

  const results: { member: string; overdue: number; today: number; meetings: number; sent: boolean; error?: string }[] = [];

  for (const m of team.data ?? []) {
    const mine = (prospects.data as Row[]).filter((p) => p.owner_id === m.id);
    const overdue = mine.filter((p) => p.next_follow_up! < today);
    const todays = mine.filter((p) => p.next_follow_up === today);
    const meetings = mine.filter((p) => p.status === "reunion_agendada" && p.next_follow_up! > today);
    if (overdue.length + todays.length + meetings.length === 0) continue;

    const parts = [
      section("Atrasados", "#c0392b", overdue, appUrl),
      section("Para hoy", "#b7791f", todays, appUrl),
      section("Reuniones de los próximos 7 días", "#0b7a4b", meetings, appUrl),
    ];
    const first = m.full_name.split(" ")[0];
    const subject =
      overdue.length > 0
        ? `Impulso 365 · ${overdue.length} atrasado${overdue.length > 1 ? "s" : ""} y ${todays.length} para hoy`
        : `Impulso 365 · ${todays.length} seguimiento${todays.length === 1 ? "" : "s"} para hoy`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111"><h2 style="margin:0 0 4px">Hola ${esc(first)} 👋</h2><p style="margin:0;color:#555">Tus seguimientos de Impulso 365:</p>${parts
      .map((p) => p.html)
      .join("")}<p style="margin:24px 0 0"><a href="${esc(appUrl)}/llamadas" style="background:#1be38b;color:#04130c;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir modo llamadas</a></p></div>`;
    const text = `Hola ${first},\n\n${parts.map((p) => p.text).join("")}Abrí el CRM: ${appUrl}/llamadas\n`;

    const entry = { member: first, overdue: overdue.length, today: todays.length, meetings: meetings.length, sent: false } as (typeof results)[number];
    if (!dry) {
      try {
        await deliver(m.email, subject, html, text);
        entry.sent = true;
      } catch (e) {
        entry.error = `send_failed_${(e as { code?: string }).code ?? "unknown"}`;
      }
    }
    results.push(entry);
  }

  return json({ date: today, dry, provider, results });
});
