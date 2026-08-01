import { useRouter } from 'vue-router'
import type { ClubRole } from '@/types/domain'

const ROLE_LABELS: Record<ClubRole, string> = {
  super_admin: '超级管理员',
  club_leader: '社团负责人',
  hr: '人事',
  department_leader: '部门负责人',
  interviewer: '面试官',
  member: '普通成员',
  applicant: '申请人',
}

const ROLE_COLORS: Record<ClubRole, string> = {
  super_admin: 'danger',
  club_leader: 'primary',
  hr: 'info',
  department_leader: 'info',
  interviewer: 'warning',
  member: 'neutral',
  applicant: 'neutral',
}

export function useStateView() {
  const router = useRouter()

  function roleLabel(role: ClubRole): string {
    return ROLE_LABELS[role] || role
  }

  function roleColor(role: ClubRole): string {
    return ROLE_COLORS[role] || 'neutral'
  }

  function navigate(path: string) {
    router.push(path)
  }

  return {
    roleLabel,
    roleColor,
    navigate,
  }
}
