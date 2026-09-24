export type Mode = 'capsule' | 'quick' | 'workspace' | 'hidden'
export type View = 'inbox' | 'favorites' | 'recent' | 'all' | 'archive' | 'trash' | 'project' | 'folder'
export type SaveStatus = 'saved' | 'saving' | 'error'

export interface Project {
  id: string
  name: string
  description: string
  color: string
  icon: string
  createdAt: number
  updatedAt: number
  sortOrder: number
  isArchived: boolean
  isDeleted: boolean
}
export interface Folder {
  id: string
  projectId: string
  name: string
  sortOrder: number
  isDeleted: boolean
}
export interface Note {
  id: string
  title: string
  contentJson: string
  contentText: string
  projectId: string | null
  folderId: string | null
  createdAt: number
  updatedAt: number
  accessedAt: number
  isPinned: boolean
  isArchived: boolean
  isDeleted: boolean
}
export interface NoteSummary {
  id: string
  title: string
  preview: string
  projectId: string | null
  projectName: string | null
  folderId: string | null
  updatedAt: number
  accessedAt: number
  isPinned: boolean
  isArchived: boolean
  isDeleted: boolean
}
export interface NotePatch {
  id: string
  title: string
  contentJson: string
  contentText: string
  projectId: string | null
  folderId: string | null
}
export interface Attachment {
  id: string
  noteId: string
  originalName: string
  path: string
  mimeType: string
  byteSize: number
  createdAt: number
}
export interface Version {
  id: string
  noteId: string
  title: string
  contentJson: string
  contentText: string
  createdAt: number
}
export type Settings = Record<string, string>
