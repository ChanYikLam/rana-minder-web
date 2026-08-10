# RanaMinder 路由与权限文档

> 更新日期：2026-08-08
> 实现位置：`src/router/index.ts`（路由表）、`src/router/guard.ts`（导航守卫）、`src/router/permissions.ts`（权限映射）、`src/router/safeLink.ts`
> 页面归属：`src/pages/*`（按领域目录组织）

## 1. 路由注册与分组

路由表集中在 `src/router/index.ts`，采用 vue-router 静态路由 + 懒加载组件，按四组组织：

| 分组 | 数量（实际统计） | 前缀 | 访问控制 |
|---|---|---|---|
| A. 公开路由 | 9 | `/login`、`/auth/*`、`/explore*`、`/activity/*`、`/service-unavailable`、`/files/*` | `meta.public: true` |
| B. 登录用户与本人参与 | 21 | `/me*` | `requiresAuth: true` |
| C. 社团工作空间 | 31 | `/org/:clubId/*` | `requiresAuth + requiresWorkspace` |
| D. 超级管理员 | 18 | `/admin/*` | `requiresAuth + requiresAdmin` |
| 通用回退 | 2 | `/`、`/:pathMatch(.*)*` | 按会话状态解析落点 / 404 |

> 表中数量按路由定义实际统计（总计 81 条）；源码内分组注释（9/21/31/18）为历史标注，以实际统计为准。路由名统一 `P-<DOMAIN>-<序号>` 规范（如 `P-ORG-02`、`P-REC-05`），是权限映射的键。

## 2. 路由守卫（guard.ts）

`runNavigationGuard(to, session, workspace, resolveLoginTarget)` 为纯函数化守卫，集中所有决策，便于脱离 vue-router 单测：

1. **身份切换清缓存**：工作空间上下文绑定用户 id，身份变化先 `clearWorkspace()`。
2. **根路径落点**：未登录 → `/login`（带 redirect）；已登录按 `resolveLoginTarget` 解析 → 平台首页 / 资料门 / 社团工作空间 / 个人中心。
3. **登录门**：非公开路由未登录 → `/login?redirect=...`。
4. **资料门**：`needsProfileGate` 且目标非资料相关路由 → `P-GEN-04`。
5. **平台管理员链**：`requiresAdmin` → 查 `ADMIN_PERMISSIONS[routeName]` → 无权限跳 `P-GEN-02`。
6. **工作空间链**：`requiresWorkspace` → 解析 `clubId` → `workspacePermissionForRoute(routeName)` → `loadWorkspace(clubId)` 失败或无权限 → `P-GEN-02`。
7. **非工作空间页**：会话有工作空间时初始化 workspace 上下文（供侧边栏导航）。

## 3. 路由级权限映射（permissions.ts）

### 3.1 工作空间权限（`WORKSPACE_PERMISSIONS`）

以路由名前缀匹配（精确优先，前缀含 `-` 或 `-list` 兜底）：

| 路由前缀 | 权限 | 说明 |
|---|---|---|
| `P-ORG-02` | `club:dashboard:view` | 工作台 |
| `P-ORG-03` | `club:batch:execute` | 批量操作 |
| `P-REC`（list/02/05） | `INTERVIEW_ACCESS_PERMISSIONS`（任一命中） | 招新：管理或面试职能 |
| `P-JNT` | `club:joint:manage` | 联合活动 |
| `P-MEM`（list/01/05） | `club:member:manage` 或 `club:member:view-self` | 成员列表/详情/退出 |
| `P-MEM-03-manage` | `club:invite:manage` | 常规入社邀请 |
| `P-MEM-04` | `club:appointment:manage` | 任命调岗 |
| `P-MEM-06` | `club:transition:manage` | 换届 |
| `P-FORM` | `club:form:design` | 动态表单 |
| `P-STAT` / `P-EXP` | `club:stats:view` / `club:export:execute` | 统计/导出 |
| `P-NTF-02-club` / `P-NTF` | `club:email:config` / `club:config:manage` | 通知/审计 |
| `P-AUD` / `P-CFG` | `club:audit:view` / `club:config:manage` | 审计/配置 |

`INTERVIEW_ACCESS_PERMISSIONS = ['club:recruitment:manage', 'club:interview:view', 'club:interview:evaluate']`（SRS 7.4 / ORG-037）。

### 3.2 平台权限（`ADMIN_PERMISSIONS`）

| 路由名 | 权限 |
|---|---|
| `P-ORG-01` / `P-ORG-01-wizard` | `platform:club:manage`（社团接入语义，最具体） |
| `P-JNT-admin-list` / `P-JNT-05-admin` | `platform:joint:manage`（P2-4 一致性：从 `platform:club:manage` 细化） |
| `P-REC-admin-list` | `platform:recruitment:manage`（P2-4 一致性：从 `platform:club:manage` 细化） |
| `P-FORM-admin-list` / `P-FORM-01-admin` / `P-FORM-02-admin` | `platform:form:design` |
| `P-AUD-01-admin` / `P-AUD-02-admin` | `platform:audit:view` |
| `P-AUD-03` / `P-AUD-04` | `platform:delete:execute` |
| `P-STAT-01-admin` / `P-EXP-01-admin` | `platform:export:execute` |
| `P-CFG-01-admin` / `P-CFG-02` / `P-NTF-02-platform` | `platform:config:manage` |
| `P-OPS-01` | `platform:ops:view` |

> P2-4 一致性修订：`P-JNT-*` / `P-REC-admin-list` 不再归口到 `platform:club:manage`，
> 改为各自的细粒度权限（`platform:joint:manage` / `platform:recruitment:manage`），
> 与工作空间侧 `club:joint:manage` / `club:recruitment:manage` 语义对齐。
> `P-ORG-01` / `P-ORG-01-wizard` 本身即为"社团接入"语义，归口 `platform:club:manage` 是最具体而非偏宽。
> 详见 `src/router/permissions.ts` 的注释。

### 3.3 角色

`ClubRole = 'super_admin' | 'club_leader' | 'hr' | 'department_leader' | 'interviewer' | 'member' | 'applicant'`。

## 4. 导航与权限联动

- `src/layouts/components/sideNav.ts`：`buildClubGroups(clubId, canAccess)` 按权限过滤社团 L3 导航；`ADMIN_NAV` 为平台导航。
- 用户菜单 `useUserMenu`：平台管理入口固定跳 `/admin/clubs`，仅校验 `platform:club:manage`。
- 页面内 `PermissionGuard` 组件按权限收敛 UI，路由守卫仍是最终授权判定。

## 5. 安全链接（safeLink.ts）

- `safeLink.ts` 校验跳转目标，仅允许站内安全路径，防止开放重定向。
- 作用域解析 `src/services/route-scope.ts`：`/admin/*` → platform、`/me/*` → personal、`/org/:clubId/*` → workspace（携带 clubId）。

## 6. 典型调用链

`用户点击导航` → vue-router `beforeEach` → `runNavigationGuard` → 登录/资料门/平台/工作空间四级判定 → 通过后懒加载页面组件；页面内 `PermissionGuard`/`StateTag` 按权限与状态渲染。
