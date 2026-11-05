-- Impulso 365 CRM · esquema completo (ya aplicado en Supabase vía migraciones).
-- Sirve para recrear la base en otro proyecto: pegar en SQL Editor y ejecutar.

create table public.i365_team (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  full_name text not null check (char_length(trim(full_name)) > 0),
  role text not null default 'member' check (role in ('admin','member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.i365_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null check (char_length(trim(company_name)) between 1 and 200),
  contact_name text check (char_length(contact_name) <= 200),
  country text check (char_length(country) <= 100),
  city text check (char_length(city) <= 100),
  industry text check (char_length(industry) <= 100),
  website text check (char_length(website) <= 300),
  phone text check (char_length(phone) <= 50),
  whatsapp text check (char_length(whatsapp) <= 50),
  instagram text check (char_length(instagram) <= 150),
  email text check (char_length(email) <= 200),
  owner_id uuid references public.i365_team(id) on delete set null,
  joined_at date not null default current_date,
  status text not null default 'nuevo' check (status in (
    'nuevo','pendiente_contactar','contactado','esperando_respuesta','interesado',
    'reunion_agendada','negociacion','cliente_cerrado','no_interesado')),
  notes text check (char_length(notes) <= 5000),
  last_contact_at timestamptz,
  last_response text check (char_length(last_response) <= 3000),
  next_follow_up date,
  created_by uuid references public.i365_team(id) on delete set null,
  updated_by uuid references public.i365_team(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index i365_prospects_status_idx on public.i365_prospects(status);
create index i365_prospects_owner_idx on public.i365_prospects(owner_id);
create index i365_prospects_follow_idx on public.i365_prospects(next_follow_up);
create index i365_prospects_company_idx on public.i365_prospects(lower(company_name));

create table public.i365_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.i365_prospects(id) on delete cascade,
  author_id uuid references public.i365_team(id) on delete set null,
  kind text not null check (kind in ('contacto','respuesta','reunion','nota','estado')),
  contacted_at timestamptz not null default now(),
  summary text not null default '' check (char_length(summary) <= 3000),
  response text check (char_length(response) <= 3000),
  next_follow_up date,
  created_at timestamptz not null default now()
);
create index i365_activities_prospect_idx on public.i365_activities(prospect_id, contacted_at desc);

-- Identidad: el integrante se reconoce por el email del JWT contra la lista i365_team.
create function public.i365_me() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.i365_team
  where active and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;
create function public.i365_is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.i365_me() is not null
$$;
create function public.i365_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.i365_team
    where active and role = 'admin' and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

-- Triggers: auditoría (quién creó/modificó) e historial automático.
create function public.i365_prospects_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := public.i365_me();
  if tg_op = 'INSERT' then
    new.created_by := public.i365_me();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger i365_prospects_before before insert or update on public.i365_prospects
  for each row execute function public.i365_prospects_before();

create function public.i365_prospects_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.i365_activities(prospect_id, author_id, kind, summary)
    values (new.id, public.i365_me(), 'estado', 'Prospecto agregado (' || new.status || ')');
  elsif new.status is distinct from old.status then
    insert into public.i365_activities(prospect_id, author_id, kind, summary)
    values (new.id, public.i365_me(), 'estado', 'Estado: ' || old.status || ' → ' || new.status);
  end if;
  return null;
end $$;
create trigger i365_prospects_log after insert or update on public.i365_prospects
  for each row execute function public.i365_prospects_log();

create function public.i365_activities_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('contacto','respuesta','reunion') then
    update public.i365_prospects
       set last_contact_at = greatest(coalesce(last_contact_at, new.contacted_at), new.contacted_at),
           last_response = case when nullif(trim(coalesce(new.response,'')),'') is not null
                                then new.response else last_response end,
           next_follow_up = new.next_follow_up
     where id = new.prospect_id;
  end if;
  return null;
end $$;
create trigger i365_activities_after after insert on public.i365_activities
  for each row execute function public.i365_activities_after();

-- Row Level Security
alter table public.i365_team enable row level security;
alter table public.i365_prospects enable row level security;
alter table public.i365_activities enable row level security;

create policy i365_team_select on public.i365_team for select to authenticated
  using ((select public.i365_is_member()));
create policy i365_prospects_select on public.i365_prospects for select to authenticated
  using ((select public.i365_is_member()));
create policy i365_prospects_insert on public.i365_prospects for insert to authenticated
  with check ((select public.i365_is_member()));
create policy i365_prospects_update on public.i365_prospects for update to authenticated
  using ((select public.i365_is_member())) with check ((select public.i365_is_member()));
create policy i365_prospects_delete on public.i365_prospects for delete to authenticated
  using ((select public.i365_is_admin()));
create policy i365_activities_select on public.i365_activities for select to authenticated
  using ((select public.i365_is_member()));
create policy i365_activities_insert on public.i365_activities for insert to authenticated
  with check ((select public.i365_is_member()) and author_id = (select public.i365_me()));

revoke all on public.i365_team, public.i365_prospects, public.i365_activities from anon, public;
revoke insert, update, delete, truncate on public.i365_team from authenticated;
revoke truncate on public.i365_prospects, public.i365_activities from authenticated;
revoke update, delete on public.i365_activities from authenticated;
grant select on public.i365_team to authenticated;

revoke execute on function public.i365_me(), public.i365_is_member(), public.i365_is_admin() from public, anon;
grant execute on function public.i365_me(), public.i365_is_member(), public.i365_is_admin() to authenticated;
revoke execute on function public.i365_prospects_before(), public.i365_prospects_log(), public.i365_activities_after() from public, anon, authenticated;

alter publication supabase_realtime add table public.i365_prospects, public.i365_activities;

-- ===== Prioridad / score =====
alter table public.i365_prospects
  add column priority text check (priority in ('A','B','C')),
  add column score smallint check (score between 0 and 100);
create index i365_prospects_priority_idx on public.i365_prospects(priority, score desc);

-- ===== Plantillas de mensaje (compartidas por el equipo) =====
create table public.i365_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  channel text not null check (channel in ('whatsapp','email')),
  subject text check (char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 3000),
  created_by uuid default public.i365_me() references public.i365_team(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.i365_templates enable row level security;
create policy i365_templates_select on public.i365_templates for select to authenticated using ((select public.i365_is_member()));
create policy i365_templates_insert on public.i365_templates for insert to authenticated with check ((select public.i365_is_member()));
create policy i365_templates_update on public.i365_templates for update to authenticated using ((select public.i365_is_member())) with check ((select public.i365_is_member()));
create policy i365_templates_delete on public.i365_templates for delete to authenticated using ((select public.i365_is_member()));
revoke all on public.i365_templates from anon, public;
revoke truncate on public.i365_templates from authenticated;
alter publication supabase_realtime add table public.i365_templates;

-- ===== Quién hizo el último contacto =====
alter table public.i365_prospects
  add column last_contact_by uuid references public.i365_team(id) on delete set null;
-- (i365_activities_after también guarda last_contact_by; ver migración i365_last_contact_by)

-- ===== 2FA: si el usuario tiene un factor verificado, solo accede con sesión aal2 =====
create or replace function public.i365_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified')
$$;
revoke execute on function public.i365_mfa_ok() from public, anon;
grant execute on function public.i365_mfa_ok() to authenticated;
-- i365_me() e i365_is_admin() ahora también exigen public.i365_mfa_ok() (ver migración i365_enforce_mfa_if_enrolled).

-- ===== Copias diarias dentro de la base (ver migración i365_daily_snapshots) =====
-- tabla i365_snapshots (RLS sin políticas), función i365_take_snapshot() y cron 'i365-daily-snapshot' 0 6 * * *
