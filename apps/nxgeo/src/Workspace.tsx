import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Download,
  Ellipsis,
  FileImage,
  Folder,
  FolderInput,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Map as MapIcon,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { SavedProject } from './App'
import PwaInstall from './PwaInstall'
import { supabase } from './supabase'
import {
  archiveFolder,
  archiveMap,
  createFolder,
  createMapPreviewUrls,
  downloadMapExport,
  inviteMember,
  listMembers,
  loadMapProject,
  loadWorkspace,
  moveMapToFolder,
  saveMapExport,
  saveMapProject,
  setMemberFolders,
  updateMember,
} from './workspace/api'
import type {
  CurrentMember,
  InviteMemberInput,
  MapPreview,
  MemberRole,
  WorkspaceFolder,
  WorkspaceMap,
  WorkspaceMember,
} from './workspace/types'
import './Workspace.css'

type WorkspaceView = 'home' | 'people'

type EditorState = {
  id: string
  folderId: string
  title: string
  revision: number
  project?: SavedProject
}

type ModalProps = {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
}

const emptyInvite: InviteMemberInput = {
  email: '',
  displayName: '',
  role: 'user',
  folderIds: [],
}

const MapEditor = lazy(() => import('./App'))

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function firstName(name: string, email: string) {
  return (name.trim() || email.split('@')[0]).split(/\s+/)[0]
}

function Modal({ title, description, children, onClose }: ModalProps) {
  return (
    <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-modal-title">
        <header>
          <div>
            <h2 id="workspace-modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="workspace-icon-button" type="button" onClick={onClose} aria-label="Fechar">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

export default function Workspace() {
  const [member, setMember] = useState<CurrentMember | null>(null)
  const [folders, setFolders] = useState<WorkspaceFolder[]>([])
  const [maps, setMaps] = useState<WorkspaceMap[]>([])
  const [previews, setPreviews] = useState<MapPreview>({})
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [view, setView] = useState<WorkspaceView>('home')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMapId, setLoadingMapId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showMapModal, setShowMapModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null)
  const [openMapMenuId, setOpenMapMenuId] = useState<string | null>(null)
  const [accessMember, setAccessMember] = useState<WorkspaceMember | null>(null)
  const [shareFolder, setShareFolder] = useState<WorkspaceFolder | null>(null)
  const [shareMemberId, setShareMemberId] = useState('')
  const [mapToMove, setMapToMove] = useState<WorkspaceMap | null>(null)
  const [moveMapFolderId, setMoveMapFolderId] = useState('')
  const [folderName, setFolderName] = useState('')
  const [folderDescription, setFolderDescription] = useState('')
  const [newMapTitle, setNewMapTitle] = useState('')
  const [newMapFolderId, setNewMapFolderId] = useState('')
  const [invite, setInvite] = useState<InviteMemberInput>(emptyInvite)

  const isAdmin = member?.role === 'admin'

  const refreshWorkspace = useCallback(async () => {
    const next = await loadWorkspace()
    setMember(next.member)
    setFolders(next.folders)
    setMaps(next.maps)
    const [nextPreviews, nextMembers] = await Promise.all([
      createMapPreviewUrls(next.maps),
      next.member.role === 'admin' ? listMembers() : Promise.resolve([]),
    ])
    setPreviews(nextPreviews)
    setMembers(nextMembers)

    if (next.member.role !== 'admin') {
      setView('home')
    }
  }, [])

  useEffect(() => {
    let active = true
    void refreshWorkspace()
      .catch((nextError: unknown) => {
        if (active) setError(nextError instanceof Error ? nextError.message : 'Não foi possível abrir seu espaço de trabalho.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshWorkspace])

  const mapCountByFolder = useMemo(() => maps.reduce<Record<string, number>>((counts, map) => {
    counts[map.folder_id] = (counts[map.folder_id] ?? 0) + 1
    return counts
  }, {}), [maps])

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
  const visibleFolders = folders.filter((folder) => !normalizedSearch || (
    folder.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
    || folder.description?.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  ))
  const visibleMaps = maps.filter((map) => {
    if (selectedFolderId && map.folder_id !== selectedFolderId) return false
    return !normalizedSearch || map.title.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  })

  async function handleCreateFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!folderName.trim()) return
    setBusyAction('folder')
    setError('')
    try {
      const folder = await createFolder(folderName, folderDescription)
      setFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
      setSelectedFolderId(folder.id)
      setFolderName('')
      setFolderDescription('')
      setShowFolderModal(false)
      setNotice('Pasta criada. Agora você já pode adicionar um mapa.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível criar a pasta.')
    } finally {
      setBusyAction('')
    }
  }

  function startNewMap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newMapTitle.trim() || !newMapFolderId) return
    setEditor({
      id: crypto.randomUUID(),
      folderId: newMapFolderId,
      title: newMapTitle.trim(),
      revision: 0,
    })
    setSelectedFolderId(newMapFolderId)
    setNewMapTitle('')
    setShowMapModal(false)
  }

  async function openMap(map: WorkspaceMap) {
    setLoadingMapId(map.id)
    setError('')
    try {
      const project = await loadMapProject<SavedProject>(map)
      setEditor({
        id: map.id,
        folderId: map.folder_id,
        title: map.title,
        revision: map.revision,
        project,
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível abrir o mapa.')
    } finally {
      setLoadingMapId(null)
    }
  }

  async function saveEditorProject(project: SavedProject) {
    if (!editor) throw new Error('Nenhum mapa aberto para salvar.')
    const saved = await saveMapProject({
      id: editor.id,
      folderId: editor.folderId,
      title: project.metadata.projectName.trim() || editor.title,
      project,
      currentRevision: editor.revision,
    })

    setEditor((current) => current ? { ...current, title: saved.title, revision: saved.revision, project } : current)
    setMaps((current) => [saved, ...current.filter((map) => map.id !== saved.id)])
    setPreviews((current) => {
      const next = { ...current }
      delete next[saved.id]
      return next
    })
    return saved.revision
  }

  async function saveEditorExport(exportImage: Blob, revision: number) {
    if (!editor) throw new Error('Nenhum mapa aberto para preparar a imagem.')
    const saved = await saveMapExport({ id: editor.id, exportImage, revision })
    setEditor((current) => current ? { ...current, revision: saved.revision } : current)
    setMaps((current) => [saved, ...current.filter((map) => map.id !== saved.id)])
    const nextPreview = await createMapPreviewUrls([saved])
    setPreviews((current) => ({ ...current, ...nextPreview }))
  }

  async function handleQuickDownload(map: WorkspaceMap) {
    setBusyAction(`download-${map.id}`)
    setError('')
    try {
      await downloadMapExport(map)
      setNotice(`Imagem de “${map.title}” pronta para download.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível baixar a imagem.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleArchiveMap(map: WorkspaceMap) {
    if (!window.confirm(`Arquivar “${map.title}”? Ele sairá da lista ativa, sem apagar seus arquivos de forma definitiva.`)) return
    setBusyAction(`archive-${map.id}`)
    setError('')
    try {
      await archiveMap(map.id)
      setMaps((current) => current.filter((item) => item.id !== map.id))
      setNotice('Mapa arquivado. Ele não aparece mais na lista ativa.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível mover o mapa.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleArchiveFolder(folder: WorkspaceFolder) {
    const mapCount = mapCountByFolder[folder.id] ?? 0
    const mapLabel = mapCount === 1 ? '1 mapa' : `${mapCount} mapas`
    if (!window.confirm(`Arquivar a pasta “${folder.name}” e ${mapLabel}? O conteúdo deixará a lista ativa, sem exclusão definitiva.`)) return

    setBusyAction(`archive-folder-${folder.id}`)
    setError('')
    try {
      const result = await archiveFolder(folder.id)
      setFolders((current) => current.filter((item) => item.id !== folder.id))
      setMaps((current) => current.filter((item) => item.folder_id !== folder.id))
      setSelectedFolderId((current) => current === folder.id ? null : current)
      setOpenFolderMenuId(null)
      const archivedCount = result?.archived_map_count ?? mapCount
      setNotice(`Pasta arquivada${archivedCount ? ` com ${archivedCount} ${archivedCount === 1 ? 'mapa' : 'mapas'}` : ''}.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível arquivar a pasta.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleShareFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!shareFolder || !shareMemberId) return
    const target = members.find((item) => item.id === shareMemberId)
    if (!target) return

    setBusyAction(`share-folder-${shareFolder.id}`)
    setError('')
    try {
      await setMemberFolders(target.id, [...new Set([...target.folder_ids, shareFolder.id])])
      setMembers(await listMembers())
      setNotice(`“${shareFolder.name}” foi compartilhada com ${target.display_name || target.email}.`)
      setShareFolder(null)
      setShareMemberId('')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível compartilhar a pasta.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleMoveMap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!mapToMove || !moveMapFolderId || moveMapFolderId === mapToMove.folder_id) return

    setBusyAction(`move-map-${mapToMove.id}`)
    setError('')
    try {
      const moved = await moveMapToFolder(mapToMove.id, moveMapFolderId)
      const destination = folders.find((folder) => folder.id === moveMapFolderId)
      setMaps((current) => [moved, ...current.filter((map) => map.id !== moved.id)])
      setMapToMove(null)
      setMoveMapFolderId('')
      setOpenMapMenuId(null)
      setNotice(`Mapa movido para ${destination?.name ?? 'a nova pasta'}.`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível mover o mapa.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusyAction('invite')
    setError('')
    try {
      await inviteMember(invite)
      setMembers(await listMembers())
      setInvite(emptyInvite)
      setShowInviteModal(false)
      setNotice('Convite enviado. A pessoa receberá um código de acesso por e-mail.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível enviar o convite.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleMemberUpdate(target: WorkspaceMember, role: MemberRole, active: boolean) {
    const roleChangedToAdmin = target.role !== 'admin' && role === 'admin'
    if (roleChangedToAdmin && !window.confirm(`Tornar ${target.display_name || target.email} administrador(a)? Essa pessoa poderá convidar usuários e alterar acessos.`)) return

    setBusyAction(`member-${target.email}`)
    setError('')
    try {
      await updateMember(target.id, role, active)
      setMembers(await listMembers())
      setNotice('Acesso atualizado.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível atualizar o acesso.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleFolderAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accessMember) return
    setBusyAction(`folders-${accessMember.email}`)
    setError('')
    try {
      await setMemberFolders(accessMember.id, accessMember.folder_ids)
      setMembers(await listMembers())
      setAccessMember(null)
      setNotice('Pastas compartilhadas atualizadas.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível atualizar as pastas.')
    } finally {
      setBusyAction('')
    }
  }

  function openNewMapModal(folderId?: string) {
    const nextFolderId = folderId ?? selectedFolderId ?? folders[0]?.id ?? ''
    setNewMapFolderId(nextFolderId)
    setShowNewMenu(false)
    setShowMapModal(true)
  }

  if (editor) {
    return (
      <Suspense fallback={<main className="workspace-state"><LoaderCircle className="workspace-spinner" /><p>Preparando o editor de mapas…</p></main>}>
        <MapEditor
          key={editor.id}
          initialProject={editor.project}
          workspaceTitle={editor.title}
          onBack={() => {
            setEditor(null)
            void refreshWorkspace().catch(() => undefined)
          }}
          onSaveProject={saveEditorProject}
          onSaveExport={saveEditorExport}
        />
      </Suspense>
    )
  }

  if (isLoading) {
    return (
      <main className="workspace-state" aria-live="polite">
        <LoaderCircle className="workspace-spinner" aria-hidden="true" />
        <p>Organizando seu espaço de trabalho…</p>
      </main>
    )
  }

  if (!member) {
    return (
      <main className="workspace-state workspace-error-state">
        <ShieldCheck size={32} aria-hidden="true" />
        <h1>O espaço de trabalho ainda não está pronto</h1>
        <p>{error || 'A configuração do painel precisa ser concluída no Supabase.'}</p>
        <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
      </main>
    )
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/" aria-label="Voltar ao site NX">
          <img src={`${import.meta.env.BASE_URL}nx-white.svg`} alt="NX" />
          <div><strong>GEO</strong><span>espaço de trabalho</span></div>
        </a>

        <nav aria-label="Navegação do NXGEO">
          <button className={view === 'home' ? 'workspace-nav-primary active' : 'workspace-nav-primary'} type="button" onClick={() => {
            setView('home')
            setSelectedFolderId(null)
          }}>
            <LayoutDashboard size={18} aria-hidden="true" /> Projetos
          </button>
          {isAdmin && (
            <button className={view === 'people' ? 'workspace-nav-primary active' : 'workspace-nav-primary'} type="button" onClick={() => setView('people')}>
              <Users size={18} aria-hidden="true" /> Pessoas
            </button>
          )}
        </nav>

        <div className="workspace-account">
          <button className="workspace-profile-trigger" type="button" onClick={() => {
            setShowAccountMenu((current) => !current)
            setShowNewMenu(false)
            setOpenFolderMenuId(null)
            setOpenMapMenuId(null)
          }} aria-label="Abrir menu da conta" aria-expanded={showAccountMenu} aria-haspopup="menu">
            <CircleUserRound size={19} aria-hidden="true" />
            <span>
              <strong>{member.display_name || member.email}</strong>
              <small>{member.role === 'admin' ? 'Administrador' : 'Usuário'}</small>
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {showAccountMenu && (
            <div className="workspace-account-menu" role="menu">
              <div className="workspace-account-menu-identity"><strong>{member.display_name || member.email}</strong><span>{member.email}</span></div>
              <button type="button" role="menuitem" onClick={() => void supabase.auth.signOut()}><LogOut size={16} aria-hidden="true" /> Sair do NXGEO</button>
            </div>
          )}
        </div>
      </aside>

      <section className="workspace-content">
        <header className="workspace-topbar">
          <PwaInstall variant="workspace" />
          <label className="workspace-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Buscar pasta ou mapa</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pasta ou mapa" />
          </label>
          <div className="workspace-new-control">
            <button className="workspace-primary-button" type="button" onClick={() => {
              setShowNewMenu((current) => !current)
              setShowAccountMenu(false)
              setOpenFolderMenuId(null)
              setOpenMapMenuId(null)
            }} aria-expanded={showNewMenu} aria-haspopup="menu">
              <Plus size={18} aria-hidden="true" /> Novo <ChevronDown size={15} aria-hidden="true" />
            </button>
            {showNewMenu && (
              <div className="workspace-action-menu workspace-new-menu" role="menu">
                {isAdmin && <button type="button" role="menuitem" onClick={() => { setShowNewMenu(false); setShowFolderModal(true) }}><Folder size={16} aria-hidden="true" /> Nova pasta</button>}
                <button type="button" role="menuitem" onClick={() => openNewMapModal()} disabled={folders.length === 0}><MapIcon size={16} aria-hidden="true" /> Novo mapa</button>
              </div>
            )}
          </div>
        </header>

        {(error || notice) && (
          <div className={error ? 'workspace-notice error' : 'workspace-notice'} role="status">
            <span>{error || notice}</span>
            <button type="button" onClick={() => {
              setError('')
              setNotice('')
            }} aria-label="Fechar aviso"><X size={17} /></button>
          </div>
        )}

        {view === 'home' ? (
          <div className="workspace-page">
            <div className="workspace-hero">
              <div>
                {selectedFolder && (
                  <button className="workspace-breadcrumb" type="button" onClick={() => setSelectedFolderId(null)}>
                    <ArrowLeft size={15} aria-hidden="true" /> Todas as pastas
                  </button>
                )}
                <h1>{selectedFolder ? selectedFolder.name : `Olá, ${firstName(member.display_name, member.email)}`}</h1>
                <p>{selectedFolder
                  ? (selectedFolder.description || 'Mapas e arquivos deste projeto estão reunidos aqui.')
                  : 'Seus projetos, mapas e imagens de trabalho estão organizados em um só lugar.'}</p>
              </div>
              <div className="workspace-hero-actions">
                {selectedFolder && (
                  <div className="workspace-folder-toolbar">
                    {isAdmin && <button className="workspace-secondary-button" type="button" onClick={() => setShareFolder(selectedFolder)}><Share2 size={17} aria-hidden="true" /> Compartilhar</button>}
                    {isAdmin && <button className="workspace-icon-button danger" type="button" onClick={() => void handleArchiveFolder(selectedFolder)} disabled={busyAction === `archive-folder-${selectedFolder.id}`} aria-label={`Arquivar pasta ${selectedFolder.name}`} title="Arquivar pasta"><Archive size={17} aria-hidden="true" /></button>}
                  </div>
                )}
              </div>
            </div>

            {!selectedFolder && (
              <section className="workspace-section" aria-labelledby="folders-title">
                <div className="workspace-section-heading">
                  <div><span>Organização</span><h2 id="folders-title">Pastas</h2></div>
                  <strong>{visibleFolders.length}</strong>
                </div>
                {visibleFolders.length > 0 ? (
                  <div className="folder-grid">
                    {visibleFolders.map((folder) => (
                      <article className="folder-card" key={folder.id}>
                        <button className="folder-card-main" type="button" onClick={() => setSelectedFolderId(folder.id)}>
                          <div className="folder-icon"><Folder size={25} aria-hidden="true" /></div>
                          <div>
                            <strong>{folder.name}</strong>
                            <span>{mapCountByFolder[folder.id] ?? 0} {(mapCountByFolder[folder.id] ?? 0) === 1 ? 'mapa' : 'mapas'}</span>
                          </div>
                          <ChevronRight className="folder-arrow" size={18} aria-hidden="true" />
                        </button>
                        {isAdmin && (
                          <div className="workspace-card-menu">
                            <button className="workspace-icon-button" type="button" onClick={() => {
                              setOpenFolderMenuId((current) => current === folder.id ? null : folder.id)
                              setShowNewMenu(false)
                              setShowAccountMenu(false)
                              setOpenMapMenuId(null)
                            }} aria-label={`Mais ações para ${folder.name}`} aria-expanded={openFolderMenuId === folder.id}><Ellipsis size={18} aria-hidden="true" /></button>
                            {openFolderMenuId === folder.id && (
                              <div className="workspace-action-menu" role="menu">
                                <button type="button" role="menuitem" onClick={() => { setOpenFolderMenuId(null); setShareFolder(folder) }}><Share2 size={16} aria-hidden="true" /> Compartilhar pasta</button>
                                <button className="danger-action" type="button" role="menuitem" onClick={() => void handleArchiveFolder(folder)} disabled={busyAction === `archive-folder-${folder.id}`}><Archive size={16} aria-hidden="true" /> Arquivar pasta</button>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="workspace-empty">
                    <Folder size={32} aria-hidden="true" />
                    <h3>{isAdmin ? 'Vamos organizar seu primeiro projeto' : 'Nenhuma pasta compartilhada ainda'}</h3>
                    <p>{isAdmin
                      ? 'Crie uma pasta com o nome do cliente ou do projeto. Depois, adicione os mapas que fazem parte dele.'
                      : 'Quando o administrador compartilhar um projeto com você, ele aparecerá aqui.'}</p>
                    {isAdmin && <button className="workspace-primary-button" type="button" onClick={() => setShowFolderModal(true)}>Criar primeira pasta</button>}
                  </div>
                )}
              </section>
            )}

            <section className="workspace-section" aria-labelledby="maps-title">
              <div className="workspace-section-heading">
                <div><span>{selectedFolder ? 'Conteúdo da pasta' : 'Trabalho recente'}</span><h2 id="maps-title">{selectedFolder ? 'Mapas' : 'Mapas recentes'}</h2></div>
                <strong>{visibleMaps.length}</strong>
              </div>
              {visibleMaps.length > 0 ? (
                <div className="map-grid">
                  {visibleMaps.map((map) => (
                    <article className="map-card" key={map.id}>
                      <button className="map-preview" type="button" onClick={() => void openMap(map)} aria-label={`Abrir ${map.title}`}>
                        {previews[map.id]
                          ? <img src={previews[map.id]} alt="" />
                          : <span><MapIcon size={31} aria-hidden="true" /> Imagem preparada ao salvar</span>}
                      </button>
                      <div className="map-card-body">
                        <div>
                          <strong>{map.title}</strong>
                          <span>Atualizado em {formatDate(map.updated_at)}</span>
                        </div>
                        <div className="map-card-actions">
                          <button className="workspace-secondary-button" type="button" onClick={() => void openMap(map)} disabled={loadingMapId === map.id}>
                            {loadingMapId === map.id ? <LoaderCircle className="workspace-spinner" size={16} /> : <FolderOpen size={16} />}
                            Abrir
                          </button>
                          <button className="workspace-icon-button" type="button" onClick={() => void handleQuickDownload(map)} disabled={!map.export_path || map.export_revision !== map.revision || busyAction === `download-${map.id}`} aria-label={`Baixar imagem de ${map.title}`} title={map.export_path && map.export_revision === map.revision ? 'Baixar imagem' : 'Abra e salve para preparar a imagem'}>
                            {busyAction === `download-${map.id}` ? <LoaderCircle className="workspace-spinner" size={17} /> : <Download size={17} />}
                          </button>
                          {(isAdmin || map.created_by === member.id) && (
                            <div className="workspace-card-menu">
                              <button className="workspace-icon-button" type="button" onClick={() => {
                                setOpenMapMenuId((current) => current === map.id ? null : map.id)
                                setShowNewMenu(false)
                                setShowAccountMenu(false)
                                setOpenFolderMenuId(null)
                              }} aria-label={`Mais ações para ${map.title}`} aria-expanded={openMapMenuId === map.id}><Ellipsis size={18} aria-hidden="true" /></button>
                              {openMapMenuId === map.id && (
                                <div className="workspace-action-menu map-action-menu" role="menu">
                                  {isAdmin && <button type="button" role="menuitem" onClick={() => { setMoveMapFolderId(map.folder_id); setMapToMove(map); setOpenMapMenuId(null) }}><FolderInput size={16} aria-hidden="true" /> Mover para pasta</button>}
                                  <button className="danger-action" type="button" role="menuitem" onClick={() => void handleArchiveMap(map)} disabled={busyAction === `archive-${map.id}`}><Archive size={16} aria-hidden="true" /> Arquivar mapa</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : selectedFolder && (
                <div className="workspace-empty compact">
                  <FileImage size={31} aria-hidden="true" />
                  <h3>Nenhum mapa nesta pasta</h3>
                  <p>Crie um mapa para começar o trabalho deste projeto.</p>
                  <button className="workspace-primary-button" type="button" onClick={() => openNewMapModal(selectedFolder.id)}>Criar mapa</button>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="workspace-page">
            <div className="workspace-hero">
              <div><span className="workspace-eyebrow">Administração</span><h1>Pessoas e acessos</h1><p>Gerencie quem pode entrar no NXGEO e quais projetos cada pessoa pode visualizar.</p></div>
              <button className="workspace-primary-button" type="button" onClick={() => setShowInviteModal(true)}><UserPlus size={18} /> Convidar pessoa</button>
            </div>
            <section className="people-panel">
              <div className="people-table-header"><span>Pessoa</span><span>Tipo de acesso</span><span>Projetos</span><span>Status</span></div>
              {members.map((target) => {
                const isSelf = target.email === member.email
                return (
                  <div className="person-row" key={target.email}>
                    <div className="person-identity">
                      <div className="person-avatar"><CircleUserRound size={19} aria-hidden="true" /></div>
                      <div><strong>{target.display_name || target.email}</strong><span>{target.email}</span></div>
                    </div>
                    <label>
                      <span className="sr-only">Tipo de acesso de {target.display_name || target.email}</span>
                      <select value={target.role} disabled={isSelf || busyAction === `member-${target.email}`} onChange={(event) => void handleMemberUpdate(target, event.target.value as MemberRole, target.active)}>
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </label>
                    <button className="workspace-secondary-button" type="button" disabled={target.role === 'admin'} onClick={() => setAccessMember({ ...target, folder_ids: [...target.folder_ids] })}>
                      <Folder size={16} /> {target.role === 'admin' ? 'Todos' : `${target.folder_ids.length} pastas`}
                    </button>
                    <label className="workspace-status-switch">
                      <input type="checkbox" checked={target.active} disabled={isSelf || busyAction === `member-${target.email}`} onChange={(event) => void handleMemberUpdate(target, target.role, event.target.checked)} />
                      <span>{target.active ? (target.joined ? 'Ativo' : 'Convidado') : 'Bloqueado'}</span>
                    </label>
                  </div>
                )
              })}
            </section>
          </div>
        )}
      </section>

      {showFolderModal && (
        <Modal title="Nova pasta" description="Use o nome do cliente, do empreendimento ou do projeto." onClose={() => setShowFolderModal(false)}>
          <form className="workspace-form" onSubmit={handleCreateFolder}>
            <label>Nome da pasta<input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Ex.: Residencial Primavera" autoFocus required /></label>
            <label>Descrição <span>opcional</span><textarea value={folderDescription} onChange={(event) => setFolderDescription(event.target.value)} placeholder="Uma frase para identificar este trabalho" /></label>
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => setShowFolderModal(false)}>Cancelar</button><button className="workspace-primary-button" type="submit" disabled={busyAction === 'folder'}>{busyAction === 'folder' ? 'Criando…' : 'Criar pasta'}</button></div>
          </form>
        </Modal>
      )}

      {showMapModal && (
        <Modal title="Novo mapa" description="Dê um nome claro e escolha onde ele ficará salvo." onClose={() => setShowMapModal(false)}>
          <form className="workspace-form" onSubmit={startNewMap}>
            <label>Nome do mapa<input value={newMapTitle} onChange={(event) => setNewMapTitle(event.target.value)} placeholder="Ex.: Levantamento cadastral" autoFocus required /></label>
            <label>Pasta<select value={newMapFolderId} onChange={(event) => setNewMapFolderId(event.target.value)} required><option value="">Escolha uma pasta</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => setShowMapModal(false)}>Cancelar</button><button className="workspace-primary-button" type="submit">Abrir editor</button></div>
          </form>
        </Modal>
      )}

      {showInviteModal && (
        <Modal title="Convidar pessoa" description="Ela receberá um código de acesso por e-mail e não precisará criar senha." onClose={() => setShowInviteModal(false)}>
          <form className="workspace-form" onSubmit={handleInvite}>
            <label>Nome<input value={invite.displayName} onChange={(event) => setInvite((current) => ({ ...current, displayName: event.target.value }))} placeholder="Nome da pessoa" autoFocus required /></label>
            <label>E-mail<input type="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} placeholder="pessoa@empresa.com" required /></label>
            <fieldset className="workspace-role-options"><legend>Tipo de acesso</legend><label><input type="radio" name="role" checked={invite.role === 'user'} onChange={() => setInvite((current) => ({ ...current, role: 'user' }))} /><span><strong>Usuário</strong><small>Trabalha apenas nas pastas compartilhadas.</small></span></label><label><input type="radio" name="role" checked={invite.role === 'admin'} onChange={() => setInvite((current) => ({ ...current, role: 'admin', folderIds: [] }))} /><span><strong>Administrador</strong><small>Vê todos os projetos e gerencia acessos.</small></span></label></fieldset>
            {invite.role === 'user' && <fieldset className="workspace-folder-checks"><legend>Pastas compartilhadas</legend>{folders.length ? folders.map((folder) => <label key={folder.id}><input type="checkbox" checked={invite.folderIds.includes(folder.id)} onChange={(event) => setInvite((current) => ({ ...current, folderIds: event.target.checked ? [...current.folderIds, folder.id] : current.folderIds.filter((id) => id !== folder.id) }))} /><span>{folder.name}</span></label>) : <p>Crie uma pasta antes de compartilhar projetos.</p>}</fieldset>}
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => setShowInviteModal(false)}>Cancelar</button><button className="workspace-primary-button" type="submit" disabled={busyAction === 'invite'}>{busyAction === 'invite' ? 'Enviando…' : 'Enviar convite'}</button></div>
          </form>
        </Modal>
      )}

      {shareFolder && (
        <Modal title="Compartilhar pasta" description={`Quem receber “${shareFolder.name}” poderá abrir e trabalhar nos mapas desta pasta.`} onClose={() => { setShareFolder(null); setShareMemberId('') }}>
          <form className="workspace-form" onSubmit={handleShareFolder}>
            <label>Pessoa
              <select value={shareMemberId} onChange={(event) => setShareMemberId(event.target.value)} required autoFocus>
                <option value="">Escolha uma pessoa</option>
                {members.filter((target) => target.role === 'user' && target.active).map((target) => (
                  <option key={target.id} value={target.id}>{target.display_name || target.email}{target.folder_ids.includes(shareFolder.id) ? ' — já possui acesso' : ''}</option>
                ))}
              </select>
              <span>Administradores já enxergam todos os projetos.</span>
            </label>
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => { setShareFolder(null); setShareMemberId('') }}>Cancelar</button><button className="workspace-primary-button" type="submit" disabled={!shareMemberId || busyAction === `share-folder-${shareFolder.id}`}>{busyAction === `share-folder-${shareFolder.id}` ? 'Compartilhando…' : 'Compartilhar'}</button></div>
          </form>
        </Modal>
      )}

      {mapToMove && (
        <Modal title="Mover mapa" description={`Escolha a pasta que receberá “${mapToMove.title}”. A autoria e o histórico serão preservados.`} onClose={() => { setMapToMove(null); setMoveMapFolderId('') }}>
          <form className="workspace-form" onSubmit={handleMoveMap}>
            <label>Nova pasta
              <select value={moveMapFolderId} onChange={(event) => setMoveMapFolderId(event.target.value)} required autoFocus>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => { setMapToMove(null); setMoveMapFolderId('') }}>Cancelar</button><button className="workspace-primary-button" type="submit" disabled={!moveMapFolderId || moveMapFolderId === mapToMove.folder_id || busyAction === `move-map-${mapToMove.id}`}>{busyAction === `move-map-${mapToMove.id}` ? 'Movendo…' : 'Mover mapa'}</button></div>
          </form>
        </Modal>
      )}

      {accessMember && (
        <Modal title="Pastas compartilhadas" description={`Escolha o que ${accessMember.display_name || accessMember.email} poderá visualizar.`} onClose={() => setAccessMember(null)}>
          <form className="workspace-form" onSubmit={handleFolderAccess}>
            <fieldset className="workspace-folder-checks"><legend>Projetos disponíveis</legend>{folders.map((folder) => <label key={folder.id}><input type="checkbox" checked={accessMember.folder_ids.includes(folder.id)} onChange={(event) => setAccessMember((current) => current ? ({ ...current, folder_ids: event.target.checked ? [...current.folder_ids, folder.id] : current.folder_ids.filter((id) => id !== folder.id) }) : current)} /><span>{folder.name}</span></label>)}</fieldset>
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => setAccessMember(null)}>Cancelar</button><button className="workspace-primary-button" type="submit" disabled={busyAction === `folders-${accessMember.email}`}>Salvar acesso</button></div>
          </form>
        </Modal>
      )}
    </main>
  )
}
