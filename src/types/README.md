# 平台支撑模块 · 领域类型与契约

> 更新日期：2026-08-08

## 核心职责

跨模块共享的领域模型类型、状态机枚举/转换类型、传输中立请求/结果契约。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `types/domain/identity.ts` | 类型 | `User` / `SessionInfo` / `ProfileGate` / `WorkspaceInfo` |
| `types/domain/organization.ts` | 类型 | `ClubRole` / `Club` / `ClubAccessStatus` / `GroupNode` / `ClubAccessItem` |
| `types/domain/recruitment.ts` | 类型 | 招新活动/通道/申请/路径/面试/邀请模型与状态子集 |
| `types/domain/member.ts` | 类型 | `Member` / `MemberStatus` / `MemberPosition` / `TenureRecord` |
| `types/domain/form.ts` | 类型 | `FormDefinition` / `FormVersion` / `FormField` / `FileMeta` / 字段类型 |
| `types/domain/misc.ts` | 类型 | `Notification` / `AuditLog` / `Correction` / `ExportTask` |
| `types/machine/index.ts` | 类型 | `StateMachineId`（29 个）、`StateTransition`、`StateMachineMeta`、`PageState`（五状态） |
| `types/contracts/index.ts` | 类型 | `ApiRequest` / `ApiResult` / `ApiError` / `PaginatedResult` / cursor 分页 |

## 对外接口

- `types/domain/index.ts` 统一导出领域模型。
- 状态机 ID 与 `transitions.ts` 保持一致（`SM-xxx` 命名，去掉 `SRS-` 前缀）。
- `PageState = 'normal' | 'loading' | 'empty' | 'error' | 'forbidden'` 供页面五状态渲染。

## 核心逻辑摘要

- 领域状态类型尽量从 `StatesOf<M>` 派生（单源词表），仅保留历史显示别名（如 `published`、`closed_final`）。
- `ApiResult` 区分完成/接受/拒绝/并发冲突/外部不确定/依赖不可用，承载 IFC 错误码。
- 前端类型不构成接口契约本身（ADR-013：共享类型不等于契约）；真实契约以服务端为准。

## 典型调用链

`页面组件` → `types/domain` 模型 → `services` 返回 `ApiResult<T>` → `useRequest` 泛型 + 运行时 zod 校验双保险。
