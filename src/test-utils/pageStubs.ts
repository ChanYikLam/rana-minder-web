/** 页面组件测试共享 stub 集合（纯对象，可跨测试文件导入）。
 * 用法：mount(Page, { global: { stubs: pageStubs } })；
 * 需要渲染标题/文案的 stub 通过 props 透传（如 EmptyState 的 title）。 */
export const pageStubs = {
  PageStateBoundary: { template: '<div><slot /></div>' },
  Card: { template: '<div class="card"><slot /></div>' },
  EmptyState: { template: '<div><slot />{{ title }}</div>', props: ['type', 'title'] },
  Button: { template: '<button type="button" :disabled="loading || disabled"><slot /></button>', props: ['loading', 'disabled'] },
  StateTag: { template: '<span class="state-tag" />' },
  PermissionGuard: { template: '<div><slot /></div>' },
  HighRiskConfirm: {
    props: ['open', 'confirmLabel', 'executing', 'errorMessage'],
    template: '<div class="hrc" v-if="open"><slot />{{ errorMessage }}<button class="hrc-confirm" :disabled="executing" @click="$emit(\'confirm\')">{{ confirmLabel || \'确认\' }}</button></div>',
  },
  NotificationBadge: { template: '<span class="ntf-badge" />' },
  NotificationDetail: { template: '<div class="ntf-detail"><slot /></div>' },
  SyncIndicator: { template: '<span />' },
  FieldPermission: { template: '<span />' },
  AttachmentUpload: { template: '<div />' },
  DateTimePicker: { template: '<div />' },
}

/** 页面测试通用 mock 工厂：vi.hoisted 后作为 vi.mock 工厂的数据源 */
export interface PageMocks {
  mockGet: ReturnType<typeof vi.fn>
  mockPost: ReturnType<typeof vi.fn>
  mockPut: ReturnType<typeof vi.fn>
  mockDel: ReturnType<typeof vi.fn>
  mockPush: ReturnType<typeof vi.fn>
  mockBack: ReturnType<typeof vi.fn>
}

import { vi } from 'vitest'

export function createPageMocks(): PageMocks {
  return {
    mockGet: vi.fn(),
    mockPost: vi.fn(),
    mockPut: vi.fn(),
    mockDel: vi.fn(),
    mockPush: vi.fn(),
    mockBack: vi.fn(),
  }
}
