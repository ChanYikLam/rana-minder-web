import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionViewStore } from '@/state/sessionViewStore'
import { useWorkspaceContextStore } from '@/state/workspaceContextStore'

const WORKSPACE_PERMISSIONS: Record<string, string> = {
  'P-ORG-02': 'club:dashboard:view',
  'P-ORG-03': 'club:batch:execute',
  'P-REC': 'club:recruitment:manage',
  'P-JNT': 'club:joint:manage',
  'P-MEM': 'club:member:manage',
  'P-FORM': 'club:form:design',
  'P-STAT': 'club:stats:view',
  'P-EXP': 'club:export:execute',
  'P-NTF': 'club:config:manage',
  'P-AUD': 'club:audit:view',
  'P-CFG': 'club:config:manage',
}

const ADMIN_PERMISSIONS: Record<string, string> = {
  'P-FORM-admin-list': 'platform:form:design',
  'P-FORM-01-admin': 'platform:form:design',
  'P-FORM-02-admin': 'platform:form:design',
  'P-JNT-admin-list': 'platform:club:manage',
  'P-JNT-05-admin': 'platform:club:manage',
  'P-ORG-01': 'platform:club:manage',
  'P-NTF-02-platform': 'platform:config:manage',
  'P-AUD-01-admin': 'platform:audit:view',
  'P-AUD-02-admin': 'platform:audit:view',
  'P-STAT-01-admin': 'platform:export:execute',
  'P-EXP-01-admin': 'platform:export:execute',
  'P-AUD-03': 'platform:delete:execute',
  'P-AUD-04': 'platform:delete:execute',
  'P-CFG-01-admin': 'platform:config:manage',
  'P-CFG-02': 'platform:config:manage',
  'P-OPS-01': 'platform:ops:view',
}

export function workspacePermissionForRoute(routeName: string): string | null {
  const exact = WORKSPACE_PERMISSIONS[routeName]
  if (exact) return exact
  const prefix = Object.keys(WORKSPACE_PERMISSIONS).find((key) => routeName.startsWith(`${key}-`) || routeName === `${key}-list`)
  return prefix ? WORKSPACE_PERMISSIONS[prefix] : null
}

const routes: RouteRecordRaw[] = [
  // ========== A. 公开路由（7条） ==========
  {
    path: '/login',
    name: 'P-IDN-01',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: { layout: 'auth', public: true },
  },
  {
    path: '/auth/callback',
    name: 'P-IDN-01-callback',
    component: () => import('@/pages/auth/AuthCallbackPage.vue'),
    meta: { layout: 'auth', public: true },
  },
  {
    path: '/explore',
    name: 'P-REC-07-clubs',
    component: () => import('@/pages/recruitment/PublicCatalogPage.vue'),
    meta: { layout: 'public', public: true },
  },
  {
    path: '/explore/clubs',
    name: 'P-REC-07-clubs-list',
    component: () => import('@/pages/recruitment/PublicCatalogPage.vue'),
    meta: { layout: 'public', public: true, tab: 'clubs' },
  },
  {
    path: '/explore/activities',
    name: 'P-REC-07-activities',
    component: () => import('@/pages/recruitment/PublicCatalogPage.vue'),
    meta: { layout: 'public', public: true, tab: 'activities' },
  },
  {
    path: '/activity/recruitment/:activityId',
    name: 'P-REC-08-recruitment',
    component: () => import('@/pages/recruitment/PublicDetailPage.vue'),
    meta: { layout: 'public', public: true, variant: 'recruitment' },
  },
  {
    path: '/activity/joint/:jointId',
    name: 'P-REC-08-joint',
    component: () => import('@/pages/recruitment/PublicDetailPage.vue'),
    meta: { layout: 'public', public: true, variant: 'joint' },
  },
  {
    path: '/service-unavailable',
    name: 'P-GEN-03',
    component: () => import('@/pages/generic/ServiceUnavailablePage.vue'),
    meta: { layout: 'public', public: true },
  },

  // ========== B. 登录用户与本人参与路由（21条） ==========
  {
    path: '/me',
    name: 'P-IDN-03',
    component: () => import('@/pages/identity/PersonalCenterPage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/me/todo',
    name: 'P-IDN-03-todo',
    component: () => import('@/pages/identity/PersonalCenterPage.vue'),
    meta: { layout: 'default', requiresAuth: true, tab: 'todo' },
  },
  {
    path: '/me/ongoing',
    name: 'P-IDN-03-ongoing',
    component: () => import('@/pages/identity/PersonalCenterPage.vue'),
    meta: { layout: 'default', requiresAuth: true, tab: 'ongoing' },
  },
  {
    path: '/me/history',
    name: 'P-IDN-03-history',
    component: () => import('@/pages/identity/PersonalCenterPage.vue'),
    meta: { layout: 'default', requiresAuth: true, tab: 'history' },
  },
  {
    path: '/me/schedule',
    name: 'P-IDN-03-schedule',
    component: () => import('@/pages/identity/PersonalCenterPage.vue'),
    meta: { layout: 'default', requiresAuth: true, tab: 'schedule' },
  },
  {
    path: '/me/profile',
    name: 'P-IDN-02',
    component: () => import('@/pages/identity/ProfilePage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/me/profile/edit',
    name: 'P-IDN-02-edit',
    component: () => import('@/pages/identity/ProfilePage.vue'),
    meta: { layout: 'default', requiresAuth: true, mode: 'edit' },
  },
  {
    path: '/me/profile/sync-conflict',
    name: 'P-IDN-02-sync-conflict',
    component: () => import('@/pages/identity/ProfilePage.vue'),
    meta: { layout: 'default', requiresAuth: true, mode: 'sync-conflict' },
  },
  {
    path: '/me/profile/required',
    name: 'P-GEN-04',
    component: () => import('@/pages/generic/ProfileGatePage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/me/notifications',
    name: 'P-NTF-01',
    component: () => import('@/pages/notification/NotificationCenterPage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/me/notifications/preferences',
    name: 'P-NTF-02-personal',
    component: () => import('@/pages/notification/EmailSettingsPage.vue'),
    meta: { layout: 'default', requiresAuth: true, scope: 'personal' },
  },
  {
    path: '/me/interviews/recruitment/:interviewId',
    name: 'P-REC-04-self',
    component: () => import('@/pages/recruitment/InterviewSchedulePage.vue'),
    meta: { layout: 'default', requiresAuth: true, view: 'self' },
  },
  {
    path: '/me/interviews/joint/:jointId',
    name: 'P-JNT-03-self',
    component: () => import('@/pages/joint/JointInterviewSchedulePage.vue'),
    meta: { layout: 'default', requiresAuth: true, view: 'self' },
  },
  {
    path: '/me/invitations/recruitment/:invitationId',
    name: 'P-REC-06-self',
    component: () => import('@/pages/recruitment/InvitationPage.vue'),
    meta: { layout: 'default', requiresAuth: true, view: 'self' },
  },
  {
    path: '/me/invitations/joint/:invitationId',
    name: 'P-JNT-04-self',
    component: () => import('@/pages/joint/JointInvitationPage.vue'),
    meta: { layout: 'default', requiresAuth: true, view: 'self' },
  },
  {
    path: '/me/invitations/membership',
    name: 'P-MEM-03-self',
    component: () => import('@/pages/member/MembershipInvitePage.vue'),
    meta: { layout: 'default', requiresAuth: true, view: 'self' },
  },
  {
    path: '/me/corrections',
    name: 'P-AUD-01-self',
    component: () => import('@/pages/audit/CorrectionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, view: 'self' },
  },
  {
    path: '/activity/recruitment/:activityId/apply',
    name: 'P-REC-03',
    component: () => import('@/pages/recruitment/ApplicationPage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/activity/joint/:jointId/apply',
    name: 'P-JNT-02',
    component: () => import('@/pages/joint/JointApplyPage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/files/:fileId',
    name: 'P-FORM-03',
    component: () => import('@/pages/form/FilePreviewPage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },
  {
    path: '/forbidden',
    name: 'P-GEN-02',
    component: () => import('@/pages/generic/ForbiddenPage.vue'),
    meta: { layout: 'default', requiresAuth: true },
  },

  // ========== C. 社团工作空间路由（26条） ==========
  // 注意：静态子路由优先于动态参数
  {
    path: '/org/:clubId/dashboard',
    name: 'P-ORG-02',
    component: () => import('@/pages/organization/DashboardPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/batch',
    name: 'P-ORG-03',
    component: () => import('@/pages/organization/BatchOperationPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/recruitment',
    name: 'P-REC-list',
    component: () => import('@/pages/recruitment/RecruitmentListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/recruitment/create',
    name: 'P-REC-01',
    component: () => import('@/pages/recruitment/ActivityCreatePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/recruitment/:activityId',
    name: 'P-REC-02',
    component: () => import('@/pages/recruitment/ActivityManagePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/recruitment/:activityId/applications',
    name: 'P-REC-02-applications',
    component: () => import('@/pages/recruitment/ApplicationsPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/recruitment/:activityId/interview',
    name: 'P-REC-04-manage',
    component: () => import('@/pages/recruitment/InterviewManagePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, view: 'manage' },
  },
  {
    path: '/org/:clubId/recruitment/:activityId/review',
    name: 'P-REC-05',
    component: () => import('@/pages/recruitment/ReviewPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/recruitment/:activityId/invitations',
    name: 'P-REC-06-manage',
    component: () => import('@/pages/recruitment/InvitationManagePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, view: 'manage' },
  },
  {
    path: '/org/:clubId/joint',
    name: 'P-JNT-list',
    component: () => import('@/pages/joint/JointListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/joint/create',
    name: 'P-JNT-01-create',
    component: () => import('@/pages/joint/JointManagePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, mode: 'create' },
  },
  {
    path: '/org/:clubId/joint/:jointId',
    name: 'P-JNT-01-manage',
    component: () => import('@/pages/joint/JointManagePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, mode: 'manage' },
  },
  {
    path: '/org/:clubId/joint/:jointId/interview',
    name: 'P-JNT-03-manage',
    component: () => import('@/pages/joint/JointInterviewPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, view: 'manage' },
  },
  {
    path: '/org/:clubId/joint/:jointId/conclusions',
    name: 'P-JNT-04-manage',
    component: () => import('@/pages/joint/JointConclusionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, view: 'manage' },
  },
  {
    path: '/org/:clubId/joint/:jointId/close',
    name: 'P-JNT-05',
    component: () => import('@/pages/joint/JointClosePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/members',
    name: 'P-MEM-list',
    component: () => import('@/pages/member/MemberListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/members/department-apply',
    name: 'P-MEM-02',
    component: () => import('@/pages/member/DepartmentApplyPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/members/invite',
    name: 'P-MEM-03-manage',
    component: () => import('@/pages/member/MembershipInvitePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, view: 'manage' },
  },
  {
    path: '/org/:clubId/members/appointments',
    name: 'P-MEM-04',
    component: () => import('@/pages/member/AppointmentPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/members/exit',
    name: 'P-MEM-05',
    component: () => import('@/pages/member/MemberExitPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/members/transition',
    name: 'P-MEM-06',
    component: () => import('@/pages/member/TransitionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/members/:memberId',
    name: 'P-MEM-01',
    component: () => import('@/pages/member/MemberProfilePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/forms',
    name: 'P-FORM-list',
    component: () => import('@/pages/form/FormListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/forms/designer/:formId',
    name: 'P-FORM-01',
    component: () => import('@/pages/form/FormDesignerPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/forms/versions/:formId',
    name: 'P-FORM-02',
    component: () => import('@/pages/form/FormVersionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/stats',
    name: 'P-STAT-01',
    component: () => import('@/pages/stats/StatsPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/exports',
    name: 'P-EXP-01',
    component: () => import('@/pages/stats/ExportPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/notifications/email-config',
    name: 'P-NTF-02-club',
    component: () => import('@/pages/notification/EmailSettingsPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, scope: 'club' },
  },
  {
    path: '/org/:clubId/audit/corrections',
    name: 'P-AUD-01-manage',
    component: () => import('@/pages/audit/CorrectionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true, view: 'manage' },
  },
  {
    path: '/org/:clubId/audit/logs',
    name: 'P-AUD-02',
    component: () => import('@/pages/audit/AuditLogPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },
  {
    path: '/org/:clubId/config',
    name: 'P-CFG-01-club',
    component: () => import('@/pages/config/ConfigPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresWorkspace: true },
  },

  // ========== D. 超级管理员路由（14条） ==========
  {
    path: '/admin/forms',
    name: 'P-FORM-admin-list',
    component: () => import('@/pages/form/AdminFormListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/joint',
    name: 'P-JNT-admin-list',
    component: () => import('@/pages/joint/AdminJointListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/recruitment',
    name: 'P-REC-admin-list',
    component: () => import('@/pages/recruitment/AdminRecruitmentListPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/clubs',
    name: 'P-ORG-01',
    component: () => import('@/pages/organization/ClubManagePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/forms/designer/:formId',
    name: 'P-FORM-01-admin',
    component: () => import('@/pages/form/FormDesignerPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/forms/versions/:formId',
    name: 'P-FORM-02-admin',
    component: () => import('@/pages/form/FormVersionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/notifications/email-config',
    name: 'P-NTF-02-platform',
    component: () => import('@/pages/notification/EmailSettingsPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true, scope: 'platform' },
  },
  {
    path: '/admin/joint/:jointId/close',
    name: 'P-JNT-05-admin',
    component: () => import('@/pages/joint/JointClosePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/audit/corrections',
    name: 'P-AUD-01-admin',
    component: () => import('@/pages/audit/CorrectionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true, view: 'admin' },
  },
  {
    path: '/admin/audit/logs',
    name: 'P-AUD-02-admin',
    component: () => import('@/pages/audit/AuditLogPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/stats',
    name: 'P-STAT-01-admin',
    component: () => import('@/pages/stats/StatsPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/exports',
    name: 'P-EXP-01-admin',
    component: () => import('@/pages/stats/ExportPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/delete',
    name: 'P-AUD-03',
    component: () => import('@/pages/audit/FormalDeletePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/retention',
    name: 'P-AUD-04',
    component: () => import('@/pages/audit/RetentionPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/config',
    name: 'P-CFG-01-admin',
    component: () => import('@/pages/config/ConfigPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/config/permission-templates',
    name: 'P-CFG-02',
    component: () => import('@/pages/config/PermissionTemplatePage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/ops-status',
    name: 'P-OPS-01',
    component: () => import('@/pages/ops/OpsStatusPage.vue'),
    meta: { layout: 'default', requiresAuth: true, requiresAdmin: true },
  },

  // ========== 通用回退 ==========
  {
    path: '/:pathMatch(.*)*',
    name: 'P-GEN-01',
    component: () => import('@/pages/generic/NotFoundPage.vue'),
    meta: { layout: 'public', public: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const session = useSessionViewStore()
  const workspace = useWorkspaceContextStore()

  const isPublic = to.meta.public === true

  if (!isPublic) {
    if (!session.isAuthenticated) {
      await session.loadSession()
    }

    if (!session.isAuthenticated) {
      return { name: 'P-IDN-01', query: { redirect: to.fullPath } }
    }

    if (session.needsProfileGate && to.name !== 'P-GEN-04' && to.name !== 'P-IDN-02' && to.name !== 'P-IDN-02-edit' && to.name !== 'P-IDN-02-sync-conflict') {
      return { name: 'P-GEN-04' }
    }

    if (to.meta.requiresAdmin === true) {
      const permission = ADMIN_PERMISSIONS[String(to.name)]
      if (!permission || !session.hasPermission(permission)) {
        return { name: 'P-GEN-02' }
      }
    }

    if (to.meta.requiresWorkspace === true) {
      const clubId = typeof to.params.clubId === 'string' ? to.params.clubId : null
      const permission = workspacePermissionForRoute(String(to.name))
      if (!clubId || !permission || !(await workspace.loadWorkspace(clubId)) || !workspace.hasPermission(permission)) {
        return { name: 'P-GEN-02' }
      }
    } else {
      workspace.clearWorkspace()
    }
  }

  return true
})

export default router
