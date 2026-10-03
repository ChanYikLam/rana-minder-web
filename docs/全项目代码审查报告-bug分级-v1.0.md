# 全项目代码审查报告（Bug 分级）v1.0

> 审查日期：2026-08-22（dev 分支，`248bb7e`，工作树位于 `fix/ui-review-v1-remaining`）
> 审查对象：rana-minder-web 全仓（Vue 3.5 + TS + Pinia 4 + vue-router 5，含开发态 mock 后端）
> 代码规模：约 6.2 万行（不含 `src/components/ui/` shadcn-vue 生成物）

---

## 1. 审查方法与范围

- **静态基线**：`vue-tsc` typecheck、`eslint`、`vitest`（162 文件 / 1466 用例）、`pnpm audit` —— **全部通过，零错误**。
- **人工深读**：核心基础层（services / state / router / composables / lib）逐文件精读；业务页面与 mock 层按高风险模式（异步竞态、定时器/监听器泄漏、catch 吞错、权限校验、乐观锁、状态机流转、契约一致性）定向核查。
- **模式扫描**：空 catch、`as any`/`@ts-ignore`、`console.log` 残留、TODO/FIXME、`addEventListener`/`setInterval` 清理、AbortController 使用面 —— 均未发现新增问题。
- **历史问题核验**：`docs/issue简介.txt` 中 P1（面试官无法查看申请人附件）已在当前代码修复（`recruitment-api.ts` 具备 `canInterview` 校验、ReviewPage 已加载 answers/附件、文件状态统一 `approved`），不重复列入。
- 说明：本次审查原计划由 8 个并行子代理分区执行，因子代理基础设施连续两轮故障，改为主会话人工审查完成；mock 层 2.5 万行采取「契约对照 + 热点精读」策略而非逐行通读。

### 严重程度定义

| 级别 | 定义 |
|---|---|
| P0 | 致命：崩溃、数据丢失、越权访问、安全漏洞（当前实际环境可直接利用） |
| P1 | 严重：主流程功能错误、产生错误数据 |
| P2 | 中等：特定条件下功能错误 / 契约缺口，真实后端接入后会放大 |
| P3 | 轻微：低影响缺陷、潜在隐患、展示口径问题 |

---

## 2. Bug 清单

### [P2] M-1 mock 文件下载端点零鉴权（契约缺口）

- **文件**：`src/mock/index.ts:2883-2898`
- **问题**：`POST /api/files/:fileId/download` 仅校验 fileId 格式（`^file-\d+-[a-z0-9]+$`）即返回下载链接，**不做任何身份、权限或所属作用域（申请/社团）校验**。对比同层导出下载 `POST /api/admin/exports/:id/download`（`index.ts:3870`）有 `platform:export:execute` 权限校验 + 高风险二次确认（`assertHighRisk`）+ 审计留痕，口径明显不一致。
- **触发条件/影响**：mock 为开发态演示后端，当前无实际可利用敏感数据；但项目明确约定「Mock 契约与真实契约保持一致」，且下载授权正是本项目历史 P1 修复面（`docs/issue简介.txt`、SM-FILE-001）。真实后端若按此契约实现即构成越权下载（IDOR）漏洞。
- **证据**：
  ```ts
  // src/mock/index.ts:2885
  response: ({ query }) => {
    const fileId = query.fileId || query.id || ''
    if (!/^file-\d+-[a-z0-9]+$/.test(fileId)) { return 404 }
    return { code: 0, data: { fileId, status: 'downloaded', downloadUrl: '/api/mock-files/' + fileId + '.csv', ... } }
  }
  ```
- **修复建议**：handler 内经 `resolveMockUser` 校验请求者对 fileId 所属业务对象（申请/表单/社团）的查看权，无权时返回 `forbidden()`，与导出下载口径对齐。

### [P2] M-2 工作空间上下文加载无并发防护，快速切换社团可短暂权限错位

- **文件**：`src/state/workspaceContextStore.ts:43-77`；`src/components/business/ClubSwitcher.vue:47-56`
- **问题**：`loadWorkspace(clubId)` 无请求代次号/AbortController；`switchClub` 的 `switching` 标志仅驱动转圈 UI，**入口处未拦截重入**（仅挡同社团重复点击）。连续切换社团 A→B 时两请求交错，慢者后到覆盖 store；窗口期内 `hasPermission` 以 A 社团权限集判定 B 社团页面，可能误放行/误拦截。
- **触发条件/影响**：需在上一切换请求在途时再次触发切换（下拉菜单点击后会关闭，快速重开或键盘触发可复现）；概率低。后续导航因守卫缓存未命中（clubId 不匹配）会重新拉取，**可自愈**，故为窗口期闪断而非持久错位。
- **证据**：
  ```ts
  // ClubSwitcher.vue:48
  if (club.clubId === workspace.currentClubId) return
  switching.value = true          // 未检查 switching 即重入
  ok = await workspace.loadWorkspace(club.clubId)   // 无代次校验
  ```
- **修复建议**：`loadWorkspace` 增加代次号（新请求发起时使旧请求结果作废）或 AbortController；`switchClub` 入口增加 `if (switching.value) return`。

### [P2] M-3 幂等键生命周期缺陷：失败/受理后不清理，重试语义依赖未实现的服务端行为

- **文件**：`src/services/client.ts:43-50, 112-128`
- **问题**：幂等键仅在响应 `completed`/204 时从 `pendingIdempotencyKeys` 删除；`rejected`（业务失败、网络异常）与 `accepted`（202 受理）后键保留 15 分钟。同指纹重试复用同键对「防双击重复提交」是正确的，但存在边界：202 受理的异步任务若最终失败，用户在 TTL 内以**完全相同内容**重试会携带旧键——若真实后端按「键 → 结果」持久化幂等语义，将返回旧的失败结果而非创建新任务，用户被锁至 TTL 过期。当前 mock 未实现服务端幂等存储，问题不触发。
- **附带**：该 Map 无 TTL 主动清扫，仅靠读取时惰性判断过期覆盖，长期运行 SPA 中失败键缓慢累积（内存影响可忽略）。
- **证据**：
  ```ts
  // client.ts:128 仅 completed 删除
  if (result.kind === 'completed' && intentFingerprint) pendingIdempotencyKeys.delete(intentFingerprint)
  ```
- **修复建议**：`accepted`/`external_uncertain` 时同样删除键（任务受理后重复提交应由任务状态而非幂等键兜底），或在服务契约中明确幂等键仅用于在途去重、不缓存失败结果。

### [P3] M-4 202 响应缺 taskId 时产出空串任务号

- **文件**：`src/services/error-map.ts:127-131`
- **问题**：`status === 202` 分支在 body 无 `data.taskId` 时返回 `taskId: String(task.taskId || '')` 即**空串**，下游以空 id 轮询状态将必然 404。当前 mock 恒返回 taskId，仅真实后端异常响应时暴露。
- **修复建议**：taskId 为空时降级为 `rejected`（IFC-ERR-016），或在轮询发起前校验非空。

### [P3] M-5 DataTable 跨页/跨筛选选中残留（潜在，当前无启用方）

- **文件**：`src/components/common/DataTable.vue:37-64`
- **问题**：`localSelected` Set 跨 `rows` 变更持久；`toggleAll` 只增删**当前页** rowIds，翻页/筛选后隐藏行的选中态保留并继续随 `update:selectedIds` 抛出。全仓当前**无任何页面启用 `selectable`**（属未接线特性），一旦启用即成为批量误操作隐患。
- **修复建议**：暴露 `clearSelection()` 或在 rows 数据源标识变化时收敛选中集；消费方在筛选条件变化时清空选择。

### [P3] M-6 useRequest 会把 AbortError 原生英文文案透出为用户错误

- **文件**：`src/composables/useRequest.ts:61-66`（配合 `src/services/client.ts:130-133`）
- **问题**：`client.ts` 对 AbortError 选择 rethrow（设计如此），`useRequest` 的 catch 将 `e.message` 直接写入用户可见错误。若某调用方经 useRequest 发起且被 abort，界面会闪现英文原生 abort 文案。当前唯一 AbortController 使用方（`BatchOperationPage.vue:71-75`）自行捕获且不经 useRequest，故为潜在路径。
- **修复建议**：useRequest catch 中识别 `DOMException(name==='AbortError')` 时静默复位 loading、不写错误态。

### [P3] M-7 通知相对时间使用浏览器本地时区，与全站 Asia/Shanghai 口径不一致

- **文件**：`src/pages/notification/NotificationCenterPage.vue:113-121`
- **问题**：`formatTime` 对超过 1 天的通知以 `d.getMonth()/d.getDate()`（浏览器本地时区）展示日期，与平台统一时区工具 `src/lib/date.ts`（Asia/Shanghai）口径漂移；跨时区浏览器对「昨日」通知可能显示成错误日期。纯展示问题。
- **修复建议**：复用 `formatWeekdayCn`/`formatDateCn` 或基于 `formatDateKey` 计算。

---

## 3. 统计与结论

| 级别 | 数量 | 编号 |
|---|---|---|
| P0 | 0 | — |
| P1 | 0 | — |
| P2 | 3 | M-1、M-2、M-3 |
| P3 | 4 | M-4、M-5、M-6、M-7 |

**总体评价**：代码库健康度高。typecheck/lint/1466 个单测/依赖审计全绿；无调试残留、无类型逃逸、无吞错空 catch；定时器与监听器清理规范（多处带 MRM-xxx 修复注释）；路由守卫双权限链、身份切换清缓存、乐观锁、状态机 `assertTransition` 严格校验等关键机制设计严谨且有测试覆盖。历史 P1（面试官附件不可见）已验证修复。现存问题集中在 **mock 契约与真实后端接缝**（M-1/M-3/M-4）与**低概率并发窗口**（M-2），建议在真实后端接入前优先处理 M-1 与 M-3。

## 4. 修复优先级建议

1. **尽快**：M-1（mock 下载鉴权对齐导出下载口径，防止契约级越权被照抄）。
2. **真实后端联调前**：M-3、M-4（幂等键与 202 语义）。
3. **随手修**：M-2（代次防护约 10 行改动）、M-6、M-7。
4. **接线前**：M-5（DataTable 选择机制启用任何消费方之前）。
