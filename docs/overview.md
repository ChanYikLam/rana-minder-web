# RanaMinder 代码结构化文档索引

> 更新日期：2026-08-08
> 用途：为 AI 与开发者提供模块职责与内部结构速览，降低维护成本。
> 原则：固化代码结构（关键类/组件/函数/数据流），避免大段复制源码；推断均基于源码显式内容。

## 1. 文档清单

### 1.1 领域模块（`src/pages/<domain>/README.md`）

| 模块 | 文档 | 职责摘要 | 状态机 |
|---|---|---|---|
| 身份与资料 | [`src/pages/identity/README.md`](../src/pages/identity/README.md) | 会话、资料门、邮箱验证、同步冲突、降级窗口 | SM-IDN-001/002/003 |
| 组织与授权 | [`src/pages/organization/README.md`](../src/pages/organization/README.md) | 社团接入、Group 映射、权限计算、批量操作 | SM-ORG-001~004 |
| 普通招新 | [`src/pages/recruitment/README.md`](../src/pages/recruitment/README.md) | 活动/通道/申请/路径/面试/邀请 | SM-REC-001~005、SM-INV-001 |
| 联合活动 | [`src/pages/joint/README.md`](../src/pages/joint/README.md) | 联合活动/参与/申请/面试/结论/通道 | SM-JNT-001~006 |
| 成员生命周期 | [`src/pages/member/README.md`](../src/pages/member/README.md) | 成员经历、任职、入社邀请、任命、换届、退出 | SM-MEM-001~004、SM-INV-001 |
| 动态表单与文件 | [`src/pages/form/README.md`](../src/pages/form/README.md) | 表单定义/提交、文件检查与绑定 | SM-FORM-001/002、SM-FILE-001 |
| 通知 | [`src/pages/notification/README.md`](../src/pages/notification/README.md) | 通知事实、站内信、邮件渠道、偏好与开关 | SM-NTF-001 |
| 纠错、审计与数据生命周期 | [`src/pages/audit/README.md`](../src/pages/audit/README.md) | 事实纠错、审计日志、保留策略、正式删除 | SM-AUD-001 |
| 统计与导出 | [`src/pages/stats/README.md`](../src/pages/stats/README.md) | 权限内统计、异步导出、下载授权 | SM-EXP-001 |
| 配置与发布 | [`src/pages/config/README.md`](../src/pages/config/README.md) | 平台/社团配置、权限模板、安全开关 | SM-FORM-001 等 |
| 运维与可观测性 | [`src/pages/ops/README.md`](../src/pages/ops/README.md) | 内置只读状态页、异常访问、追踪 | — |
| 通用页与认证页 | [`src/pages/generic/README.md`](../src/pages/generic/README.md) | 登录/回调、403/404/503、资料门 | — |

### 1.2 平台支撑模块（`src/<layer>/README.md`）

| 模块 | 文档 | 职责摘要 |
|---|---|---|
| API 服务层 | [`src/services/README.md`](../src/services/README.md) | HTTP 客户端、错误映射、运行时校验、模块 API |
| Mock 数据层 | [`src/mock/README.md`](../src/mock/README.md) | 模拟后端、29 状态机转换表、内存库、治理 |
| 全局状态 | [`src/state/README.md`](../src/state/README.md) | 会话/工作空间/操作/通知四个 Pinia store |
| 领域类型与契约 | [`src/types/README.md`](../src/types/README.md) | 领域模型、状态机枚举、传输契约 |
| UI 组件层 | [`src/components/README.md`](../src/components/README.md) | 业务/通用/展示/反馈/表单/操作/ui 组件 |
| 组合式函数与工具库 | [`src/composables/README.md`](../src/composables/README.md) | useRequest 等 composables 与纯函数 lib |
| 布局与导航 | [`src/layouts/README.md`](../src/layouts/README.md) | Auth/Public/Default 布局与权限导航 |

### 1.3 聚合文档（`docs/`）

| 文档 | 说明 |
|---|---|
| [`docs/state-machine.md`](state-machine.md) | 29 个状态机通用框架、全部定义与跨状态机联动 |
| [`docs/routing.md`](routing.md) | 路由注册分组、导航守卫、路由级权限映射与安全链接 |

## 2. 模块依赖与数据流

```
页面 (src/pages/<domain>) 
  → services (HTTP 客户端 + 错误映射)
  → state (Pinia: 会话/工作空间/通知/操作)
  → mock (开发期模拟后端: 状态机转换表 + 内存库)
  → types (领域模型/契约/状态机类型)
```

- **状态机唯一来源**：`src/mock/state-machines/transitions.ts`；db 层经 `StatesOf<M>` 派生类型，显示层经 `stateLabels.ts` 映射中文。
- **授权链**：`router/guard.ts`（四级判定）→ `router/permissions.ts`（路由权限映射）→ `state/workspaceContextStore`（权限缓存）→ 页面 `PermissionGuard`。
- **后端边界**：开发期由 `mock-plugin.ts`（Vite 中间件）拦截 `/api/*`；生产由真实后端替换，Mock 契约与真实契约保持一致。

## 3. 维护约定

- 新增/修改文档时新建独立分支（`docs/update-<模块>-<日期>`），提交 MR 合并到 `dev`；禁止直接改 `dev`/`main`。
- 每次合并后更新本文档索引（本文件）与相关模块 README。
- 文档内容遵循：模块名称、更新日期、核心职责、关键组件列表、对外接口、依赖清单、核心逻辑摘要、典型调用链。

## 4. 相关规格来源

本项目存在两套文档基线：

- **代码分支（dev / 本 MR）**：`docs/` 下维护模块结构化文档（本索引、`state-machine.md`、`routing.md`）与模块内 `README.md`。
- **设计基线（main）**：`docs/requirements|product|specification|architecture|frontend|operations|governance` 存放 PRD/SRS/ADR 等规格文档。设计基线合并到 dev 后，以下相对链接将生效：
  - `docs/specification/SRS-状态机转换明细-v1.0.md`（29 状态机、306 转换）
  - `docs/architecture/系统架构总览-v1.0.md`（12+3 模块、8 类事务边界）
  - `docs/architecture/ADR-013-Vue与NestJS首版应用技术栈.md`（Vue 3 + NestJS）
  - `docs/frontend/前端技术设计-v1.0.md`（shadcn-vue/Tailwind/Pinia 选型）
