<script setup lang="ts">
import { ref, computed } from 'vue'
import { CalendarDays, List, AlertTriangle } from '@lucide/vue'

export interface ScheduleSlot {
  id: string
  title: string
  startAt: string
  endAt: string
  location?: string
  interviewer?: string
  conflictWith?: string
}

const props = defineProps<{
  items: ScheduleSlot[]
  mode?: 'calendar' | 'list'
}>()

const mode = ref<'calendar' | 'list'>(props.mode || 'list')

interface NormalizedSlot extends ScheduleSlot {
  start: Date
  end: Date
}

const normalized = computed<NormalizedSlot[]>(() =>
  props.items.map((it) => ({
    ...it,
    start: new Date(it.startAt),
    end: new Date(it.endAt),
  })),
)

/** 冲突检测：同一面试官在同一时间段内的排期视为冲突（由服务端预计算 result 标记亦可） */
const conflicts = computed(() => {
  const out = new Set<string>()
  for (let i = 0; i < normalized.value.length; i++) {
    for (let j = i + 1; j < normalized.value.length; j++) {
      const a = normalized.value[i]
      const b = normalized.value[j]
      if (a.id === b.id) continue
      if (a.interviewer && a.interviewer === b.interviewer && a.start < b.end && b.start < a.end) {
        out.add(a.id)
        out.add(b.id)
      }
    }
  }
  return out
})

const weekDays = computed(() => {
  const days = new Map<string, NormalizedSlot[]>()
  for (const it of normalized.value) {
    const key = it.start.toDateString()
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(it)
  }
  return Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b))
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm font-medium text-text-primary">面试日程</p>
      <div class="flex rounded-md border border-border overflow-hidden" role="tablist" aria-label="视图切换">
        <button
          type="button"
          role="tab"
          class="px-3 py-1.5 text-xs flex items-center gap-1"
          :class="mode === 'list' ? 'bg-primary text-text-on-primary' : 'text-text-secondary hover:bg-subtle'"
          :aria-selected="mode === 'list'"
          @click="mode = 'list'"
        >
          <List :size="14" aria-hidden="true" /> 列表
        </button>
        <button
          type="button"
          role="tab"
          class="px-3 py-1.5 text-xs flex items-center gap-1"
          :class="mode === 'calendar' ? 'bg-primary text-text-on-primary' : 'text-text-secondary hover:bg-subtle'"
          :aria-selected="mode === 'calendar'"
          @click="mode = 'calendar'"
        >
          <CalendarDays :size="14" aria-hidden="true" /> 日历
        </button>
      </div>
    </div>

    <div v-if="mode === 'list'" class="space-y-2" role="list">
      <div
        v-for="it in normalized"
        :key="it.id"
        class="rounded-md border border-border bg-elevated px-3 py-2"
        :class="conflicts.has(it.id) ? 'border-danger' : (it.conflictWith ? 'border-danger/60' : '')"
        role="listitem"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-text-primary">{{ it.title }}</p>
          <span
            v-if="conflicts.has(it.id) || it.conflictWith"
            class="flex items-center gap-1 text-xs text-danger"
            role="alert"
          >
            <AlertTriangle :size="13" aria-hidden="true" />
            时间冲突
          </span>
        </div>
        <p class="text-xs text-text-secondary mt-0.5">
          {{ it.start.toLocaleString('zh-CN') }} – {{ it.end.toTimeString().slice(0, 5) }}
          <template v-if="it.location"> · {{ it.location }}</template>
          <template v-if="it.interviewer"> · 面试官：{{ it.interviewer }}</template>
        </p>
      </div>
      <p v-if="normalized.length === 0" class="py-6 text-sm text-text-secondary text-center">暂无排期</p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="[day, slots] in weekDays" :key="day" class="rounded-md border border-border">
        <p class="px-3 py-1.5 text-xs font-medium text-text-secondary bg-subtle border-b border-border">
          {{ new Date(day).toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' }) }}
        </p>
        <div class="p-2 space-y-1.5">
          <div
            v-for="it in slots"
            :key="it.id"
            class="px-2 py-1.5 rounded bg-elevated text-sm flex items-center justify-between gap-2"
            :class="conflicts.has(it.id) || it.conflictWith ? 'bg-danger-subtle' : ''"
          >
            <span class="text-text-primary">{{ it.start.toTimeString().slice(0, 5) }} {{ it.title }}</span>
            <span v-if="conflicts.has(it.id) || it.conflictWith" class="text-xs text-danger shrink-0">冲突</span>
          </div>
        </div>
      </div>
      <p v-if="weekDays.length === 0" class="py-6 text-sm text-text-secondary text-center">暂无可用于日历展示的排期</p>
    </div>
  </div>
</template>