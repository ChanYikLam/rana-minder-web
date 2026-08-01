<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

interface Props {
  status: string
  label?: string
}

const props = defineProps<Props>()

const statusMap: Record<string, { variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'selected'; label: string }> = {
  // 通用
  draft: { variant: 'neutral', label: '草稿' },
  published: { variant: 'info', label: '已发布' },
  archived: { variant: 'neutral', label: '已归档' },
  // 招新活动
  configuring: { variant: 'info', label: '配置中' },
  pending_publish: { variant: 'warning', label: '待发布' },
  paused: { variant: 'warning', label: '已暂停' },
  closed: { variant: 'neutral', label: '已关闭' },
  // 报名通道
  open: { variant: 'success', label: '开放中' },
  opening: { variant: 'info', label: '开放中' },
  closing: { variant: 'warning', label: '关闭中' },
  closed_final: { variant: 'neutral', label: '已截止' },
  // 申请
  submitted: { variant: 'info', label: '已提交' },
  under_review: { variant: 'info', label: '审核中' },
  revision_requested: { variant: 'warning', label: '需修订' },
  revised: { variant: 'info', label: '已修订' },
  withdrawn: { variant: 'neutral', label: '已撤回' },
  rejected: { variant: 'danger', label: '已拒绝' },
  accepted: { variant: 'success', label: '已接受' },
  // 面试
  scheduled: { variant: 'info', label: '已排期' },
  confirmed: { variant: 'success', label: '已确认' },
  in_progress: { variant: 'warning', label: '进行中' },
  completed: { variant: 'success', label: '已完成' },
  cancelled: { variant: 'neutral', label: '已取消' },
  rescheduled: { variant: 'warning', label: '已改期' },
  // 邀请
  sent: { variant: 'info', label: '已发送' },
  pending_acceptance: { variant: 'warning', label: '待接受' },
  pending_casdoor_sync: { variant: 'warning', label: '同步中' },
  effective: { variant: 'success', label: '已生效' },
  failed: { variant: 'danger', label: '失败' },
  expired: { variant: 'neutral', label: '已过期' },
  // 成员
  active: { variant: 'success', label: '正常' },
  suspended: { variant: 'warning', label: '已暂停' },
  exiting: { variant: 'warning', label: '退出中' },
  exited: { variant: 'neutral', label: '已退出' },
  removed: { variant: 'neutral', label: '已移除' },
  // 审计
  approved: { variant: 'success', label: '已批准' },
  executed: { variant: 'success', label: '已执行' },
  // 文件
  uploading: { variant: 'info', label: '上传中' },
  uploaded: { variant: 'info', label: '已上传' },
  checking: { variant: 'warning', label: '检查中' },
  quarantined: { variant: 'danger', label: '已隔离' },
  // 导出
  pending: { variant: 'warning', label: '排队中' },
  generating: { variant: 'info', label: '生成中' },
  downloaded: { variant: 'success', label: '已下载' },
}

const config = computed(() => {
  const c = statusMap[props.status]
  return c || { variant: 'neutral' as const, label: props.label || props.status }
})
</script>

<template>
  <StatusBadge :variant="config.variant" :label="config.label" />
</template>
