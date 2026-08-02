import type { Ref } from 'vue'

export interface LeaderCandidate {
  title: string
  status: string
}

/** 末位负责人守卫：负责人不足两名时，不可对该成员执行免职/退出/移除，需先交接 */
export function useLastLeaderGuard(members: Ref<LeaderCandidate[]>) {
  function isLastLeader(member: LeaderCandidate | null | undefined): boolean {
    if (!member) return false
    return member.title === '负责人' &&
      members.value.filter((m) => m.title === '负责人' && m.status === 'active').length <= 1
  }

  return { isLastLeader }
}
