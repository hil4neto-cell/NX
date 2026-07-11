import { supabase } from '../supabase'
import type {
  CurrentMember,
  InviteMemberInput,
  MapPreview,
  MemberRole,
  SaveMapExportInput,
  SaveMapInput,
  WorkspaceFolder,
  WorkspaceMap,
  WorkspaceMember,
} from './types'

const WORKSPACE_BUCKET = 'nxgeo-workspace'

type CurrentMemberRow = {
  id: string
  email: string
  full_name: string | null
  role: MemberRole
  active: boolean
  joined_at: string | null
  last_seen_at: string | null
}

type MemberRow = CurrentMemberRow & {
  folder_ids: string[]
  invited_at: string
  created_at: string
}

type FolderRow = {
  id: string
  name: string
  description: string | null
  created_by_member_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type MapRow = {
  id: string
  folder_id: string
  name: string
  project_path: string | null
  thumbnail_path: string | null
  export_path: string | null
  revision: number
  export_revision: number | null
  created_by_member_id: string
  updated_by_member_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function fail(message: string, error?: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message)
}

function normalizeCurrentMember(row: CurrentMemberRow): CurrentMember {
  return {
    id: row.id,
    user_id: null,
    email: row.email,
    display_name: row.full_name ?? '',
    role: row.role,
    active: row.active,
    joined: Boolean(row.last_seen_at),
    folder_ids: [],
    created_at: row.joined_at ?? row.last_seen_at ?? new Date().toISOString(),
    last_sign_in_at: row.last_seen_at,
  }
}

function normalizeMember(row: MemberRow): WorkspaceMember {
  return {
    id: row.id,
    user_id: null,
    email: row.email,
    display_name: row.full_name ?? '',
    role: row.role,
    active: row.active,
    joined: Boolean(row.last_seen_at),
    folder_ids: row.folder_ids ?? [],
    created_at: row.created_at,
    last_sign_in_at: row.last_seen_at,
  }
}

function normalizeFolder(row: FolderRow): WorkspaceFolder {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    created_by: row.created_by_member_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }
}

function normalizeMap(row: MapRow): WorkspaceMap {
  return {
    id: row.id,
    folder_id: row.folder_id,
    title: row.name,
    project_path: row.project_path ?? '',
    thumbnail_path: row.thumbnail_path,
    export_path: row.export_path,
    revision: row.revision,
    export_revision: row.export_revision ?? 0,
    created_by: row.created_by_member_id,
    updated_by: row.updated_by_member_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function removeWorkspaceFiles(paths: string[]) {
  await supabase.storage.from(WORKSPACE_BUCKET).remove(paths)
}

async function makeThumbnail(image: Blob) {
  if (typeof createImageBitmap !== 'function') return image
  const bitmap = await createImageBitmap(image)
  // O card não substitui o PNG 4K, mas uma prévia 2x evita apagar rótulos finos
  // e mantém a leitura honesta para quem confere o mapa antes de baixá-lo.
  const width = 1120
  const height = 630
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return image
  }

  const scale = Math.max(width / bitmap.width, height / bitmap.height)
  const drawWidth = bitmap.width * scale
  const drawHeight = bitmap.height * scale
  context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
  bitmap.close()

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? image), 'image/webp', 0.86)
  })
}

export async function getCurrentMember() {
  const { data, error } = await supabase.rpc('nxgeo_current_member')
  if (error) fail('Não foi possível carregar seu perfil', error)
  if (!data) fail('Seu perfil ainda não está pronto para usar o NXGEO')
  return normalizeCurrentMember(data as CurrentMemberRow)
}

export async function listFolders() {
  const { data, error } = await supabase
    .from('nxgeo_folders')
    .select('id,name,description,created_by_member_id,created_at,updated_at,deleted_at')
    .is('deleted_at', null)
    .order('name')

  if (error) fail('Não foi possível carregar as pastas', error)
  return ((data ?? []) as FolderRow[]).map(normalizeFolder)
}

export async function listMaps() {
  const { data, error } = await supabase
    .from('nxgeo_maps')
    .select('id,folder_id,name,project_path,thumbnail_path,export_path,revision,export_revision,created_by_member_id,updated_by_member_id,created_at,updated_at,deleted_at')
    .is('deleted_at', null)
    .not('project_path', 'is', null)
    .order('updated_at', { ascending: false })

  if (error) fail('Não foi possível carregar os mapas', error)
  return ((data ?? []) as MapRow[]).map(normalizeMap)
}

export async function loadWorkspace() {
  const [member, folders, maps] = await Promise.all([
    getCurrentMember(),
    listFolders(),
    listMaps(),
  ])

  return { member, folders, maps }
}

export async function createFolder(name: string, description = '') {
  const { data, error } = await supabase
    .from('nxgeo_folders')
    .insert({ name: name.trim(), description: description.trim() || null })
    .select('id,name,description,created_by_member_id,created_at,updated_at,deleted_at')
    .single()

  if (error) fail('Não foi possível criar a pasta', error)
  return normalizeFolder(data as FolderRow)
}

export async function archiveMap(mapId: string) {
  const { error } = await supabase.rpc('nxgeo_archive_map', { p_map_id: mapId })
  if (error) fail('Não foi possível mover o mapa para a lixeira', error)
}

export async function archiveFolder(folderId: string) {
  const { data, error } = await supabase.rpc('nxgeo_admin_archive_folder', {
    p_folder_id: folderId,
  })
  if (error) fail('Não foi possível arquivar a pasta', error)
  return data as { archived_map_count?: number } | null
}

export async function moveMapToFolder(mapId: string, folderId: string) {
  const { error: moveError } = await supabase.rpc('nxgeo_admin_move_map', {
    p_map_id: mapId,
    p_destination_folder_id: folderId,
  })
  if (moveError) fail('Não foi possível mover o mapa', moveError)

  const { data, error } = await supabase
    .from('nxgeo_maps')
    .select('id,folder_id,name,project_path,thumbnail_path,export_path,revision,export_revision,created_by_member_id,updated_by_member_id,created_at,updated_at,deleted_at')
    .eq('id', mapId)
    .single()

  if (error) fail('Não foi possível mover o mapa', error)
  return normalizeMap(data as MapRow)
}

export async function saveMapProject<TProject>({
  id,
  folderId,
  title,
  project,
  currentRevision,
}: SaveMapInput<TProject>) {
  let baseRevision = currentRevision
  let previousProjectPath: string | null = null
  const { data: existing, error: lookupError } = await supabase
    .from('nxgeo_maps')
    .select('revision,project_path')
    .eq('id', id)
    .maybeSingle()
  if (lookupError) fail('Não foi possível verificar o mapa', lookupError)
  if (existing) {
    if (baseRevision === 0) baseRevision = Number(existing.revision)
    previousProjectPath = existing.project_path as string | null
  } else if (baseRevision > 0) {
    fail('Este mapa não existe mais ou seu acesso foi removido')
  }

  if (baseRevision === 0) {
    const { data: stub, error: stubError } = await supabase
      .from('nxgeo_maps')
      .insert({
        id,
        folder_id: folderId,
        name: `Pendente ${id}`,
        state: { status: 'pending', schemaVersion: 2 },
        project_path: null,
        thumbnail_path: null,
        export_path: null,
      })
      .select('revision')
      .single()
    if (stubError) fail('Não foi possível iniciar o mapa', stubError)
    baseRevision = Number(stub.revision)
  }

  const assetVersion = `${baseRevision + 1}-${crypto.randomUUID()}`
  const projectPath = `${id}/project-${assetVersion}.json`
  const projectFile = new Blob([JSON.stringify(project)], { type: 'application/json' })
  const state = {
    schemaVersion: 2,
    storage: 'private',
    savedAt: new Date().toISOString(),
  }

  const { error: projectUploadError } = await supabase.storage
    .from(WORKSPACE_BUCKET)
    .upload(projectPath, projectFile, {
      contentType: 'application/json',
      cacheControl: '0',
      upsert: false,
    })
  if (projectUploadError) {
    await removeWorkspaceFiles([projectPath])
    fail('Não foi possível salvar os dados do mapa', projectUploadError)
  }

  const { data, error } = await supabase
    .from('nxgeo_maps')
    .update({
      name: title.trim(),
      state,
      project_path: projectPath,
    })
    .eq('id', id)
    .eq('revision', baseRevision)
    .select('id,folder_id,name,project_path,thumbnail_path,export_path,revision,export_revision,created_by_member_id,updated_by_member_id,created_at,updated_at,deleted_at')
    .maybeSingle()

  if (error) fail('Não foi possível atualizar o mapa', error)
  if (!data) {
    await removeWorkspaceFiles([projectPath])
    fail('Este mapa foi alterado por outra pessoa. Reabra-o antes de salvar novamente')
  }
  if (previousProjectPath && previousProjectPath !== projectPath) {
    await removeWorkspaceFiles([previousProjectPath])
  }
  return normalizeMap(data as MapRow)
}

export async function saveMapExport({ id, exportImage, revision }: SaveMapExportInput) {
  const { data: current, error: currentError } = await supabase
    .from('nxgeo_maps')
    .select('revision,thumbnail_path,export_path')
    .eq('id', id)
    .maybeSingle()
  if (currentError) fail('Não foi possível verificar a imagem atual', currentError)
  if (!current || Number(current.revision) !== revision) {
    fail('O mapa mudou antes de a imagem ficar pronta')
  }

  const previousAssetPaths = [current.thumbnail_path, current.export_path]
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
  const assetVersion = `${revision}-${crypto.randomUUID()}`
  const thumbnailPath = `${id}/thumbnail-${assetVersion}.webp`
  const exportPath = `${id}/export-${assetVersion}.png`
  const thumbnail = await makeThumbnail(exportImage)
  const assetPaths = [thumbnailPath, exportPath]
  const [{ error: thumbnailError }, { error: exportError }] = await Promise.all([
    supabase.storage.from(WORKSPACE_BUCKET).upload(thumbnailPath, thumbnail, { contentType: thumbnail.type || 'image/webp', cacheControl: '3600', upsert: false }),
    supabase.storage.from(WORKSPACE_BUCKET).upload(exportPath, exportImage, { contentType: 'image/png', cacheControl: '3600', upsert: false }),
  ])

  if (thumbnailError || exportError) {
    await removeWorkspaceFiles(assetPaths)
    if (thumbnailError) fail('Não foi possível preparar a miniatura', thumbnailError)
    fail('Não foi possível preparar a imagem rápida', exportError)
  }

  const { data, error } = await supabase
    .from('nxgeo_maps')
    .update({ thumbnail_path: thumbnailPath, export_path: exportPath })
    .eq('id', id)
    .eq('revision', revision)
    .select('id,folder_id,name,project_path,thumbnail_path,export_path,revision,export_revision,created_by_member_id,updated_by_member_id,created_at,updated_at,deleted_at')
    .maybeSingle()

  if (error) fail('O mapa foi salvo, mas não foi possível registrar a imagem', error)
  if (!data) {
    await removeWorkspaceFiles(assetPaths)
    fail('O mapa foi salvo, mas mudou antes de a imagem ficar pronta')
  }
  if (previousAssetPaths.length) {
    await removeWorkspaceFiles(previousAssetPaths.filter((path) => !assetPaths.includes(path)))
  }
  return normalizeMap(data as MapRow)
}

export async function loadMapProject<TProject>(map: WorkspaceMap) {
  if (!map.project_path) fail('Este mapa ainda não possui dados salvos')
  const { data, error } = await supabase.storage
    .from(WORKSPACE_BUCKET)
    .download(map.project_path)

  if (error) fail('Não foi possível abrir o mapa salvo', error)

  try {
    return JSON.parse(await data.text()) as TProject
  } catch {
    fail('O mapa salvo está em um formato inválido')
  }
}

export async function downloadMapExport(map: WorkspaceMap) {
  if (!map.export_path || map.export_revision !== map.revision) {
    fail('Abra e salve este mapa para preparar uma imagem atualizada')
  }

  const { data, error } = await supabase.storage
    .from(WORKSPACE_BUCKET)
    .download(map.export_path)

  if (error) fail('Não foi possível baixar a imagem', error)
  downloadBlob(`${map.title || 'mapa-nxgeo'}.png`, data)
}

export async function createMapPreviewUrls(maps: WorkspaceMap[]) {
  const previews: MapPreview = {}

  await Promise.all(maps.map(async (map) => {
    if (!map.thumbnail_path || map.export_revision !== map.revision) return
    const { data } = await supabase.storage
      .from(WORKSPACE_BUCKET)
      .createSignedUrl(map.thumbnail_path, 3600)
    if (data?.signedUrl) previews[map.id] = data.signedUrl
  }))

  return previews
}

export async function listMembers() {
  const { data, error } = await supabase.rpc('nxgeo_admin_list_members')
  if (error) fail('Não foi possível carregar as pessoas', error)
  return ((data ?? []) as MemberRow[]).map(normalizeMember)
}

async function updateMemberById(memberId: string, displayName: string | null, role: MemberRole | null, active: boolean | null) {
  const { error } = await supabase.rpc('nxgeo_admin_update_member', {
    p_member_id: memberId,
    p_full_name: displayName,
    p_role: role,
    p_active: active,
  })
  if (error) fail('Não foi possível atualizar o acesso', error)
}

async function setMemberFoldersById(memberId: string, folderIds: string[]) {
  const { error } = await supabase.rpc('nxgeo_admin_set_member_folders', {
    p_member_id: memberId,
    p_folder_ids: folderIds,
  })
  if (error) fail('Não foi possível atualizar as pastas compartilhadas', error)
}

export async function inviteMember(input: InviteMemberInput) {
  const { data, error } = await supabase.functions.invoke('nxgeo-invite', {
    body: {
      email: input.email.trim().toLowerCase(),
      full_name: input.displayName.trim(),
    },
  })

  if (error) fail('Não foi possível enviar o convite', error)
  if (data?.error) fail(data.error)
  const memberId = data?.member?.id
  if (typeof memberId !== 'string') fail('O convite não retornou uma pessoa válida')

  if (input.role === 'admin') {
    await updateMemberById(memberId, input.displayName.trim(), 'admin', true)
  } else {
    await setMemberFoldersById(memberId, input.folderIds)
  }
  return data
}

export async function updateMember(memberId: string, role: MemberRole, active: boolean) {
  await updateMemberById(memberId, null, role, active)
}

export async function setMemberFolders(memberId: string, folderIds: string[]) {
  await setMemberFoldersById(memberId, folderIds)
}
