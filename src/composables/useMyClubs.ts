import { ref } from 'vue'
import { identityApi } from '@/services'
import type { WorkspaceContext } from '@/types/domain'

interface MyClub {
  clubId: string
  clubName: string
  role: WorkspaceContext['role']
}

export type { MyClub }

/** 我的社团列表：抽离自 ClubSwitcher，数据获取下沉 composable，组件只做消费与交互。 */
export function useMyClubs() {
  const clubs = ref<MyClub[]>([])
  const loading = ref(false)
  const loadError = ref(false)

  async function load() {
    if (clubs.value.length > 0 || loading.value) return
    loading.value = true
    loadError.value = false
    try {
      const result = await identityApi.getMyClubs()
      if (result.kind === 'completed') {
        clubs.value = result.data.clubs
      } else {
        // P2-14：拉取失败不再静默——否则菜单误导"暂无加入的社团"
        loadError.value = true
      }
    } finally {
      loading.value = false
    }
  }

  return { clubs, loading, loadError, load }
}