create table if not exists public.nxgeo_allowed_emails (
  email text primary key,
  active boolean not null default true,
  label text,
  created_at timestamptz not null default now(),
  constraint nxgeo_allowed_emails_email_normalized_check
    check (email = lower(btrim(email)) and email <> '')
);

alter table public.nxgeo_allowed_emails enable row level security;

revoke all on table public.nxgeo_allowed_emails from public, anon, authenticated;

grant usage on schema public to supabase_auth_admin;
grant select on table public.nxgeo_allowed_emails to supabase_auth_admin;

drop policy if exists nxgeo_auth_hook_read_active
  on public.nxgeo_allowed_emails;

create policy nxgeo_auth_hook_read_active
  on public.nxgeo_allowed_emails
  for select
  to supabase_auth_admin
  using (active);

create or replace function public.nxgeo_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  candidate_email text :=
    lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if candidate_email <> ''
     and exists (
       select 1
       from public.nxgeo_allowed_emails as allowed
       where allowed.active
         and allowed.email = candidate_email
     )
  then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Este e-mail nao esta autorizado.'
    )
  );
end;
$$;

create or replace function public.nxgeo_current_user_is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.nxgeo_allowed_emails
      where active
        and lower(btrim(email)) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    );
$$;

revoke all on function public.nxgeo_before_user_created(jsonb) from public, anon, authenticated;
revoke all on function public.nxgeo_current_user_is_allowed() from public, anon, authenticated;

grant execute on function public.nxgeo_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.nxgeo_current_user_is_allowed() to authenticated;
