<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { PageState } from '@/types/machine'
import { Crown, ArrowRightLeft, UserMinus, AlertTriangle } from '@lucide/vue'

interface AppointMember { id: string; name: string; studentId: string; department: string; title: string; status: string }
interface Dept { id: string; name: string }

const route = useRoute()
const session = useSessionViewStore()
const state = ref<PageState>('loading')
const members = ref<AppointMember[]>([])
const departments = ref<Dept[]>([])
const titles = ref<string[]>([])
const selectedMember = ref<AppointMember | null>(null)
const action = ref<'appoint' | 'transfer' | 'dismiss'>('appoint')
const targetDept = ref('')
const targetTitle = ref('')
const submitting = ref(false)

const actions = [
  { key: 'appoint' as const, label: '任命', icon: Crown, desc: '为成员分配新职位' },
  { key: 'transfer' as const, label: '调岗', icon: ArrowRightLeft, desc: '调整成员所在部门或职位' },
  { key: 'dismiss' as const, label: '免职', icon: UserMinus, desc: '移除成员当前职位' },
]

async function loadData() {
  state.value = 'loading'
  const clubId = route.params.clubId as string
  const result = await get<{ items: AppointMember[]; departments: Dept[]; titles: string[] }>(`/org/${clubId}/members/appointments`)
  if (result.kind === 'completed') {
    members.value = result.data.items
    departments.value = result.data.departments
    titles.value = result.data.titles
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function selectMember(m: AppointMember) {
  selectedMember.value = m
  targetDept.value = m.department
  targetTitle.value = m.title
}

// MEM-008: 免职时检查是否为最后一位负责人
const isLastLeader = computed(() => {
  if (!selectedMember.value || action.value !== 'dismiss') return false
  return selectedMember.value.title === '负责人' &&
    members.value.filter((m) => m.title === '负责人' && m.status === 'active').length <= 1
})

// MEM-008: 不能免职自己
const isSelf = computed(() => {
  return selectedMember.value?.id === session.user?.id
})

const canExecute = computed(() => {
  if (!selectedMember.value) return false
  if (isSelf.value) return false
  if (isLastLeader.value) return false
  return true
})

async function handleExecute() {
  if (!selectedMember.value || !canExecute.value) return
  submitting.value = true
  const clubId = route.params.clubId as string
  const r = await post(`/org/${clubId}/members/appointments`, {
    action: action.value,
    memberIds: [selectedMember.value.id],
  })
  submitting.value = false
  if (r.kind === 'completed') {
    toast.success(action.value === 'appoint' ? '任命成功' : action.value === 'transfer' ? '调岗成功' : '免职成功')
    await loadData()
  } else {
    toast.error('操作失败，请重试')
  }
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="任命调岗免职" @retry="loadData">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold text-text-primary mb-6">任命 / 调岗 / 免职</h1>

      <!-- 操作类型 -->
      <div class="grid grid-cols-3 gap-3 mb-6">
        <button
          v-for="a in actions"
          :key="a.key"
          class="rounded-lg border p-4 text-center transition-colors"
          :class="action === a.key ? 'border-primary bg-primary-subtle' : 'border-border hover:border-border-strong'"
          @click="action = a.key"
        >
          <component :is="a.icon" :size="20" class="mx-auto mb-1" :class="action === a.key ? 'text-primary' : 'text-text-secondary'" />
          <p class="text-sm font-medium" :class="action === a.key ? 'text-primary' : 'text-text-secondary'">{{ a.label }}</p>
        </button>
      </div>

      <div class="grid lg:grid-cols-[1fr_320px] gap-4">
        <!-- 成员列表 -->
        <Card>
          <p class="text-sm font-medium text-text-primary mb-3">选择成员</p>
          <div v-if="members.length === 0" class="text-center py-6 text-sm text-text-secondary">无可操作成员</div>
          <div v-else class="space-y-1 max-h-96 overflow-y-auto">
            <button
              v-for="m in members"
              :key="m.id"
              class="w-full flex items-center justify-between rounded-lg p-2.5 text-left transition-colors"
              :class="selectedMember?.id === m.id ? 'bg-primary-subtle' : 'hover:bg-subtle'"
              @click="selectMember(m)"
            >
              <div>
                <span class="text-sm text-text-primary">{{ m.name }}</span>
                <span class="text-xs text-text-secondary ml-2">{{ m.studentId }}</span>
              </div>
              <span class="text-xs text-text-secondary">{{ m.department }} · {{ m.title }}</span>
            </button>
          </div>
        </Card>

        <!-- 操作面板 -->
        <Card v-if="selectedMember">
          <p class="text-sm font-medium text-text-primary mb-3">{{ actions.find((a) => a.key === action)?.label }} - {{ selectedMember.name }}</p>

          <div v-if="action === 'appoint' || action === 'transfer'" class="space-y-3">
            <div>
              <label class="block text-xs text-text-secondary mb-1">目标部门</label>
              <select v-model="targetDept" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option v-for="d in departments" :key="d.id" :value="d.name">{{ d.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-text-secondary mb-1">目标职位</label>
              <select v-model="targetTitle" class="w-full h-9 px-2 rounded-md border border-border bg-elevated text-sm text-text-primary">
                <option v-for="t in titles" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>

          <div v-else-if="action === 'dismiss'" class="rounded-lg bg-danger-subtle p-3 mb-3">
            <p class="text-xs text-danger">免职后该成员将不再担任当前职位，但保留社团成员身份。</p>
          </div>

          <div v-if="isSelf" class="rounded-lg bg-warning-subtle p-3 mb-3 flex items-center gap-2">
            <AlertTriangle :size="16" class="text-warning" />
            <p class="text-xs text-warning">不能免职自己</p>
          </div>
          <div v-else-if="isLastLeader" class="rounded-lg bg-warning-subtle p-3 mb-3 flex items-center gap-2">
            <AlertTriangle :size="16" class="text-warning" />
            <p class="text-xs text-warning">最后一位负责人，需先交接方可免职</p>
          </div>

          <button class="w-full mt-4 h-9 rounded-md text-sm font-medium text-text-on-primary disabled:opacity-40 disabled:cursor-not-allowed" :class="action === 'dismiss' ? 'bg-danger' : 'bg-primary'" :disabled="!canExecute || submitting" @click="handleExecute">
            {{ submitting ? '处理中...' : '确认' + (actions.find((a) => a.key === action)?.label ?? '') }}
          </button>
        </Card>

        <Card v-else class="flex items-center justify-center py-12">
          <p class="text-sm text-text-secondary">请选择成员</p>
        </Card>
      </div>
    </div>
  </PageStateBoundary>
</template>
