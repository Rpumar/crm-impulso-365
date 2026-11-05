# CRM Impulso 365

CRM interno: Next.js (App Router) + TypeScript + Tailwind v4 + Supabase (Auth, Postgres, Realtime, RLS).

## Comandos

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Variables (`.env.local`, ver `.env.example`): `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(clave *publishable*; es pública por diseño, la seguridad la da RLS). **Nunca** uses la `service_role` en este proyecto.

## Base de datos

Tablas `i365_team`, `i365_prospects`, `i365_activities` (esquema completo en `supabase/schema.sql`).
Ya están aplicadas en el proyecto Supabase configurado.

## Alta de integrantes (2 pasos, en este orden)

1. **Crear la cuenta**: Supabase → Authentication → Users → *Add user* → *Create new user*
   (email + contraseña, marcar *Auto Confirm User*).
2. **Darla de alta en el equipo** (SQL Editor). El email va en minúsculas:

```sql
insert into public.i365_team (email, full_name, role) values
  ('ezequiel@ejemplo.com', 'Ezequiel', 'admin'),
  ('persona2@ejemplo.com', 'Nombre Apellido', 'member');
```

Solo los emails que estén en `i365_team` ven datos; cualquier otra cuenta de Supabase Auth queda sin acceso.
`admin` puede además eliminar prospectos. Para dar de baja: `update public.i365_team set active=false where email='...';`

## Publicar en Vercel

1. Subir la carpeta a un repositorio de GitHub (el `.env.local` no se sube: está en `.gitignore`).
2. vercel.com → *Add New Project* → importar el repo (Framework: Next.js, sin cambios).
3. En *Environment Variables* cargar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. *Deploy*. La URL resultante es el enlace único para todo el equipo.
5. Supabase → Authentication → URL Configuration: poner esa URL como *Site URL*.

## Recordatorio diario por email

Cada día hábil a las 09:00 (hora de Uruguay) cada integrante recibe un email con sus seguimientos
atrasados, de hoy y las reuniones de los próximos 7 días. Solo se envía si hay algo pendiente.

Piezas: `pg_cron` (programación) → `pg_net` → Edge Function `i365-daily-digest`
(`supabase/functions/i365-daily-digest/index.ts`) → Resend. El secreto que protege la función vive en
Supabase Vault (`i365_cron_secret`) y nunca sale de la base.

Configuración sin dominio (Gmail, gratis) — una sola vez:
1. Usar una cuenta Gmail del equipo (mejor una dedicada, no personal).
2. Activar la verificación en 2 pasos: https://myaccount.google.com/security
3. Crear una «contraseña de aplicación»: https://myaccount.google.com/apppasswords (nombre: «CRM Impulso 365»). Google muestra 16 letras una sola vez.
4. Supabase → Edge Functions → Secrets, cargar `GMAIL_USER` (el email completo) y `GMAIL_APP_PASSWORD` (las 16 letras, sin espacios).
Los mails salen desde esa cuenta Gmail. Límite ~500 mails/día (sobra para 5 personas).

Alternativa con dominio propio (Resend), si más adelante lo tienen:
1. Cuenta en https://resend.com → Domains → agregar y verificar el dominio de Impulso 365 (registros DNS).
2. Resend → API Keys → crear una clave.
3. Supabase → Edge Functions → Secrets, cargar:
   - `RESEND_API_KEY` = la clave
   - `MAIL_FROM` = `Impulso 365 <avisos@tudominio.com>` (debe ser del dominio verificado)
   - `APP_URL` (opcional) = URL del CRM
4. Probar sin enviar (SQL Editor): `select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/i365-daily-digest', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='i365_cron_secret')), body := '{"dry":true}'::jsonb);` y leer `net._http_response`.

Cambiar horario: `select cron.alter_job((select jobid from cron.job where jobname='i365-daily-digest'), schedule := '0 12 * * 1-5');` (UTC).
Pausar: `select cron.unschedule('i365-daily-digest');`

## Respaldo y recuperación

El proyecto de Supabase está en plan **Free**: no tiene backups automáticos y se pausa tras ~1 semana sin actividad.
Para cubrir eso:

1. **Copia diaria dentro de la base** (03:00 Uruguay, 14 días): tabla `i365_snapshots`, función `i365_take_snapshot()`,
   cron `i365-daily-snapshot`. Protege de borrados o ediciones por error (no de perder el proyecto).
2. **Export CSV desde la app**: Prospectos → «Exportar CSV» (lo que se ve filtrado) y Mi cuenta → «Respaldo de datos»
   (solo admins: prospectos completos e historial). Guardar una copia en Drive cada semana.

Restaurar prospectos borrados/editados desde la última copia (SQL Editor; no pisa lo que existe):
```sql
insert into public.i365_prospects
select * from jsonb_populate_recordset(null::public.i365_prospects,
  (select prospects from public.i365_snapshots order by taken_at desc limit 1))
on conflict (id) do nothing;
```
Ver copias disponibles: `select id, taken_at, jsonb_array_length(prospects) from public.i365_snapshots order by id desc;`
(Para volver a un día anterior, cambiar `order by taken_at desc limit 1` por `where id = <id>`.)
