begin;

create schema if not exists private;
revoke all on schema private from public, anon;

create table if not exists public.nxgeo_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  full_name text,
  role text not null default 'user',
  active boolean not null default true,
  invited_by_member_id uuid references public.nxgeo_members(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nxgeo_members_email_normalized_check
    check (
      email = lower(btrim(email))
      and email <> ''
      and char_length(email) <= 320
    ),
  constraint nxgeo_members_full_name_check
    check (
      full_name is null
      or (
        full_name = btrim(full_name)
        and char_length(full_name) between 2 and 120
      )
    ),
  constraint nxgeo_members_role_check
    check (role in ('admin', 'user'))
);

create table if not exists public.nxgeo_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by_member_id uuid not null references public.nxgeo_members(id) on delete restrict,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nxgeo_folders_name_check
    check (
      name = btrim(name)
      and char_length(name) between 1 and 120
    ),
  constraint nxgeo_folders_description_check
    check (
      description is null
      or (
        description = btrim(description)
        and char_length(description) between 1 and 500
      )
    )
);

create unique index if not exists nxgeo_folders_active_name_uq
  on public.nxgeo_folders (lower(name))
  where deleted_at is null;

create table if not exists public.nxgeo_folder_access (
  folder_id uuid not null references public.nxgeo_folders(id) on delete cascade,
  member_id uuid not null references public.nxgeo_members(id) on delete cascade,
  granted_by_member_id uuid references public.nxgeo_members(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (folder_id, member_id)
);

create index if not exists nxgeo_folder_access_member_idx
  on public.nxgeo_folder_access (member_id, folder_id);

create table if not exists public.nxgeo_maps (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.nxgeo_folders(id) on delete restrict,
  name text not null,
  state jsonb not null default '{}'::jsonb,
  project_path text,
  thumbnail_path text,
  export_path text,
  revision integer not null default 1,
  export_revision integer,
  exported_at timestamptz,
  deleted_at timestamptz,
  created_by_member_id uuid not null references public.nxgeo_members(id) on delete restrict,
  updated_by_member_id uuid not null references public.nxgeo_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nxgeo_maps_name_check
    check (
      name = btrim(name)
      and char_length(name) between 1 and 160
    ),
  constraint nxgeo_maps_state_object_check
    check (jsonb_typeof(state) = 'object'),
  constraint nxgeo_maps_revision_check
    check (revision > 0),
  constraint nxgeo_maps_export_revision_check
    check (
      export_revision is null
      or (export_revision > 0 and export_revision <= revision)
    )
);

create unique index if not exists nxgeo_maps_active_name_uq
  on public.nxgeo_maps (folder_id, lower(name))
  where deleted_at is null;

create index if not exists nxgeo_maps_folder_updated_idx
  on public.nxgeo_maps (folder_id, updated_at desc);

create table if not exists public.nxgeo_audit_log (
  id bigint generated always as identity primary key,
  actor_member_id uuid references public.nxgeo_members(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint nxgeo_audit_log_details_object_check
    check (jsonb_typeof(details) = 'object')
);

create index if not exists nxgeo_audit_log_created_idx
  on public.nxgeo_audit_log (created_at desc);

insert into public.nxgeo_members as member (
  email,
  full_name,
  role,
  active,
  created_at,
  updated_at
)
select
  allowed.email,
  case
    when char_length(btrim(coalesce(allowed.label, ''))) between 2 and 120
      then btrim(allowed.label)
    else null
  end,
  'user',
  allowed.active,
  allowed.created_at,
  now()
from public.nxgeo_allowed_emails as allowed
where char_length(allowed.email) <= 320
  and allowed.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
on conflict (email) do update
set full_name = coalesce(member.full_name, excluded.full_name),
    active = excluded.active,
    updated_at = now();

insert into public.nxgeo_members as member (
  email,
  full_name,
  role,
  active
)
values (
  'marcelo.topografia@gmail.com',
  'Marcelo',
  'admin',
  true
)
on conflict (email) do update
set full_name = coalesce(nullif(member.full_name, ''), 'Marcelo'),
    role = 'admin',
    active = true,
    updated_at = now();

update public.nxgeo_members as member
set user_id = auth_user.id,
    joined_at = coalesce(member.joined_at, auth_user.created_at),
    updated_at = now()
from auth.users as auth_user
where member.user_id is null
  and auth_user.email is not null
  and lower(btrim(auth_user.email)) = member.email;

create or replace function private.nxgeo_current_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member.id
  from public.nxgeo_members as member
  where member.active
    and (
      member.user_id = auth.uid()
      or (
        member.user_id is null
        and member.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
      )
    )
  order by (member.user_id = auth.uid()) desc nulls last
  limit 1;
$$;

create or replace function private.nxgeo_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nxgeo_members as member
    where member.id = private.nxgeo_current_member_id()
      and member.active
      and member.role = 'admin'
  );
$$;

create or replace function private.nxgeo_can_access_folder(candidate_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.nxgeo_is_admin()
    or exists (
      select 1
      from public.nxgeo_folder_access as access
      join public.nxgeo_members as member
        on member.id = access.member_id
       and member.active
      join public.nxgeo_folders as folder
        on folder.id = access.folder_id
       and folder.deleted_at is null
      where access.folder_id = candidate_folder_id
        and access.member_id = private.nxgeo_current_member_id()
    );
$$;

create or replace function private.nxgeo_can_access_storage_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nxgeo_maps as map
    where map.id::text = split_part(object_name, '/', 1)
      and (map.deleted_at is null or private.nxgeo_is_admin())
      and private.nxgeo_can_access_folder(map.folder_id)
  );
$$;

create or replace function private.nxgeo_write_audit(
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid,
  audit_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.nxgeo_audit_log (
    actor_member_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    private.nxgeo_current_member_id(),
    audit_action,
    audit_entity_type,
    audit_entity_id,
    coalesce(audit_details, '{}'::jsonb)
  );
end;
$$;

create or replace function private.nxgeo_link_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.nxgeo_members
  set user_id = new.id,
      joined_at = coalesce(joined_at, now()),
      updated_at = now()
  where active
    and user_id is null
    and email = lower(btrim(coalesce(new.email, '')));

  return new;
end;
$$;

drop trigger if exists nxgeo_link_auth_user on auth.users;
create trigger nxgeo_link_auth_user
after insert on auth.users
for each row
execute function private.nxgeo_link_auth_user();

create or replace function private.nxgeo_stamp_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id uuid := private.nxgeo_current_member_id();
begin
  if current_member_id is null then
    raise exception using
      errcode = '42501',
      message = 'Acesso NXGEO inativo ou inexistente.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by_member_id := current_member_id;
    new.created_at := now();
  else
    new.created_by_member_id := old.created_by_member_id;
    new.created_at := old.created_at;
  end if;

  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nxgeo_stamp_folder on public.nxgeo_folders;
create trigger nxgeo_stamp_folder
before insert or update on public.nxgeo_folders
for each row
execute function private.nxgeo_stamp_folder();

create or replace function private.nxgeo_stamp_map()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_member_id uuid := private.nxgeo_current_member_id();
  content_changed boolean := false;
begin
  if current_member_id is null then
    raise exception using
      errcode = '42501',
      message = 'Acesso NXGEO inativo ou inexistente.';
  end if;

  new.name := btrim(new.name);

  if tg_op = 'INSERT' then
    new.created_by_member_id := current_member_id;
    new.updated_by_member_id := current_member_id;
    new.created_at := now();
    new.updated_at := now();
    new.revision := 1;

    if new.export_path is null then
      new.export_revision := null;
      new.exported_at := null;
    else
      new.export_revision := 1;
      new.exported_at := now();
    end if;
  else
    content_changed := row(
      new.folder_id,
      new.name,
      new.state,
      new.project_path,
      new.deleted_at
    ) is distinct from row(
      old.folder_id,
      old.name,
      old.state,
      old.project_path,
      old.deleted_at
    );

    new.created_by_member_id := old.created_by_member_id;
    new.created_at := old.created_at;
    new.updated_by_member_id := current_member_id;
    new.updated_at := now();
    new.revision := old.revision + case when content_changed then 1 else 0 end;

    if new.export_path is distinct from old.export_path then
      if new.export_path is null then
        new.export_revision := null;
        new.exported_at := null;
      else
        new.export_revision := new.revision;
        new.exported_at := now();
      end if;
    else
      new.export_revision := old.export_revision;
      new.exported_at := old.exported_at;
    end if;
  end if;

  if new.project_path is not null
     and new.project_path not like new.id::text || '/%'
  then
    raise exception using
      errcode = '22023',
      message = 'project_path deve iniciar com o ID do mapa.';
  end if;

  if new.thumbnail_path is not null
     and new.thumbnail_path not like new.id::text || '/%'
  then
    raise exception using
      errcode = '22023',
      message = 'thumbnail_path deve iniciar com o ID do mapa.';
  end if;

  if new.export_path is not null
     and new.export_path not like new.id::text || '/%'
  then
    raise exception using
      errcode = '22023',
      message = 'export_path deve iniciar com o ID do mapa.';
  end if;

  return new;
end;
$$;

drop trigger if exists nxgeo_stamp_map on public.nxgeo_maps;
create trigger nxgeo_stamp_map
before insert or update on public.nxgeo_maps
for each row
execute function private.nxgeo_stamp_map();

create or replace function private.nxgeo_audit_folder_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'folder.created';
  elsif new.deleted_at is distinct from old.deleted_at then
    audit_action := case
      when new.deleted_at is null then 'folder.restored'
      else 'folder.archived'
    end;
  else
    audit_action := 'folder.updated';
  end if;

  perform private.nxgeo_write_audit(
    audit_action,
    'folder',
    new.id,
    jsonb_build_object(
      'name', new.name,
      'has_description', new.description is not null
    )
  );
  return new;
end;
$$;

drop trigger if exists nxgeo_audit_folder_change on public.nxgeo_folders;
create trigger nxgeo_audit_folder_change
after insert or update on public.nxgeo_folders
for each row
execute function private.nxgeo_audit_folder_change();

create or replace function private.nxgeo_audit_map_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'map.created';
  elsif new.deleted_at is distinct from old.deleted_at then
    audit_action := case
      when new.deleted_at is null then 'map.restored'
      else 'map.archived'
    end;
  elsif new.export_path is distinct from old.export_path then
    audit_action := 'map.exported';
  else
    audit_action := 'map.saved';
  end if;

  perform private.nxgeo_write_audit(
    audit_action,
    'map',
    new.id,
    jsonb_build_object(
      'folder_id', new.folder_id,
      'name', new.name,
      'revision', new.revision,
      'export_revision', new.export_revision
    )
  );
  return new;
end;
$$;

drop trigger if exists nxgeo_audit_map_change on public.nxgeo_maps;
create trigger nxgeo_audit_map_change
after insert or update on public.nxgeo_maps
for each row
execute function private.nxgeo_audit_map_change();

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
       from public.nxgeo_members as member
       where member.active
         and member.email = candidate_email
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
    and private.nxgeo_current_member_id() is not null;
$$;

create or replace function public.nxgeo_current_member()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  member public.nxgeo_members%rowtype;
begin
  if current_user_id is null then
    return null;
  end if;

  select existing.*
  into member
  from public.nxgeo_members as existing
  where existing.active
    and existing.user_id = current_user_id
  limit 1;

  if not found and current_email <> '' then
    update public.nxgeo_members
    set user_id = current_user_id,
        joined_at = coalesce(joined_at, now()),
        last_seen_at = now(),
        updated_at = now()
    where active
      and user_id is null
      and email = current_email
    returning * into member;
  end if;

  if member.id is null or not member.active then
    return null;
  end if;

  update public.nxgeo_members
  set last_seen_at = now(),
      updated_at = now()
  where id = member.id
  returning * into member;

  return jsonb_build_object(
    'id', member.id,
    'email', member.email,
    'full_name', member.full_name,
    'role', member.role,
    'active', member.active,
    'joined_at', member.joined_at,
    'last_seen_at', member.last_seen_at
  );
end;
$$;

create or replace function public.nxgeo_admin_list_members()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  active boolean,
  folder_ids uuid[],
  invited_at timestamptz,
  joined_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Somente administradores podem consultar a equipe.';
  end if;

  return query
  select
    member.id,
    member.email,
    member.full_name,
    member.role,
    member.active,
    coalesce(
      array_agg(access.folder_id order by access.folder_id)
        filter (where access.folder_id is not null),
      array[]::uuid[]
    ),
    member.invited_at,
    member.joined_at,
    member.last_seen_at,
    member.created_at,
    member.updated_at
  from public.nxgeo_members as member
  left join public.nxgeo_folder_access as access
    on access.member_id = member.id
  group by member.id
  order by
    case when member.role = 'admin' then 0 else 1 end,
    coalesce(member.full_name, member.email),
    member.email;
end;
$$;

create or replace function public.nxgeo_admin_invite_member(
  p_email text,
  p_full_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.nxgeo_current_member_id();
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  normalized_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  existing_user_id uuid;
  member public.nxgeo_members%rowtype;
begin
  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Somente administradores podem convidar pessoas.';
  end if;

  lock table public.nxgeo_members in share row exclusive mode;

  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Seu acesso administrativo foi alterado.';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(normalized_email) > 320
  then
    raise exception using
      errcode = '22023',
      message = 'Informe um e-mail valido.';
  end if;

  if normalized_name is not null
     and char_length(normalized_name) not between 2 and 120
  then
    raise exception using
      errcode = '22023',
      message = 'O nome deve ter entre 2 e 120 caracteres.';
  end if;

  select auth_user.id
  into existing_user_id
  from auth.users as auth_user
  where auth_user.email is not null
    and lower(btrim(auth_user.email)) = normalized_email
  limit 1;

  insert into public.nxgeo_members as existing (
    user_id,
    email,
    full_name,
    role,
    active,
    invited_by_member_id,
    invited_at,
    joined_at,
    updated_at
  )
  values (
    existing_user_id,
    normalized_email,
    normalized_name,
    'user',
    true,
    actor_id,
    now(),
    case when existing_user_id is null then null else now() end,
    now()
  )
  on conflict (email) do update
  set user_id = coalesce(existing.user_id, excluded.user_id),
      full_name = coalesce(excluded.full_name, existing.full_name),
      role = case when existing.active then existing.role else 'user' end,
      active = true,
      invited_by_member_id = excluded.invited_by_member_id,
      invited_at = now(),
      joined_at = case
        when coalesce(existing.user_id, excluded.user_id) is null
          then existing.joined_at
        else coalesce(existing.joined_at, now())
      end,
      updated_at = now()
  returning * into member;

  insert into public.nxgeo_allowed_emails (email, active, label)
  values (member.email, member.active, member.full_name)
  on conflict (email) do update
  set active = excluded.active,
      label = excluded.label;

  perform private.nxgeo_write_audit(
    'member.invited',
    'member',
    member.id,
    jsonb_build_object(
      'email', member.email,
      'role', member.role,
      'existing_auth_user', member.user_id is not null
    )
  );

  return jsonb_build_object(
    'id', member.id,
    'user_id', member.user_id,
    'email', member.email,
    'full_name', member.full_name,
    'role', member.role,
    'active', member.active,
    'joined_at', member.joined_at
  );
end;
$$;

create or replace function public.nxgeo_admin_update_member(
  p_member_id uuid,
  p_full_name text default null,
  p_role text default null,
  p_active boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target public.nxgeo_members%rowtype;
  updated_member public.nxgeo_members%rowtype;
  normalized_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  next_role text;
  next_active boolean;
  active_admin_count integer;
begin
  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Somente administradores podem alterar a equipe.';
  end if;

  if p_role is not null and p_role not in ('admin', 'user') then
    raise exception using
      errcode = '22023',
      message = 'O papel deve ser admin ou user.';
  end if;

  if p_full_name is not null
     and (
       normalized_name is null
       or char_length(normalized_name) not between 2 and 120
     )
  then
    raise exception using
      errcode = '22023',
      message = 'O nome deve ter entre 2 e 120 caracteres.';
  end if;

  lock table public.nxgeo_members in share row exclusive mode;

  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Seu acesso administrativo foi alterado.';
  end if;

  select member.*
  into target
  from public.nxgeo_members as member
  where member.id = p_member_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Pessoa nao encontrada.';
  end if;

  next_role := coalesce(p_role, target.role);
  next_active := coalesce(p_active, target.active);

  if target.active
     and target.role = 'admin'
     and not (next_active and next_role = 'admin')
  then
    select count(*)
    into active_admin_count
    from public.nxgeo_members as member
    where member.active
      and member.role = 'admin';

    if active_admin_count <= 1 then
      raise exception using
        errcode = '23514',
        message = 'O NXGEO precisa manter pelo menos um administrador ativo.';
    end if;
  end if;

  update public.nxgeo_members
  set full_name = case
        when p_full_name is null then target.full_name
        else normalized_name
      end,
      role = next_role,
      active = next_active,
      updated_at = now()
  where id = target.id
  returning * into updated_member;

  insert into public.nxgeo_allowed_emails (email, active, label)
  values (
    updated_member.email,
    updated_member.active,
    updated_member.full_name
  )
  on conflict (email) do update
  set active = excluded.active,
      label = excluded.label;

  perform private.nxgeo_write_audit(
    'member.updated',
    'member',
    updated_member.id,
    jsonb_build_object(
      'previous_role', target.role,
      'role', updated_member.role,
      'previous_active', target.active,
      'active', updated_member.active
    )
  );

  return jsonb_build_object(
    'id', updated_member.id,
    'email', updated_member.email,
    'full_name', updated_member.full_name,
    'role', updated_member.role,
    'active', updated_member.active
  );
end;
$$;

create or replace function public.nxgeo_admin_set_member_folders(
  p_member_id uuid,
  p_folder_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.nxgeo_current_member_id();
  normalized_folder_ids uuid[];
  requested_count integer;
  existing_count integer;
  target_exists boolean;
begin
  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Somente administradores podem atribuir pastas.';
  end if;

  lock table public.nxgeo_members in share row exclusive mode;

  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Seu acesso administrativo foi alterado.';
  end if;

  select exists (
    select 1
    from public.nxgeo_members as member
    where member.id = p_member_id
      and member.active
  )
  into target_exists;

  if not target_exists then
    raise exception using
      errcode = 'P0002',
      message = 'Pessoa ativa nao encontrada.';
  end if;

  select coalesce(array_agg(folder_id order by folder_id), array[]::uuid[])
  into normalized_folder_ids
  from (
    select distinct requested_folder_id as folder_id
    from unnest(coalesce(p_folder_ids, array[]::uuid[])) as requested(requested_folder_id)
    where requested_folder_id is not null
  ) as distinct_folders;

  requested_count := cardinality(normalized_folder_ids);

  select count(*)
  into existing_count
  from public.nxgeo_folders as folder
  where folder.id = any(normalized_folder_ids)
    and folder.deleted_at is null;

  if existing_count <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'Uma ou mais pastas nao existem ou estao arquivadas.';
  end if;

  delete from public.nxgeo_folder_access
  where member_id = p_member_id;

  insert into public.nxgeo_folder_access (
    folder_id,
    member_id,
    granted_by_member_id
  )
  select
    folder_id,
    p_member_id,
    actor_id
  from unnest(normalized_folder_ids) as selected(folder_id);

  perform private.nxgeo_write_audit(
    'member.folders_updated',
    'member',
    p_member_id,
    jsonb_build_object('folder_ids', to_jsonb(normalized_folder_ids))
  );

  return jsonb_build_object(
    'member_id', p_member_id,
    'folder_ids', to_jsonb(normalized_folder_ids)
  );
end;
$$;

alter table public.nxgeo_members enable row level security;
alter table public.nxgeo_folders enable row level security;
alter table public.nxgeo_folder_access enable row level security;
alter table public.nxgeo_maps enable row level security;
alter table public.nxgeo_audit_log enable row level security;

drop policy if exists nxgeo_members_auth_hook_read on public.nxgeo_members;
create policy nxgeo_members_auth_hook_read
  on public.nxgeo_members
  for select
  to supabase_auth_admin
  using (active);

drop policy if exists nxgeo_members_read on public.nxgeo_members;
create policy nxgeo_members_read
  on public.nxgeo_members
  for select
  to authenticated
  using (
    id = private.nxgeo_current_member_id()
    or private.nxgeo_is_admin()
  );

drop policy if exists nxgeo_folders_read on public.nxgeo_folders;
create policy nxgeo_folders_read
  on public.nxgeo_folders
  for select
  to authenticated
  using (private.nxgeo_can_access_folder(id));

drop policy if exists nxgeo_folders_insert_admin on public.nxgeo_folders;
create policy nxgeo_folders_insert_admin
  on public.nxgeo_folders
  for insert
  to authenticated
  with check (private.nxgeo_is_admin());

drop policy if exists nxgeo_folders_update_admin on public.nxgeo_folders;
create policy nxgeo_folders_update_admin
  on public.nxgeo_folders
  for update
  to authenticated
  using (private.nxgeo_is_admin())
  with check (private.nxgeo_is_admin());

drop policy if exists nxgeo_folder_access_read on public.nxgeo_folder_access;
create policy nxgeo_folder_access_read
  on public.nxgeo_folder_access
  for select
  to authenticated
  using (
    member_id = private.nxgeo_current_member_id()
    or private.nxgeo_is_admin()
  );

drop policy if exists nxgeo_maps_read on public.nxgeo_maps;
create policy nxgeo_maps_read
  on public.nxgeo_maps
  for select
  to authenticated
  using (
    private.nxgeo_is_admin()
    or (
      deleted_at is null
      and private.nxgeo_can_access_folder(folder_id)
    )
  );

drop policy if exists nxgeo_maps_insert on public.nxgeo_maps;
create policy nxgeo_maps_insert
  on public.nxgeo_maps
  for insert
  to authenticated
  with check (private.nxgeo_can_access_folder(folder_id));

drop policy if exists nxgeo_maps_update on public.nxgeo_maps;
create policy nxgeo_maps_update
  on public.nxgeo_maps
  for update
  to authenticated
  using (private.nxgeo_can_access_folder(folder_id))
  with check (private.nxgeo_can_access_folder(folder_id));

drop policy if exists nxgeo_audit_log_admin_read on public.nxgeo_audit_log;
create policy nxgeo_audit_log_admin_read
  on public.nxgeo_audit_log
  for select
  to authenticated
  using (private.nxgeo_is_admin());

revoke all on table public.nxgeo_members from public, anon, authenticated;
revoke all on table public.nxgeo_folders from public, anon, authenticated;
revoke all on table public.nxgeo_folder_access from public, anon, authenticated;
revoke all on table public.nxgeo_maps from public, anon, authenticated;
revoke all on table public.nxgeo_audit_log from public, anon, authenticated;

grant select on table public.nxgeo_members to authenticated;
grant select on table public.nxgeo_folders to authenticated;
grant insert (name, description) on table public.nxgeo_folders to authenticated;
grant update (name, description, deleted_at) on table public.nxgeo_folders to authenticated;
grant select on table public.nxgeo_folder_access to authenticated;
grant select on table public.nxgeo_maps to authenticated;
grant insert (
  id,
  folder_id,
  name,
  state,
  project_path,
  thumbnail_path,
  export_path
) on table public.nxgeo_maps to authenticated;
grant update (
  folder_id,
  name,
  state,
  project_path,
  thumbnail_path,
  export_path,
  deleted_at
) on table public.nxgeo_maps to authenticated;
grant select on table public.nxgeo_audit_log to authenticated;

grant usage on schema public to supabase_auth_admin;
grant select on table public.nxgeo_members to supabase_auth_admin;

revoke all on function private.nxgeo_current_member_id() from public, anon, authenticated;
revoke all on function private.nxgeo_is_admin() from public, anon, authenticated;
revoke all on function private.nxgeo_can_access_folder(uuid) from public, anon, authenticated;
revoke all on function private.nxgeo_can_access_storage_object(text) from public, anon, authenticated;
revoke all on function private.nxgeo_write_audit(text, text, uuid, jsonb) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.nxgeo_current_member_id() to authenticated;
grant execute on function private.nxgeo_is_admin() to authenticated;
grant execute on function private.nxgeo_can_access_folder(uuid) to authenticated;
grant execute on function private.nxgeo_can_access_storage_object(text) to authenticated;

revoke all on function public.nxgeo_before_user_created(jsonb) from public, anon, authenticated;
revoke all on function public.nxgeo_current_user_is_allowed() from public, anon, authenticated;
revoke all on function public.nxgeo_current_member() from public, anon, authenticated;
revoke all on function public.nxgeo_admin_list_members() from public, anon, authenticated;
revoke all on function public.nxgeo_admin_invite_member(text, text) from public, anon, authenticated;
revoke all on function public.nxgeo_admin_update_member(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.nxgeo_admin_set_member_folders(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.nxgeo_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.nxgeo_current_user_is_allowed() to authenticated;
grant execute on function public.nxgeo_current_member() to authenticated;
grant execute on function public.nxgeo_admin_list_members() to authenticated;
grant execute on function public.nxgeo_admin_invite_member(text, text) to authenticated;
grant execute on function public.nxgeo_admin_update_member(uuid, text, text, boolean) to authenticated;
grant execute on function public.nxgeo_admin_set_member_folders(uuid, uuid[]) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'nxgeo-workspace',
  'nxgeo-workspace',
  false,
  52428800,
  array[
    'application/json',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nxgeo_workspace_read on storage.objects;
create policy nxgeo_workspace_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'nxgeo-workspace'
    and private.nxgeo_can_access_storage_object(name)
  );

drop policy if exists nxgeo_workspace_insert on storage.objects;
create policy nxgeo_workspace_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'nxgeo-workspace'
    and private.nxgeo_can_access_storage_object(name)
  );

drop policy if exists nxgeo_workspace_update on storage.objects;
create policy nxgeo_workspace_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'nxgeo-workspace'
    and private.nxgeo_can_access_storage_object(name)
  )
  with check (
    bucket_id = 'nxgeo-workspace'
    and private.nxgeo_can_access_storage_object(name)
  );

drop policy if exists nxgeo_workspace_delete on storage.objects;
create policy nxgeo_workspace_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'nxgeo-workspace'
    and private.nxgeo_can_access_storage_object(name)
  );

commit;
