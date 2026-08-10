/** 页面组件测试共享 stub 集合（纯对象，可跨测试文件导入）。
 * 用法：mount(Page, { global: { stubs: pageStubs } })；
 * 需要渲染标题/文案的 stub 通过 props 透传（如 EmptyState 的 title）。 */
export const pageStubs = {
  PageStateBoundary: {
    props: ['state'],
    template: '<div><slot /><button v-if="state === \'error\'" class="psb-retry" @click="$emit(\'retry\')">重试</button></div>',
  },
  Card: { template: '<div class="card"><slot /></div>' },
  EmptyState: { template: '<div><slot />{{ title }}</div>', props: ['type', 'title'] },
  Button: { template: '<button type="button" :disabled="loading || disabled"><slot /></button>', props: ['loading', 'disabled'] },
  StateTag: { template: '<span class="state-tag" />' },
  PermissionGuard: { template: '<div><slot /></div>' },
  HighRiskConfirm: {
    props: ['open', 'confirmLabel', 'cancelLabel', 'executing', 'succeeded', 'errorMessage', 'reauthRequired'],
    template: '<div class="hrc" v-if="open" :data-reauth="reauthRequired === true || reauthRequired === \'true\' ? \'1\' : (reauthRequired == null ? \'1\' : \'0\')"><slot /><slot name="extra" />{{ errorMessage }}<button class="hrc-cancel" @click="$emit(\'cancel\')">{{ cancelLabel || \'取消\' }}</button><button class="hrc-confirm" :disabled="executing" @click="$emit(\'confirm\', reauthRequired === false ? undefined : \'mock-reauth-proof\')">{{ confirmLabel || \'确认\' }}</button></div>',
  },
  NotificationBadge: { template: '<span class="ntf-badge" />' },
  NotificationDetail: { template: '<div class="ntf-detail"><slot /></div>' },
  SyncIndicator: { template: '<span />' },
  FieldPermission: { template: '<span />' },
  AttachmentUpload: { template: '<div />' },
  DateTimePicker: { template: '<div />' },
  RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
}
