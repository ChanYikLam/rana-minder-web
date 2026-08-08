# 平台支撑模块 · 组合式函数与工具库

> 更新日期：2026-08-08

## 核心职责

跨页面复用的 Vue composables（请求/状态/守卫/主题/快捷键等）与纯函数工具库（日期/表单文件/招新逻辑/状态派生）。

## 关键组件（composables）

| 组件 | 职责 |
|---|---|
| `useRequest.ts` | 请求封装：数据、`PageState` 五状态、错误与 `execute/refresh`（防重入） |
| `useStateView.ts` | 页面状态视图（loading/empty/error/forbidden）派生 |
| `useWriteGuard.ts` | 写入守卫（提交中/禁用条件） |
| `useLastLeaderGuard.ts` | 最后负责人连续性校验 |
| `useDebouncedSearch.ts` | 防抖搜索 |
| `useFocusDialog.ts` | 对话框焦点与 Esc 管理 |
| `useKeyboardShortcuts.ts` | 全局快捷键 |
| `useTheme.ts` | 明暗主题切换 |
| `useUserMenu.ts` | 用户菜单与平台管理员入口判定（`PLATFORM_PERMISSIONS`） |
| `useSessionView.ts` | 会话视图组合入口 |
| `useForm.ts` | VeeValidate 表单封装 |

## 关键组件（lib）

| 组件 | 职责 |
|---|---|
| `date.ts` | 平台时区（Asia/Shanghai）与中文日期/时间/星期格式化 |
| `recruitment-status.ts` | 申请状态标签、可编辑状态、恢复窗口与终态提示 |
| `jointApplyLogic.ts` | 联合申请志愿/偏好操作、校验与提交载荷构建 |
| `formFile.ts` | 文件字段填充校验与草稿安全元数据 |
| `exportFormat.ts` | 导出大小/时间格式化 |
| `utils.ts` | `cn()` classnames 合并 |

## 对外接口

- `src/composables` 与 `src/lib` 均为具名导出，供页面与组件直接 import。
- 每个 composable/lib 均有对应 `.test.ts` 单测，纯函数化便于脱离组件验证。

## 核心逻辑摘要

- `useRequest` 与 `useStateView` 统一页面五状态渲染，避免各页重复实现错误/加载分支。
- `useLastLeaderGuard` / `useWriteGuard` 承载负责人连续性与写入保护等跨页业务规则。
- lib 层为纯函数，无 Vue 依赖，可直接单测（date/jointApply/recruitment-status/formFile）。

## 典型调用链

`页面 setup` → `useRequest(apiFn)` → 返回 data/state/error → 模板经 `PageStateBoundary` 渲染；业务文案经 `lib/recruitment-status` / `lib/date` 派生。
