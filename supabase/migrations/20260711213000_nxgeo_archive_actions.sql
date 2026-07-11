begin;

-- Arquivamento é uma ação de produto, não uma exclusão física. As funções
-- abaixo mantêm arquivos e histórico para futura restauração, mas removem o
-- conteúdo do espaço de trabalho ativo com uma única decisão auditável.

create or replace function public.nxgeo_archive_map(
  p_map_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.nxgeo_current_member_id();
  target public.nxgeo_maps%rowtype;
begin
  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'Acesso NXGEO inativo ou inexistente.';
  end if;

  select map.*
  into target
  from public.nxgeo_maps as map
  where map.id = p_map_id
    and map.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Mapa ativo nao encontrado.';
  end if;

  if not private.nxgeo_is_admin()
     and (
       target.created_by_member_id <> actor_id
       or not private.nxgeo_can_access_folder(target.folder_id)
     )
  then
    raise exception using
      errcode = '42501',
      message = 'Somente quem criou o mapa com acesso à pasta ou um administrador pode arquiva-lo.';
  end if;

  update public.nxgeo_maps
  set deleted_at = now()
  where id = target.id;

  return jsonb_build_object(
    'id', target.id,
    'folder_id', target.folder_id,
    'archived', true
  );
end;
$$;

create or replace function public.nxgeo_admin_archive_folder(
  p_folder_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target public.nxgeo_folders%rowtype;
  archived_map_count integer := 0;
begin
  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Somente administradores podem arquivar pastas.';
  end if;

  select folder.*
  into target
  from public.nxgeo_folders as folder
  where folder.id = p_folder_id
    and folder.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Pasta ativa nao encontrada.';
  end if;

  update public.nxgeo_maps
  set deleted_at = now()
  where folder_id = target.id
    and deleted_at is null;
  get diagnostics archived_map_count = row_count;

  update public.nxgeo_folders
  set deleted_at = now()
  where id = target.id;

  perform private.nxgeo_write_audit(
    'folder.archive_batch',
    'folder',
    target.id,
    jsonb_build_object('archived_map_count', archived_map_count)
  );

  return jsonb_build_object(
    'id', target.id,
    'archived', true,
    'archived_map_count', archived_map_count
  );
end;
$$;

create or replace function public.nxgeo_admin_move_map(
  p_map_id uuid,
  p_destination_folder_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target public.nxgeo_maps%rowtype;
  destination public.nxgeo_folders%rowtype;
begin
  if not private.nxgeo_is_admin() then
    raise exception using
      errcode = '42501',
      message = 'Somente administradores podem mover mapas entre pastas.';
  end if;

  select map.*
  into target
  from public.nxgeo_maps as map
  where map.id = p_map_id
    and map.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Mapa ativo nao encontrado.';
  end if;

  select folder.*
  into destination
  from public.nxgeo_folders as folder
  where folder.id = p_destination_folder_id
    and folder.deleted_at is null;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Pasta de destino nao encontrada.';
  end if;

  if target.folder_id = destination.id then
    return jsonb_build_object(
      'id', target.id,
      'folder_id', target.folder_id,
      'moved', false
    );
  end if;

  update public.nxgeo_maps
  set folder_id = destination.id
  where id = target.id;

  return jsonb_build_object(
    'id', target.id,
    'previous_folder_id', target.folder_id,
    'folder_id', destination.id,
    'moved', true
  );
end;
$$;

-- Inclui a mudança de pasta no evento sem duplicar um evento manual da RPC.
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
  elsif new.folder_id is distinct from old.folder_id then
    audit_action := 'map.moved';
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
      'previous_folder_id', case when tg_op = 'UPDATE' then old.folder_id else null end,
      'name', new.name,
      'revision', new.revision,
      'export_revision', new.export_revision
    )
  );
  return new;
end;
$$;

-- Evita que uma chamada direta do navegador arquive conteúdo sem passar pelas
-- regras de autoria/administrador das funções acima. Mover mapas também é
-- uma ação administrativa, mesmo que uma pessoa tente chamar a API à mão.
revoke update (deleted_at, folder_id) on table public.nxgeo_maps from authenticated;
revoke update (deleted_at) on table public.nxgeo_folders from authenticated;

revoke all on function public.nxgeo_archive_map(uuid) from public, anon, authenticated;
revoke all on function public.nxgeo_admin_archive_folder(uuid) from public, anon, authenticated;
revoke all on function public.nxgeo_admin_move_map(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nxgeo_archive_map(uuid) to authenticated;
grant execute on function public.nxgeo_admin_archive_folder(uuid) to authenticated;
grant execute on function public.nxgeo_admin_move_map(uuid, uuid) to authenticated;

commit;
