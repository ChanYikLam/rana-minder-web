/** 领域模型类型 - 动态表单与附件 */

export interface FormDefinition {
  id: string
  clubId: string | null
  title: string
  description: string
  status: FormStatus
  versions: FormVersion[]
}

export type FormStatus = 'draft' | 'published' | 'deprecated' | 'archived'

export interface FormVersion {
  version: number
  status: 'draft' | 'published' | 'deprecated'
  publishedAt: string | null
  fields: FormField[]
}

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  description: string | null
  required: boolean
  readonly: boolean
  permission: 'read_write' | 'read_only' | 'hidden'
  options: string[] | null
  conditionalFieldId: string | null
  conditionalValue: string | null
  arrayFieldTemplateId: string | null
}

export type FormFieldType = 'text' | 'textarea' | 'number' | 'select' | 'multi_select' | 'radio' | 'checkbox' | 'date' | 'datetime' | 'file' | 'image' | 'array'

export interface FileMeta {
  id: string
  name: string
  size: number
  mimeType: string
  status: FileStatus
  uploadedAt: string
  checkedAt: string | null
  downloadUrl: string | null
}

export type FileStatus = 'uploading' | 'uploaded' | 'checking' | 'quarantined' | 'approved' | 'rejected' | 'deleted'
