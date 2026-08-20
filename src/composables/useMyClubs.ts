import { ref, watch } from 'vue'
import { identityApi } from '@/services'
import { useSessionViewStore } from '@/state/sessionViewStore'
import type { WorkspaceContext } from '@/types/domain'

interface MyClub {
  clubId: string
  clubName: string
  role: WorkspaceContext['role']
}

export type { MyClub }

/** 我的社团列表：抽离自 ClubSwitcher，数据获取下沉 composable，组件只做消费与交互。 */
export function useMyClubs() {
  const session = useSessionViewStore()
  const clubs = ref<MyClub[]>([])
  const loading = ref(false)
  const loadError = ref(false)

  // P2-16：列表缓存与会话绑定——记录最近一次拉取对应的用户，换账号/登出后作废
  let clubsSessionKey: string | null = null
  // P2-16：代次计数，换账号/登出时递增；请求返回时若代次已变则丢弃结果，
  // 避免旧账号在途的 getMyClubs 完成后写回并污染新账号菜单
  let clubsGeneration = 0
  // P2-16：强制刷新待补位——lastLoadedAt 触发时若正加载中，加载结束后再补一次，避免被静默丢弃
  let pendingForce = false

  async function load(force = false) {
    if (loading.value) {
      // P2-16：强制刷新在 loading 中时不丢弃，标记待补位，加载结束后再补一次
      if (force) pendingForce = true
      return
    }
    const sessionKey = session.user?.id ?? null
    // 缓存命中仅限同用户；force（会话重载/角色变化后）强制刷新
    if (!force && clubs.value.length > 0 && clubsSessionKey === sessionKey) return
    loading.value = true
    loadError.value = false
    // 记录本次请求对应的代次与用户，写入前校验，防止在途请求写回旧数据
    const gen = clubsGeneration
    const reqSessionKey = sessionKey
    try {
      const result = await identityApi.getMyClubs()
      // P2-16：请求期间发生换账号/登出（代次或用户已变）则丢弃本次结果，避免旧列表污染新账号
      if (gen !== clubsGeneration || reqSessionKey !== (session.user?.id ?? null)) return
      if (result.kind === 'completed') {
        clubs.value = result.data.clubs
        clubsSessionKey = reqSessionKey
      } else {
        // P2-14：拉取失败不再静默——否则菜单误导"暂无加入的社团"
        loadError.value = true
      }
    } finally {
      loading.value = false
      // P2-16：补位——loading 期间被标记的强制刷新，结束后再执行一次
      if (pendingForce) {
        pendingForce = false
        void load(true)
      }
    }
  }

  // P2-16：登出/换账号时旧列表立即作废（不再沿用上一账号的社团菜单）
  watch(() => session.user?.id, (id) => {
    if (clubsSessionKey !== id) {
      clubs.value = []
      clubsSessionKey = null
      // P2-16：递增代次，作废在途请求的写回
      clubsGeneration++
    }
  })

  // P2-16：会话重载（登录/刷新/加入新社团/角色变更）后强制刷新，clubs.length>0 不再阻止拉取
  watch(() => session.lastLoadedAt, () => {
    if (session.lastLoadedAt != null) void load(true)
  })

  return { clubs, loading, loadError, load }
}
