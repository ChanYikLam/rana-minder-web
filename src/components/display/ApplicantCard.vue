<script setup lang="ts">
import { computed } from 'vue'
import { Building2, CalendarDays } from '@lucide/vue'

export interface ApplicantPref {
  order: number
  departmentName: string
}

export interface ApplicantInterview {
  id: string
  roundName: string
  status: string
  score?: number
}

export interface ApplicantEntry {
  id: string
  name: string
  studentId: string
  status: string
  preferences: ApplicantPref[]
  interviews?: ApplicantInterview[]
  appliedAt?: string
}

const props = defineProps<{ applicant: ApplicantEntry }>()

const statusLabel = computed<{ label: string; cls: string }>(() => {
  const map: Record<string, string> = {
    draft: '草稿', submitted: '已提交', revision_requested: '需修订',
    identity_anomaly: '身份异常', not_qualified: '未通过', accepted: '已接受',
  }
  const cls: Record<string, string> = {
    draft: 'bg-subtle text-text-secondary',
    submitted: 'bg-info-subtle text-info',
    revision_requested: 'bg-warning-subtle text-warning',
    identity_anomaly: 'bg-danger-subtle text-danger',
    not_qualified: 'bg-neutral-subtle text-text-secondary',
    accepted: 'bg-success-subtle text-success',
  }
  return { label: map[props.applicant.status] ?? props.applicant.status, cls: cls[props.applicant.status] ?? 'bg-subtle text-text-secondary' }
})
</script>

<template>
  <div class="rounded-lg border border-border bg-elevated p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <div class="flex items-center justify-center w-9 h-9 rounded-full bg-primary-subtle text-primary text-sm font-medium shrink-0">
          {{ (applicant.name || '?').charAt(0) }}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-text-primary truncate">{{ applicant.name }}</p>
          <p class="text-xs text-text-secondary">{{ applicant.studentId }}</p>
        </div>
      </div>
      <span class="text-xs px-2 py-0.5 rounded-full shrink-0" :class="statusLabel.cls">{{ statusLabel.label }}</span>
    </div>

    <div class="mt-3 space-y-2">
      <div class="flex items-start gap-1.5 text-sm">
        <Building2 :size="14" class="mt-0.5 text-text-secondary shrink-0" aria-hidden="true" />
        <div class="flex flex-wrap gap-1">
          <span
            v-for="p in applicant.preferences"
            :key="p.order"
            class="text-xs rounded px-1.5 py-0.5 border border-border"
          >
            {{ p.order }}. {{ p.departmentName }}
          </span>
        </div>
      </div>

      <div v-if="applicant.interviews?.length" class="flex items-start gap-1.5 text-xs">
        <CalendarDays :size="14" class="mt-0.5 text-text-secondary shrink-0" aria-hidden="true" />
        <ul class="space-y-0.5">
          <li v-for="iv in applicant.interviews" :key="iv.id" class="text-text-secondary">
            {{ iv.roundName }} · {{ iv.status }}<template v-if="iv.score != null"> · {{ iv.score }} 分</template>
          </li>
        </ul>
      </div>

      <div v-if="applicant.appliedAt" class="flex items-center gap-1.5 text-xs text-text-secondary">
        <CalendarDays :size="14" aria-hidden="true" />
        报名于 {{ applicant.appliedAt }}
      </div>
    </div>
  </div>
</template>