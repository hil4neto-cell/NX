import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Archive,
  ArrowLeft,
  Download,
  FileImage,
  Folder,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Map as MapIcon,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import type { SavedProject } from './App'
import PwaInstall from './PwaInstall'
import { supabase } from './supabase'
import {
  archiveMap,
  createFolder,
  createMapPreviewUrls,
  downloadMapExport,
  inviteMember,
  listMembers,
  loadMapProject,
  loadWorkspace,
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
  const [accessMember, setAccessMember] = useState<WorkspaceMember | null>(null)
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
    if (!window.confirm(`Mover “${map.title}” para a lixeira?`)) return
    setBusyAction(`archive-${map.id}`)
    setError('')
    try {
      await archiveMap(map.id)
      setMaps((current) => current.filter((item) => item.id !== map.id))
      setNotice('Mapa movido para a lixeira.')
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
      setNotice('Convite enviado. A pessoa receberá um link seguro por e-mail.')
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
          <button className={view === 'home' ? 'active' : ''} type="button" onClick={() => {
            setView('home')
            setSelectedFolderId(null)
          }}>
            <LayoutDashboard size={18} aria-hidden="true" /> Início
          </button>
          <div className="workspace-nav-label">Pastas</div>
          <button className={view === 'home' && selectedFolderId === null ? 'active subtle' : 'subtle'} type="button" onClick={() => {
            setView('home')
            setSelectedFolderId(null)
          }}>
            <FolderOpen size={18} aria-hidden="true" /> Todas as pastas
          </button>
          {folders.slice(0, 8).map((folder) => (
            <button key={folder.id} className={selectedFolderId === folder.id ? 'active subtle' : 'subtle'} type="button" onClick={() => {
              setView('home')
              setSelectedFolderId(folder.id)
            }}>
              <Folder size={18} aria-hidden="true" /> <span>{folder.name}</span>
            </button>
          ))}
          {isAdmin && (
            <>
              <div className="workspace-nav-label">Administração</div>
              <button className={view === 'people' ? 'active' : ''} type="button" onClick={() => setView('people')}>
                <Users size={18} aria-hidden="true" /> Pessoas e acessos
              </button>
            </>
          )}
        </nav>

        <div className="workspace-account">
          <div className="workspace-avatar">{firstName(member.display_name, member.email).slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{member.display_name || member.email}</strong>
            <span>{member.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
          </div>
          <button className="workspace-icon-button" type="button" onClick={() => void supabase.auth.signOut()} aria-label="Sair do NXGEO" title="Sair">
            <LogOut size={18} aria-hidden="true" />
          </button>
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
          <button className="workspace-primary-button" type="button" onClick={() => openNewMapModal()} disabled={folders.length === 0}>
            <Plus size={18} aria-hidden="true" /> Novo mapa
          </button>
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
                <span className="workspace-eyebrow">NXGEO</span>
                <h1>{selectedFolder ? selectedFolder.name : `Olá, ${firstName(member.display_name, member.email)}`}</h1>
                <p>{selectedFolder
                  ? (selectedFolder.description || 'Mapas e arquivos deste projeto estão reunidos aqui.')
                  : 'Seus projetos, mapas e imagens de trabalho estão organizados em um só lugar.'}</p>
              </div>
              <div className="workspace-hero-actions">
                {isAdmin && !selectedFolder && (
                  <button className="workspace-secondary-button" type="button" onClick={() => setShowFolderModal(true)}>
                    <Folder size={18} aria-hidden="true" /> Nova pasta
                  </button>
                )}
                {selectedFolder && (
                  <button className="workspace-primary-button" type="button" onClick={() => openNewMapModal(selectedFolder.id)}>
                    <Plus size={18} aria-hidden="true" /> Novo mapa
                  </button>
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
                      <button className="folder-card" key={folder.id} type="button" onClick={() => setSelectedFolderId(folder.id)}>
                        <div className="folder-icon"><Folder size={25} aria-hidden="true" /></div>
                        <div>
                          <strong>{folder.name}</strong>
                          <span>{mapCountByFolder[folder.id] ?? 0} {(mapCountByFolder[folder.id] ?? 0) === 1 ? 'mapa' : 'mapas'}</span>
                        </div>
                        <ArrowLeft className="folder-arrow" size={18} aria-hidden="true" />
                      </button>
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
                          <button className="workspace-icon-button danger" type="button" onClick={() => void handleArchiveMap(map)} disabled={busyAction === `archive-${map.id}`} aria-label={`Mover ${map.title} para a lixeira`} title="Mover para a lixeira">
                            <Archive size={17} />
                          </button>
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
                      <div className="workspace-avatar">{firstName(target.display_name, target.email).slice(0, 1).toUpperCase()}</div>
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
        <Modal title="Convidar pessoa" description="Ela receberá um link seguro e não precisará criar senha." onClose={() => setShowInviteModal(false)}>
          <form className="workspace-form" onSubmit={handleInvite}>
            <label>Nome<input value={invite.displayName} onChange={(event) => setInvite((current) => ({ ...current, displayName: event.target.value }))} placeholder="Nome da pessoa" autoFocus required /></label>
            <label>E-mail<input type="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} placeholder="pessoa@empresa.com" required /></label>
            <fieldset className="workspace-role-options"><legend>Tipo de acesso</legend><label><input type="radio" name="role" checked={invite.role === 'user'} onChange={() => setInvite((current) => ({ ...current, role: 'user' }))} /><span><strong>Usuário</strong><small>Trabalha apenas nas pastas compartilhadas.</small></span></label><label><input type="radio" name="role" checked={invite.role === 'admin'} onChange={() => setInvite((current) => ({ ...current, role: 'admin', folderIds: [] }))} /><span><strong>Administrador</strong><small>Vê todos os projetos e gerencia acessos.</small></span></label></fieldset>
            {invite.role === 'user' && <fieldset className="workspace-folder-checks"><legend>Pastas compartilhadas</legend>{folders.length ? folders.map((folder) => <label key={folder.id}><input type="checkbox" checked={invite.folderIds.includes(folder.id)} onChange={(event) => setInvite((current) => ({ ...current, folderIds: event.target.checked ? [...current.folderIds, folder.id] : current.folderIds.filter((id) => id !== folder.id) }))} /><span>{folder.name}</span></label>) : <p>Crie uma pasta antes de compartilhar projetos.</p>}</fieldset>}
            <div className="workspace-form-actions"><button className="workspace-secondary-button" type="button" onClick={() => setShowInviteModal(false)}>Cancelar</button><button className="workspace-primary-button" type="submit" disabled={busyAction === 'invite'}>{busyAction === 'invite' ? 'Enviando…' : 'Enviar convite'}</button></div>
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
