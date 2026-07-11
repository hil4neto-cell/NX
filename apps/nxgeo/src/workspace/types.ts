export type MemberRole = 'admin' | 'user'

export type WorkspaceMember = {
  id: string
  email: string
  display_name: string
  role: MemberRole
  active: boolean
  user_id: string | null
  joined: boolean
  folder_ids: string[]
  created_at: string
  last_sign_in_at?: string | null
}

export type CurrentMember = WorkspaceMember & {
  user_id: string | null
}

export type WorkspaceFolder = {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type WorkspaceMap = {
  id: string
  folder_id: string
  title: string
  project_path: string
  thumbnail_path: string | null
  export_path: string | null
  revision: number
  export_revision: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type MapPreview = Record<string, string>

export type SaveMapInput<TProject> = {
  id: string
  folderId: string
  title: string
  project: TProject
  currentRevision: number
}

export type SaveMapExportInput = {
  id: string
  exportImage: Blob
  revision: number
}

export type InviteMemberInput = {
  email: string
  displayName: string
  role: MemberRole
  folderIds: string[]
}
