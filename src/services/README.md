# 平台支撑模块 · API 服务层

> 更新日期：2026-08-08

## 核心职责

浏览器端 HTTP 客户端封装、运行时响应校验、错误码映射、鉴权下载与模块化 API 组织。

## 关键组件

| 组件 | 类型 | 职责 |
|---|---|---|
| `client.ts` | HTTP 客户端 | `get/post/put/patch/del/getPaginated`，幂等键生成（15 分钟 TTL）、版本/并发参数、`AbortSignal` 与运行时 schema 校验 |
| `error-map.ts` | 错误映射 | 17 个 `IFC-ERR-*` 错误码、消息、自动重试与可重提标志、`errorToPageState`、`httpStatusToResult` 结果分类 |
| `auth.ts` | 认证适配 | `startLogin/getSession/logout`，按 `VITE_AUTH_MODE` 选择 mock / oidc / disabled |
| `download.ts` | 下载工具 | 同源或 HTTPS 受控下载（`openAuthorizedDownload`） |
| `route-scope.ts` | 作用域解析 | 从路由解析 platform / personal / workspace API 作用域 |
| `modules/index.ts` | 模块 API | `identityApi` / `exploreApi` / `organizationApi` / `notificationApi`（zod schema 校验） |
| `index.ts` | 统一导出 | 客户端、错误映射、模块 API 聚合出口 |

## 对外接口

- 服务层供 `src/state`、页面与 composables 消费；不直接依赖 Vue 组件。
- `ApiResult<T>` 分类：`completed / accepted / rejected / concurrency_conflict / external_uncertain / dependency_unavailable`。
- 错误映射：`IFC-ERR-012` 自动重试；`IFC-ERR-013` → external_uncertain；`IFC-ERR-014`/202 → accepted；`IFC-ERR-008/010` → concurrency_conflict；503 → dependency_unavailable。

## 核心逻辑摘要

- 运行时校验不依赖 TypeScript 编译期类型（ADR-013：跨信任边界数据必须运行时校验）。
- 幂等键基于请求指纹（action+targetId+body）生成，客户端 15 分钟窗口内复用；服务端用稳定幂等标识。
- 前端不得直接信任客户端作用域；服务端逐请求授权，`route-scope` 仅用于请求路径组织。

## 典型调用链

`页面 → services/modules → client.request`（生成幂等键、携带 expectedVersion/idempotencyKey）→ `httpStatusToResult` 分类 → 页面经 `useRequest` 映射五状态（normal/loading/empty/error/forbidden）。
