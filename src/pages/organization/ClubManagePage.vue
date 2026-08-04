<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { PageStateBoundary, Card } from '@/components/common'
import { HighRiskConfirm } from '@/components/common'
import StateTag from '@/components/business/StateTag.vue'
import { NameSearch, type SearchResult } from '@/components/form'
import ConfirmScope from '@/components/operation/ConfirmScope.vue'
import { get, post } from '@/services/client'
import { toast } from 'vue-sonner'
import { toastError } from '@/utils/toastError'
import { useRouter } from 'vue-router'
import type { PageState } from '@/types/machine'
import type { ClubAccessItem, ClubAccessStatus, GroupSearchResult } from '@/types/domain/organization'
import { Building2, CheckCircle2, RefreshCw, ShieldCheck, Users, Link2, Unplug, Info, Plus } from '@lucide/vue'

type ClubItem = ClubAccessItem & { hasActiveBusiness: boolean }

type ClubAction = 'approve' | 'reject' | 'suspend' | 'emergency-suspend' | 're-enable' | 'revoke'

const ACTION_LABELS: Record<ClubAction, string> = {
  approve: '批准接入',
  reject: '拒绝',
  suspend: '停用',
  'emergency-suspend': '紧急停用',
  're-enable': '恢复',
  revoke: '解除接入',
}

const state = ref<PageState>('loading')
const items = ref<ClubItem[]>([])
const activeTab = ref<'wizard' | 'manage'>('wizard')
const actingId = ref<string | null>(null)
const confirmState = ref<{ club: ClubItem; action: ClubAction } | null>(null)
const confirming = ref(false)
const router = useRouter()

async function loadData() {
  state.value = 'loading'
  const result = await get<{ items: ClubItem[] }>('/admin/clubs')
  if (result.kind === 'completed') {
    items.value = result.data.items
    state.value = 'normal'
  } else {
    state.value = 'error'
  }
}

// ================= 接入向导 =================
const wizardClub = computed<ClubItem | undefined>(() => items.value.find((c) => c.status === 'wizard_pending'))

const groupKeyword = ref('')
const groupSearching = ref(false)
const groupResults = ref<SearchResult[]>([])
const rawResults = ref<GroupSearchResult[]>([])
const selectedGroup = ref<GroupSearchResult | null>(null)
const selectedLeaderId = ref<string | null>(null)
const groupDetail = ref<{ members: { id: string; name: string }[]; leaderGroups: { id: string; name: string; memberCount: number }[] } | null>(null)
const wizardError = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

function toSearchResult(g: GroupSearchResult): SearchResult {
  return { id: g.id, name: g.name, subtitle: `${g.stableId} · ${g.memberCount} 名成员`, group: g.path || g.purpose, match: g.match, score: g.score }
}

async function searchGroup() {
  const keyword = groupKeyword.value.trim()
  if (!keyword) {
    groupResults.value = []
    rawResults.value = []
    return
  }
  groupSearching.value = true
  const res = await get<{ items: GroupSearchResult[] }>('/admin/groups/search', { q: keyword })
  groupSearching.value = false
  if (res.kind === 'completed') {
    rawResults.value = res.data.items
    groupResults.value = res.data.items.map(toSearchResult)
  } else {
    rawResults.value = []
    groupResults.value = []
  }
}

async function runAction(club: ClubItem, action: ClubAction) {
  actingId.value = club.clubId
  const result = await post<{ status: string }>(`/admin/clubs/${club.clubId}/${action}`)
  actingId.value = null
  if (result.kind === 'completed') {
    club.status = (result as { kind: 'completed'; data: { status: string } }).data.status as ClubAccessStatus
    toast.success(`${club.clubName}：${ACTION_LABELS[action]}成功`)
  }
}

function onGroupInput(value: string) {
  groupKeyword.value = value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(searchGroup, 350)
}

async function onGroupSelect(result: SearchResult) {
  if (!wizardClub.value) return
  const raw = rawResults.value.find((g) => g.id === result.id)
  selectedGroup.value = raw ?? null
  selectedLeaderId.value = null
  groupDetail.value = null
  wizardError.value = ''
  await saveWizardStep({ step: 1, selectedGroupId: result.id })
  const detail = await get<{ members: { id: string; name: string }[]; leaderGroups: { id: string; name: string; memberCount: number }[] }>(`/admin/groups/${result.id}`)
  if (detail.kind === 'completed') groupDetail.value = detail.data
}

const wizardBindingWarning = computed<{ ok: boolean; message: string }>(() => {
  const g = selectedGroup.value
  if (!g) return { ok: true, message: '' }
  if (g.boundClubId && g.boundClubId !== wizardClub.value?.clubId) {
    return { ok: false, message: `Group「${g.name}」已被社团 ${g.boundClubId} 绑定，不得重复绑定` }
  }
  if (g.purpose !== 'club') {
    return { ok: false, message: `Group「${g.name}」用途为「${g.purpose}」，仅 club 用途可绑定为社团` }
  }
  return { ok: true, message: '层级、用途唯一与重复绑定校验通过' }
})

async function saveWizardStep(patch: { step: number; selectedGroupId?: string | null; leaderGroupId?: string | null }) {
  if (!wizardClub.value) return
  const res = await post(`/admin/clubs/wizard/save-step`, {
    clubId: wizardClub.value.clubId,
    step: patch.step,
    selectedGroupId: patch.selectedGroupId ?? selectedGroup.value?.id ?? null,
    leaderGroupId: patch.leaderGroupId ?? selectedLeaderId.value ?? null,
  })
  if (res.kind === 'completed') await loadData()
}

async function selectLeader(groupId: string) {
  selectedLeaderId.value = groupId
  await saveWizardStep({ step: 2 })
}

const importingBusy = ref(false)
async function handleImport() {
  if (!wizardClub.value || !groupDetail.value) return
  importingBusy.value = true
  const res = await post<{ importedCount: number }>(`/admin/clubs/${wizardClub.value.clubId}/import`, {
    memberIds: groupDetail.value.members.map((m) => m.id),
  })
  importingBusy.value = false
  if (res.kind === 'completed') {
    toast.success('已有成员已导入成为当前关系')
    await loadData()
  } else {
    toast.error('成员导入失败，请重试')
  }
}

const completingBusy = ref(false)
async function handleComplete() {
  if (!wizardClub.value) return
  if (!selectedGroup.value) {
    wizardError.value = '请先选择要接入的 Group'
    return
  }
  if (!selectedLeaderId.value) {
    wizardError.value = '请指定负责人职位 Group'
    return
  }
  if (!wizardBindingWarning.value.ok) {
    wizardError.value = wizardBindingWarning.value.message
    return
  }
  completingBusy.value = true
  const res = await post(`/admin/clubs/wizard/complete`, { clubId: wizardClub.value.clubId })
  completingBusy.value = false
  if (res.kind === 'completed') {
    toast.success('接入完成，社团已启用')
    await loadData()
    activeTab.value = 'manage'
  } else {
    wizardError.value = 'error' in res && res.error ? (res.error as { message?: string }).message || '接入失败，请重试' : '接入失败，请重试'
  }
}

// ================= 停用 / 恢复 / 解除 / 修复 / 重绑 =================
type RiskOp = 'normal_suspend' | 'force_suspend' | 'recover' | 'disconnect'
const risk = ref<{ op: RiskOp; club: ClubItem } | null>(null)
const riskExecuting = ref(false)
const reasonDraft = ref('')

function openRisk(op: RiskOp, club: ClubItem) {
  reasonDraft.value = ''
  risk.value = { op, club }
}

const riskTitle = computed(() => {
  const t = risk.value
  if (!t) return ''
  const map: Record<RiskOp, string> = {
    normal_suspend: '普通停用社团',
    force_suspend: '紧急停用社团',
    recover: '恢复启用社团',
    disconnect: '解除社团接入',
  }
  return map[t.op]
})

const riskDescription = computed(() => {
  const t = risk.value
  if (!t) return ''
  if (t.op === 'normal_suspend') return '普通停用要求无进行中业务；停用期间空间只读，恢复后按停用时长顺延冻结期限。'
  if (t.op === 'force_suspend') return '紧急停用使空间只读并暂停期限，不受进行中业务阻止；需要填写原因。'
  if (t.op === 'recover') return '重新启用社团，冻结期限按实际受阻时长一次性顺延。'
  return '解除接入后普通角色失权进入待重新接入，超管仍可修复映射；有历史的空间保留历史。'
})

const riskImpact = computed(() => {
  const t = risk.value
  if (!t) return ''
  if (t.op === 'recover') return '恢复启用并顺延冻结期限，业务时间口径自动衔接。'
  if (t.op === 'disconnect') return '解除接入后进入待重新接入状态，需重新接入后才能恢复使用。'
  return '停用后仅保留只读访问，进行中的业务与期限均会受影响。'
})

const riskReauth = computed<boolean>(() => risk.value?.op === 'force_suspend' || risk.value?.op === 'disconnect' || risk.value?.op === 'recover')

async function riskExec() {
  const t = risk.value
  if (!t) return
  riskExecuting.value = true
  let result: Awaited<ReturnType<typeof post>>
  if (t.op === 'normal_suspend') result = await post(`/admin/clubs/${t.club.clubId}/normal-suspend`, { reason: reasonDraft.value || '常规业务调整' })
  else if (t.op === 'force_suspend') result = await post(`/admin/clubs/${t.club.clubId}/force-suspend`, { reason: reasonDraft.value })
  else if (t.op === 'recover') result = await post(`/admin/clubs/${t.club.clubId}/recover`)
  else result = await post(`/admin/clubs/${t.club.clubId}/disconnect`)
  riskExecuting.value = false
  if (result.kind === 'completed') {
    toast.success('操作已执行')
    risk.value = null
    await loadData()
  } else {
    toastError(result, '操作失败，请重试')
    risk.value = null
  }
}

async function handleRepair(club: ClubItem) {
  actingId.value = club.clubId
  const res = await post(`/admin/clubs/${club.clubId}/repair`)
  actingId.value = null
  if (res.kind === 'completed') {
    toast.success('已修复原 Group 并进入停用状态')
    await loadData()
  } else {
    toastError(res, '修复失败，请重试')
  }
}

async function handleRebind(club: ClubItem) {
  actingId.value = club.clubId
  const search = await get<{ items: GroupSearchResult[] }>('/admin/groups/search', { q: club.clubName.trim() })
  const candidate = search.kind === 'completed' ? search.data.items.find((g) => g.id !== club.groupId && !g.boundClubId && g.purpose === 'club') : undefined
  if (!candidate) {
    actingId.value = null
    toast.error('未找到可绑定的同名 Group，请在向导中选择')
    return
  }
  const endpoint = club.status === 'pending_rebind' ? 'reaccess' : 'rebind'
  const res = await post(`/admin/clubs/${club.clubId}/${endpoint}`, { groupId: candidate.id })
  actingId.value = null
  if (res.kind === 'completed') {
    toast.success(endpoint === 'reaccess' ? '重新接入完成' : '重新绑定完成')
    await loadData()
  } else {
    toastError(res, '操作失败，请重试')
  }
}

async function onConfirmScope() {
  const current = confirmState.value
  if (!current) return
  confirming.value = true
  await runAction(current.club, current.action)
  confirming.value = false
  confirmState.value = null
}

onMounted(loadData)
</script>

<template>
  <PageStateBoundary :state="state" title="社团接入管理" @retry="loadData">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-text-primary">社团接入管理</h1>
        <button
          class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-text-on-primary text-xs font-medium hover:opacity-90"
          @click="router.push('/admin/clubs/wizard')"
        >
          <Plus :size="14" /> 新社团接入
        </button>
      </div>

      <div class="flex gap-1 mb-6 rounded-md bg-subtle p-1 w-fit">
        <button
          class="px-3 py-1.5 rounded-md text-sm"
          :class="activeTab === 'wizard' ? 'bg-elevated text-primary font-medium shadow-sm' : 'text-text-secondary'"
          @click="activeTab = 'wizard'"
        >
          接入向导
        </button>
        <button
          class="px-3 py-1.5 rounded-md text-sm"
          :class="activeTab === 'manage' ? 'bg-elevated text-primary font-medium shadow-sm' : 'text-text-secondary'"
          @click="activeTab = 'manage'"
        >
          社团管理
        </button>
      </div>

      <!-- ① 接入向导 -->
      <template v-if="activeTab === 'wizard'">
        <Card v-if="wizardClub" class="mb-4">
          <div class="flex items-center gap-3 mb-4">
            <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary"><Building2 :size="20" /></div>
            <div>
              <p class="text-sm font-medium text-text-primary">{{ wizardClub.clubName }}</p>
              <p class="text-xs text-text-secondary">Group 接入向导 · 第 {{ Math.min(wizardClub.wizardStep + 1, 4) }}/4 步</p>
            </div>
          </div>

          <!-- 步骤1：Group 搜索与选择 -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-text-primary mb-1.5">① 选择要接入的 Group（精确 → 中文连续子串 → 近似候选）</label>
            <NameSearch
              :model-value="groupKeyword"
              :results="groupResults"
              :loading="groupSearching"
              placeholder="输入 Group 名称 / 稳定标识，至少 3 个有效字符"
              @update:model-value="onGroupInput"
              @select="onGroupSelect"
            />
            <p v-if="selectedGroup" class="mt-2 flex items-center gap-1.5 text-xs" :class="wizardBindingWarning.ok ? 'text-success' : 'text-danger'">
              <CheckCircle2 v-if="wizardBindingWarning.ok" :size="14" />
              <Info v-else :size="14" />
              {{ selectedGroup.name }}（{{ selectedGroup.memberCount }} 名成员）· {{ wizardBindingWarning.message }}
            </p>
          </div>

          <!-- 步骤2：负责人职位 Group -->
          <div v-if="selectedGroup" class="mb-4">
            <p class="block text-sm font-medium text-text-primary mb-1.5">② 指定负责人职位 Group（至少有一名有效负责人）</p>
            <label v-for="g in groupDetail?.leaderGroups ?? []" :key="g.id" class="flex items-center gap-2 rounded-lg border border-border p-2.5 mb-1.5 cursor-pointer hover:border-border-strong">
              <input type="radio" :value="g.id" :checked="selectedLeaderId === g.id" class="rounded-full border-border" @change="selectLeader(g.id)" />
              <span class="text-sm text-text-primary">{{ g.name }}</span>
              <span class="text-xs text-text-secondary">有效负责人 {{ g.memberCount }} 人</span>
            </label>
            <p v-if="(groupDetail?.leaderGroups ?? []).length === 0" class="text-xs text-text-secondary">该 Group 下暂无可用负责人职位 Group，请先在平台侧创建。</p>
          </div>

          <!-- 步骤3：成员导入 -->
          <div v-if="selectedGroup && selectedLeaderId" class="mb-4 rounded-lg border border-border p-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-sm text-text-primary"><Users :size="14" /> ③ 已有成员并入当前关系</div>
              <button class="text-xs text-primary hover:underline disabled:opacity-60" :disabled="importingBusy" @click="handleImport">
                {{ importingBusy ? '导入中...' : `导入 ${groupDetail?.members.length ?? 0} 名成员` }}
              </button>
            </div>
            <p v-if="wizardClub.importedCount > 0" class="text-xs text-success mt-1.5">已并入 {{ wizardClub.importedCount }} 名成员（来自 Group 既有成员，不做历史日期伪造）</p>
          </div>

          <!-- 步骤4：完成 -->
          <div class="flex items-center justify-between">
            <p v-if="wizardError" class="text-xs text-danger" role="alert">{{ wizardError }}</p>
            <div class="ml-auto flex gap-2">
              <button class="px-3 py-1.5 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="activeTab = 'manage'">暂存</button>
              <button class="px-3 py-1.5 rounded-md bg-success text-text-on-primary text-xs font-medium hover:opacity-90 disabled:opacity-60" :disabled="completingBusy" @click="handleComplete">
                {{ completingBusy ? '接入中...' : '完成接入并启用' }}
              </button>
            </div>
          </div>
        </Card>
        <Card v-else class="py-12 text-center">
          <p class="text-sm text-text-secondary">暂无待接入的社团。请先在平台侧创建社团数据后重试。</p>
        </Card>
      </template>

      <!-- ② 社团管理 -->
      <template v-else>
        <div class="space-y-3">
          <Card v-for="club in items" :key="club.clubId">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary-subtle text-primary"><Building2 :size="20" /></div>
                <div>
                  <p class="text-sm font-medium text-text-primary">{{ club.clubName }}</p>
                  <p class="text-xs text-text-secondary">{{ club.memberCount }} 名成员 · 创建于 {{ club.createdAt.slice(0, 7) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <StateTag :status="club.status" />
                <span v-if="club.readonly" class="flex items-center gap-1 text-xs text-warning"><Unplug :size="14" /> 只读</span>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
              <span class="flex items-center gap-1"><Link2 :size="14" /> Group：{{ club.groupName || '未绑定' }}</span>
              <span v-if="club.leaderName" class="flex items-center gap-1"><ShieldCheck :size="14" /> 负责人：{{ club.leaderName }}</span>
              <span v-if="club.boundAt" class="flex items-center gap-1"><CheckCircle2 :size="14" /> 绑定于 {{ club.boundAt.slice(0, 10) }}</span>
              <span v-if="club.freezeExtensionMs > 0" class="flex items-center gap-1 text-warning"><RefreshCw :size="14" /> 冻结期限已顺延 {{ Math.round(club.freezeExtensionMs / 86400000) }} 天</span>
              <span v-if="club.hasActiveBusiness" class="text-warning">有进行中业务</span>
            </div>

            <!-- 停用原因输入（紧急/普通停用） -->
            <div v-if="risk?.club.clubId === club.clubId && (risk.op === 'normal_suspend' || risk.op === 'force_suspend')" class="mt-3 flex gap-2">
              <input v-model="reasonDraft" type="text" placeholder="请输入停用原因" class="flex-1 h-9 px-3 rounded-md border border-border bg-elevated text-sm text-text-primary focus:outline-2 focus:outline-primary" />
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <template v-if="club.status === 'enabled'">
                <button class="px-2.5 py-1 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="openRisk('normal_suspend', club)">普通停用</button>
                <button class="px-2.5 py-1 rounded-md border border-danger text-xs text-danger hover:bg-danger-subtle" @click="openRisk('force_suspend', club)">紧急停用</button>
                <button class="px-2.5 py-1 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="openRisk('disconnect', club)">解除接入</button>
              </template>
              <template v-else-if="club.status === 'suspended'">
                <button class="px-2.5 py-1 rounded-md border border-success text-xs text-success hover:bg-success-subtle" @click="openRisk('recover', club)">恢复启用</button>
              </template>
              <template v-else-if="club.status === 'sync_abnormal_ro'">
                <button class="px-2.5 py-1 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" :disabled="actingId === club.clubId" @click="handleRepair(club)">修复原 Group</button>
                <button class="px-2.5 py-1 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" :disabled="actingId === club.clubId" @click="handleRebind(club)">重新绑定</button>
                <button class="px-2.5 py-1 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="openRisk('disconnect', club)">解除接入</button>
              </template>
              <template v-else-if="club.status === 'pending_rebind'">
                <button class="px-2.5 py-1 rounded-md border border-primary text-xs text-primary hover:bg-primary-subtle" :disabled="actingId === club.clubId" @click="handleRebind(club)">重新接入</button>
              </template>
              <template v-else-if="club.status === 'wizard_pending'">
                <button class="px-2.5 py-1 rounded-md border border-border text-xs text-text-primary hover:bg-subtle" @click="activeTab = 'wizard'">进入接入向导</button>
              </template>

              <div class="ml-auto flex items-center gap-3">
                <span v-if="club.importedCount > 0" class="text-xs text-text-secondary">已并入 {{ club.importedCount }} 名成员</span>
                <button v-if="club.syncEvents.length > 0" class="text-xs text-text-secondary hover:text-primary" title="查看同步记录">
                  <span class="flex items-center gap-1"><Info :size="14" /> {{ club.syncEvents.length }} 条</span>
                </button>
              </div>
            </div>
          </Card>
        </div>
      </template>

      <HighRiskConfirm
        :open="risk !== null"
        :title="riskTitle"
        :description="riskDescription"
        :targets="risk ? [{ id: risk.club.clubId, label: risk.club.clubName, detail: `${risk.club.memberCount} 名成员 · 当前：${risk.club.status}` }] : []"
        :impact-summary="riskImpact"
        confirm-label="确认执行"
        :reauth-required="riskReauth"
        :executing="riskExecuting"
        @confirm="riskExec"
        @update:open="(v) => { if (!v) risk = null }"
      />
    </div>

    <ConfirmScope
      v-if="confirmState"
      :open="true"
      :club-name="confirmState.club.clubName"
      :irreversible="confirmState.action === 'revoke'"
      :confirming="confirming"
      :targets="[{ id: confirmState.club.clubId, label: confirmState.club.clubName, detail: `${confirmState.club.memberCount} 名成员` }]"
      @update:open="(v: boolean) => { if (!v) confirmState = null }"
      @cancel="confirmState = null"
      @confirm="onConfirmScope"
    />
  </PageStateBoundary>
</template>