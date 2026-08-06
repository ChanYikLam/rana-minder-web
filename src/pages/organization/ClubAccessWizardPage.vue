<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { PageStateBoundary, Card } from '@/components/common'
import { NameSearch, type SearchResult } from '@/components/form'
import { get, post } from '@/services/client'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { toast } from 'vue-sonner'
import type { PageState } from '@/types/machine'
import type { GroupNode, ClubAccessItem } from '@/types/domain/organization'
import { Users, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, ArrowRight, FolderTree } from '@lucide/vue'

type GroupRow = GroupNode & { match?: string; score?: number }

interface GroupDetail {
  id: string
  name: string
  stableId: string
  path: string
  purpose: GroupNode['purpose']
  boundClubId: string | null
  members: { id: string; name: string }[]
  leaderGroups: GroupNode[]
  departments: GroupNode[]
  positions: GroupNode[]
}

const router = useRouter()

type Step = 'group' | 'info' | 'structure' | 'validate' | 'done'

const STEP_LABELS: Record<Step, string> = {
  group: '选择 Group',
  info: '基本信息',
  structure: '部门与职位',
  validate: '校验',
  done: '完成',
}

const state = ref<PageState>('loading')
const step = ref<Step>('group')
const keyword = ref('')
const searchResults = ref<SearchResult[]>([])
const searchFailed = ref(false)
const selectedGroup = ref<GroupDetail | null>(null)
const candidateGroups = ref<GroupRow[]>([])

const form = ref({
  name: '',
  description: '',
  email: '',
  deptGroups: [] as string[],
  roleGroups: [] as string[],
  leaderRoleGroup: '',
})

const existingClubs = ref<ClubAccessItem[]>([])
const deptCandidates = ref<GroupNode[]>([])
const roleCandidates = ref<GroupNode[]>([])
const importing = ref(false)
const submitted = ref<{ id: string; status: string } | null>(null)

const previewMembers = computed(() => (selectedGroup.value?.members ?? []).slice(0, 5))

const checks = computed(() => {
  const list: { label: string; ok: boolean; detail: string }[] = []
  const g = selectedGroup.value
  list.push({ label: 'Group 存在且为社团级', ok: !!g && g.purpose === 'club', detail: g ? `${g.path}（${g.purpose}）` : '未选择' })
  list.push({ label: '无重复绑定', ok: !!g && !g.boundClubId, detail: g?.boundClubId ? `已绑定 ${g.boundClubId}` : '未绑定' })
  list.push({ label: '名称唯一', ok: !!form.value.name.trim() && !existingClubs.value.some((c) => c.clubName === form.value.name.trim()), detail: form.value.name.trim() || '未填写' })
  const leader = roleCandidates.value.find((r) => r.id === form.value.leaderRoleGroup)
  const leaderInTree = !!g && !!leader && leader.parentId === g.id
  list.push({ label: '负责人职位已指定且在层级下', ok: !!g && leaderInTree, detail: leader ? `${leader.name}（${leader.path}）` : '未指定' })
  list.push({ label: '负责人职位有效（≥1 名负责人）', ok: !!g && leaderInTree && leader!.memberCount >= 1, detail: leader ? `成员 ${leader.memberCount} 名` : '-' })
  const deptOk = form.value.deptGroups.every((id) => deptCandidates.value.some((d) => d.id === id))
  list.push({ label: '部门 Group 层级正确', ok: deptOk, detail: `${form.value.deptGroups.length} 个已选` })
  const roleOk = form.value.roleGroups.every((id) => roleCandidates.value.some((r) => r.id === id))
  list.push({ label: '职位 Group 层级正确', ok: roleOk, detail: `${form.value.roleGroups.length} 个已选` })
  return list
})

const allPass = computed(() => checks.value.every((c) => c.ok))

async function loadInitial() {
  state.value = 'loading'
  const [groups, clubs] = await Promise.all([
    get<{ items: GroupRow[] }>('/admin/groups'),
    get<{ items: ClubAccessItem[] }>('/admin/clubs'),
  ])
  if (groups.kind === 'completed' && clubs.kind === 'completed') {
    candidateGroups.value = (groups as { kind: 'completed'; data: { items: GroupRow[] } }).data.items
    existingClubs.value = (clubs as { kind: 'completed'; data: { items: ClubAccessItem[] } }).data.items
    schedule('')
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

function toSearchResult(g: GroupRow): SearchResult {
  const bound = g.boundClubId ? ` · 已绑定 ${g.boundClubId}` : ''
  return {
    id: g.id,
    name: g.name,
    subtitle: `${g.path} · ${g.memberCount} 名成员${bound}`,
    group: g.purpose === 'club' ? '社团级 Group' : g.purpose === 'department' ? '部门级' : '职位级',
    match: 'exact',
    score: 0,
  }
}

const { searching, schedule, seq } = useDebouncedSearch({
  onSearch: async (kw) => {
    if (!kw) {
      searchResults.value = candidateGroups.value.filter((g) => g.purpose === 'club').map(toSearchResult)
      searchFailed.value = false
      return
    }
    searchFailed.value = false
    const mySeq = seq.value
    const result = await get<{ items: GroupRow[] }>('/admin/groups/search', { q: kw })
    if (mySeq !== seq.value) return
    if (result.kind === 'completed') {
      const data = (result as { kind: 'completed'; data: { items: GroupRow[] } }).data
      searchResults.value = data.items.map(toSearchResult)
      searchFailed.value = false
    } else {
      // 搜索失败（非 completed）：清空旧结果避免残留误导，与其余两处保持一致
      searchResults.value = []
      searchFailed.value = true
    }
  },
})

// 输入 300ms 防抖；清空关键字立即重置并作废在途请求
watch(keyword, (kw) => schedule(kw))

async function onSelectGroup(r: SearchResult) {
  const detail = await get<GroupDetail>('/admin/groups/' + r.id)
  if (detail.kind !== 'completed') return
  selectedGroup.value = (detail as { kind: 'completed'; data: GroupDetail }).data
  form.value.name = form.value.name || selectedGroup.value.name
  deptCandidates.value = selectedGroup.value.departments
  roleCandidates.value = selectedGroup.value.positions
}

async function submit() {
  importing.value = true
  const result = await post<{ id: string; status: string }>('/admin/clubs/wizard', {
    groupId: selectedGroup.value?.id,
    name: form.value.name,
    description: form.value.description,
    leaderGroupId: form.value.leaderRoleGroup,
  })
  importing.value = false
  if (result.kind === 'completed') {
    submitted.value = (result as { kind: 'completed'; data: { id: string; status: string } }).data
    step.value = 'done'
    toast.success('接入条目已创建')
  } else {
    toast.error('提交失败：请返回校验页修正')
  }
}

function canNext(stepName: Step): boolean {
  if (stepName === 'group') return !!selectedGroup.value
  if (stepName === 'info') return !!form.value.name.trim()
  if (stepName === 'structure') return form.value.roleGroups.length > 0 && !!form.value.leaderRoleGroup
  return false
}

onMounted(loadInitial)
</script>

<template>
  <PageStateBoundary :state="state" title="新社团接入" @retry="loadInitial">
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center gap-2 mb-4">
        <FolderTree :size="20" class="text-primary" />
        <h1 class="text-2xl font-bold text-text-primary">新社团接入向导</h1>
      </div>

      <div class="flex items-center gap-2 mb-6 text-sm">
        <span
          v-for="(label, s) in STEP_LABELS"
          :key="s"
          class="px-3 py-1 rounded-full border"
          :class="step === s ? 'border-primary text-primary bg-primary-subtle font-medium' : 'border-border text-text-secondary'"
        >
          {{ label }}
        </span>
      </div>

      <!-- Step 1: 选择 Group -->
      <Card v-if="step === 'group'">
        <p class="text-sm font-medium text-text-primary mb-1">选择社团 Casdoor Group</p>
        <p class="text-xs text-text-secondary mb-3">仅社团级 Group 可接入；搜索按 精确 → 子串 → 近似 分层返回（近似需 ≥3 个有效字符）。</p>
        <NameSearch
          v-model="keyword"
          :results="searchResults"
          :loading="searching"
          placeholder="输入 Group 名称或路径搜索"
          @select="onSelectGroup"
        />
        <div v-if="selectedGroup" class="mt-4 rounded-md border border-success/40 bg-success-subtle/40 p-3">
          <p class="text-sm font-medium text-text-primary flex items-center gap-2">
            <CheckCircle2 :size="16" class="text-success" /> 已选择 {{ selectedGroup.name }}
          </p>
          <p class="text-xs text-text-secondary mt-1">{{ selectedGroup.path }} · {{ selectedGroup.members.length }} 名成员</p>
        </div>
        <p v-if="searchFailed" class="mt-2 text-xs text-danger" role="alert">Group 搜索失败，请重试</p>
        <p v-else-if="searchResults.length === 0 && keyword.trim() && !searching" class="mt-2 text-xs text-text-secondary">
          无匹配 Group：需满足社团级层级且未重复绑定；部门/职位级 Group 不可作为社团接入。
        </p>
      </Card>

      <!-- Step 2: 基本信息 -->
      <Card v-else-if="step === 'info'">
        <p class="text-sm font-medium text-text-primary mb-3">配置社团展示资料</p>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">社团名称 *</label>
            <input
              v-model="form.name"
              class="w-full rounded-md border border-border bg-elevated px-3 h-10 text-sm text-text-primary focus:border-primary focus:outline-none"
              placeholder="展示名称，默认取 Group 名称"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">社团简介</label>
            <textarea
              v-model="form.description"
              rows="3"
              class="w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              placeholder="面向学生的公开介绍"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">联系邮箱（可选）</label>
            <input
              v-model="form.email"
              class="w-full rounded-md border border-border bg-elevated px-3 h-10 text-sm text-text-primary focus:border-primary focus:outline-none"
              placeholder="未配置邮件密钥时仅支持站内信"
            />
          </div>
        </div>
      </Card>

      <!-- Step 3: 部门与职位 -->
      <Card v-else-if="step === 'structure'">
        <p class="text-sm font-medium text-text-primary mb-1">配置部门与职位 Group</p>
        <p class="text-xs text-text-secondary mb-4">部门与职位 Group 必须位于所选社团层级之下；负责人职位启用前必须存在至少 1 名有效负责人。</p>

        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <p class="text-xs font-medium text-text-secondary mb-2">部门 Group（可多选）</p>
            <div class="space-y-2 max-h-56 overflow-y-auto">
              <label
                v-for="d in deptCandidates"
                :key="d.id"
                class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 cursor-pointer text-sm hover:bg-subtle"
                :class="form.deptGroups.includes(d.id) ? 'border-primary bg-primary-subtle' : ''"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    class="accent-primary shrink-0"
                    :checked="form.deptGroups.includes(d.id)"
                    @change="
                      form.deptGroups.includes(d.id)
                        ? form.deptGroups.splice(form.deptGroups.indexOf(d.id), 1)
                        : form.deptGroups.push(d.id)
                    "
                  />
                  <span class="truncate">{{ d.name }}</span>
                </span>
                <span class="text-xs text-text-secondary shrink-0">{{ d.memberCount }} 人</span>
              </label>
              <p v-if="deptCandidates.length === 0" class="text-xs text-text-secondary">该 Group 下暂无部门级 Group</p>
            </div>
          </div>

          <div>
            <p class="text-xs font-medium text-text-secondary mb-2">职位 Group（可多选）</p>
            <div class="space-y-2 max-h-56 overflow-y-auto">
              <label
                v-for="r in roleCandidates"
                :key="r.id"
                class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 cursor-pointer text-sm hover:bg-subtle"
                :class="form.roleGroups.includes(r.id) ? 'border-primary bg-primary-subtle' : ''"
              >
                <span class="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    class="accent-primary shrink-0"
                    :checked="form.roleGroups.includes(r.id)"
                    @change="
                      form.roleGroups.includes(r.id)
                        ? form.roleGroups.splice(form.roleGroups.indexOf(r.id), 1)
                        : form.roleGroups.push(r.id)
                    "
                  />
                  <span class="truncate">{{ r.name }}</span>
                </span>
                <span class="text-xs text-text-secondary shrink-0">{{ r.memberCount }} 人</span>
              </label>
              <p v-if="roleCandidates.length === 0" class="text-xs text-text-secondary">该 Group 下暂无职位级 Group</p>
            </div>
          </div>
        </div>

        <div class="mt-4">
          <p class="text-xs font-medium text-text-secondary mb-2">负责人职位 Group *</p>
          <select
            v-model="form.leaderRoleGroup"
            class="w-full rounded-md border border-border bg-elevated px-3 h-10 text-sm text-text-primary focus:border-primary focus:outline-none"
          >
            <option value="">请选择负责人职位</option>
            <option v-for="r in roleCandidates" :key="r.id" :value="r.id">
              {{ r.name }}（{{ r.memberCount }} 名成员）
            </option>
          </select>
        </div>

        <div class="mt-4 rounded-md border border-border p-3">
          <p class="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1.5"><Users :size="14" /> 成员关系预览</p>
          <p class="text-xs text-text-secondary">
            接入后 {{ selectedGroup?.members.length ?? 0 }} 名现有成员成为社团成员关系：
          </p>
          <ul class="mt-2 space-y-1">
            <li v-for="m in previewMembers" :key="m.id" class="text-sm text-text-secondary flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-warning" /> {{ m.name }}
            </li>
          </ul>
        </div>
      </Card>

      <!-- Step 4: 校验 -->
      <Card v-else-if="step === 'validate'">
        <p class="text-sm font-medium text-text-primary mb-1">接入前校验</p>
        <p class="text-xs text-text-secondary mb-4">任一步骤失败将保持未启用，不产生部分生效的权限；通过后创建接入任务（无审批环节，启用需在「社团接入管理」完成）。</p>
        <ul class="space-y-2">
          <li
            v-for="c in checks"
            :key="c.label"
            class="flex items-center justify-between gap-2 text-sm rounded-md border border-border px-3 py-2"
          >
            <span class="flex items-center gap-2">
              <CheckCircle2 v-if="c.ok" :size="16" class="text-success shrink-0" />
              <XCircle v-else :size="16" class="text-danger shrink-0" />
              <span class="text-text-primary">{{ c.label }}</span>
            </span>
            <span class="text-xs text-text-secondary shrink-0">{{ c.detail }}</span>
          </li>
        </ul>
        <div v-if="!allPass" class="mt-4 flex items-center gap-2 text-xs text-warning bg-warning-subtle rounded-md px-3 py-2">
          <AlertTriangle :size="14" /> 存在未通过的校验项，请返回修正
        </div>
      </Card>

      <!-- Step 5: 完成 -->
      <Card v-else-if="step === 'done'">
        <div class="flex flex-col items-center py-8 text-center">
          <CheckCircle2 :size="40" class="text-success mb-3" />
          <p class="text-lg font-semibold text-text-primary mb-1">接入条目已创建</p>
          <p class="text-sm text-text-secondary">
            {{ form.name }}（{{ submitted?.id }}）已进入接入流程（待启用），无审批环节；请在「社团接入管理」中完成成员导入并启用，
            启用后出现在公开社团目录。
          </p>
          <button
            class="mt-4 px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium hover:opacity-90"
            @click="router.push('/admin/clubs')"
          >
            前往社团接入管理
          </button>
        </div>
      </Card>

      <div v-if="step !== 'done'" class="mt-4 flex items-center justify-between">
        <button
          v-if="step !== 'group'"
          class="flex items-center gap-1 px-4 py-2 rounded-md border border-border text-text-primary text-sm hover:bg-elevated"
          @click="step = step === 'info' ? 'group' : step === 'structure' ? 'info' : 'structure'"
        >
          <ArrowLeft :size="14" /> 上一步
        </button>
        <span v-else />
        <button
          v-if="step === 'validate'"
          class="flex items-center gap-1 px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium disabled:opacity-50"
          :disabled="!allPass || importing"
          @click="submit"
        >
          {{ importing ? '创建中...' : '创建接入任务' }} <ArrowRight :size="14" />
        </button>
        <button
          v-else
          class="flex items-center gap-1 px-4 py-2 rounded-md bg-primary text-text-on-primary text-sm font-medium disabled:opacity-50"
          :disabled="!canNext(step)"
          @click="step = step === 'group' ? 'info' : step === 'info' ? 'structure' : 'validate'"
        >
          下一步 <ArrowRight :size="14" />
        </button>
      </div>
    </div>
  </PageStateBoundary>
</template>
