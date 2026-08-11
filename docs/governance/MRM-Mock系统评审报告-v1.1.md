# MRM Mock 系统评审报告 v1.1

> 审查对象：`src/mock/*`（含 `state-machines/`）与根目录 `mock-plugin.ts`，共 17224 行

## 评审基线

| 项 | 值 |
|---|---|
| 仓库 | `https://cnb.cool/gdmuna/program/ranaminder/ranaminder-web.git` |
| 分支 | `dev` |
| HEAD SHA | `0a7d114bb4600607694119df913dbf770f9e123a` |
| 评审日期 | 2026-08-07 |
| 行号快照 | **全部行号引用以该 SHA 为准**；代码演进后复核需 `git checkout 0a7d114` 对照 |

**行号漂移实证**：既往评审记录的乐观锁问题位于 `index.ts:377-379`，基线快照实测位于 `index.ts:515-529`（漂移约 138 行）。本报告所有条目按基线 SHA 复核，未沿用既往评审行号。

## 版本关系（既往 PR 评审对照）

| PR | 主题 | 合并状态 | 快照 |
|---|---|---|---|
| #68 | P1-006 演示性缺陷修复 | 已合入（= 基线 HEAD） | `0a7d114` |
| #67 | P0-004 职位 Group 同步 | 已合入 | `469a03d` |
| #74 | P1-013 联合评价修改历史 | 已合入 | `b93211f` |
| #62 | P1-005 模板映射 | **未合入**（分支 `origin/feat/P1-005-template-mapping`） | 分支 HEAD `0876edd` |
| #73 | P2-015/017 演示导出统计运维 | **未合入**（分支 `origin/fix/demo-exp-stat-ops`） | 分支 HEAD `41aac71` |

- 正文条目（MRM-001~040）均属于基线快照 `0a7d114`，可直接复核。
- 未合入 PR 的评审发现列入**附录 A**，标注分支 SHA 与当前状态，合入前需重新核对。
- 统计口径：路由数为 `grep -c "url: '/api"`（index.ts 158 + recruitment-api.ts 112 = 270 定义，含按 HTTP method 拆分的同名路由）；`resolveMockError` 调用 18 处 + 定义/导入 1 处（grep 命中 19 行）。

## 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-08-07 | 初版：36 项问题 |
| v1.1 | 2026-08-07 | ① 新增评审基线（分支/HEAD/行号快照）与 PR 版本关系；② 补齐既往 PR 评审发现的 7 项问题（4 项并入正文 MRM-007/008/021/022，3 项入附录 A）；③ 全部问题重排为 MRM-001~043 连续编号并补充验证方法；④ 新增附录 B 安全专项评估、附录 C 问题清单跟踪表；⑤ 统计口径统一（实测行数 17224、路由计数方法注明）；⑥ P3 呈现格式由表格统一为编号列表 |

## 评审范围（实测行数）

| 模块 | 文件 | 行数 |
|---|---|---|
| 分发层 | `mock-plugin.ts` | 164 |
| 注册表 | `src/mock/index.ts` | 3583 |
| 招新业务 | `src/mock/recruitment-api.ts` | 2136 |
| 通知业务 | `src/mock/notifications.ts` | 648 |
| 数据库层 | `db.ts` 793 + `db-recruitment.ts` 2540 + `db-organization.ts` 764 + `db-forms.ts` 388 + `db-audit.ts` 48 + `db-corrections.ts` 67 | 4600 |
| 身份与会话 | `auth.ts` | 517 |
| 状态机 | `state-machines/transitions.ts` 638 + `index.ts` 125 | 763 |
| 工具 | `errors.ts` 92 + `reset.ts` 85 + `pagination.ts` 7 + `types.ts` 6 | 190 |
| 测试 | 20 个 `*.test.ts`（4524）+ `state-machines/spec-306.test.ts`（99） | 4623 |
| **合计** | | **17224** |

## 问题分级说明

| 级别 | 含义 | 数量 | 编号 |
|---|---|---|---|
| P0 | 功能性缺陷 / 契约破坏 / 状态机被绕过，直接影响功能正确性或联调可信度 | 6 | MRM-001~006 |
| P1 | 测试稳定性 / 状态泄漏 / 高影响一致性缺陷 | 14 | MRM-007~020 |
| P2 | 契约不一致 / 代码质量 / 中影响缺陷 | 14 | MRM-021~034 |
| P3 | 低影响代码质量 / 注释漂移 / 守卫缺失 | 6 | MRM-035~040 |
| 附录 A | 基线外（未合入 PR）预审发现 | 3 | MRM-A1~A3 |
| **合计** | | **43** | |

---

## P0 严重

### MRM-001 畸形百分号编码导致未捕获异常，错误契约被绕过

- **位置**: `mock-plugin.ts:27, 111-114`
- **证据**: 路径参数用 `decodeURIComponent(match[index+1])` 解码（第 27 行），而 `matchRoute` 调用发生在第 120 行 `try` 块**之前**。畸形编码（如 `/api/org/%zz/members`）直接抛 `URIError`，插件中间件同步崩溃，Vite 返回 HTML 500 页而非约定的 JSON 错误信封。
- **影响**: 异常 URL 绕过 `{code:'IFC-ERR-017'}` 错误契约；dev server 错误路径不可控。
- **建议**: 将整个匹配逻辑移入 `try`，解码失败返回 400。
- **验证方法**: dev server 下请求 `/api/org/%zz/members`，观察响应为 HTML 500 而非 JSON 信封；或单测调用 `matchRoute` 传入畸形 URL 断言抛 `URIError`。

### MRM-002 路径参数合并方向相反，查询参数可覆盖路径参数（越权数据读取）

- **位置**: `mock-plugin.ts:144` 与 `src/mock/index.ts:378`
- **证据**: 两层合并方向相反——
  - `mock-plugin.ts:144`: `query: { ...searchParams, ...matched.params }`（路径参数优先）
  - `index.ts:378` `mergePathParams`: `query: { ...pathParamsFrom(...), ...request.query }`（**query 覆盖路径参数**，最终生效）
- **影响**: `/api/org/club-001/members?clubId=club-002` 返回 club-002 的数据；所有以 `query.clubId` 做数据范围的 handler（约 60 个）受影响，可越权读取其他社团数据。
- **建议**: 统一为路径参数优先 `{ ...request.query, ...pathParamsFrom(...) }`，并删除 `mock-plugin.ts` 中冗余合并。
- **验证方法**: dev server 请求 `/api/org/club-001/members?clubId=club-002`，对比无 query 时的返回数据是否不同。

### MRM-003 IFC-ERR-012 被误用作"文件不存在"（404），与 503 语义冲突

- **位置**: `index.ts:2247, 2271, 3558`（三处相同模式）
- **证据**: 三处 `{ statusCode: 404, body: { code: 'IFC-ERR-012', message: '文件不存在或已过期' } }`；而 `errors.ts:63` 定义 `IFC-ERR-012 → 503「依赖服务不可用」`，`error-map.ts:49` 中 `ERROR_AUTO_RETRY['IFC-ERR-012'] = true`，前端 `error-map.test.ts:36-38` 钉死"仅 012 可自动重试"。
- **影响**: 终端性 404 被归类为"依赖服务暂不可用"，触发无意义自动重试；HTTP 404 与错误码 503 语义自相矛盾；`errorToPageState` 状态分类失真。
- **建议**: 文件不存在统一改用 `IFC-ERR-015`（404，不存在或不可见），012 仅留给真实依赖故障。
- **验证方法**: 请求 `/api/files/file-999`（不存在）观察 404 + `IFC-ERR-012`；对照 `errors.ts:63`（012 应映射 503）即复现矛盾。

### MRM-004 `/api/files/:fileId` GET 双注册：一份死代码、一份无校验，契约分裂

- **位置**: `recruitment-api.ts:1403-1412` 与 `index.ts:2242-2263`
- **证据**: 同一 URL+method 注册两份，specificity 同为 19，稳定排序下**靠前的 `recruitmentApiHandlers`（index.ts:3578）胜出**，`index.ts:2242` 版本永不生效：
  - 胜出版（recruitment-api.ts:1406）：无存在性校验，任意 fileId（甚至空值 `|| 'file-001'`）返回固定 `作品集.pdf / 1MB / status:'approved'`
  - 死代码版（index.ts:2244）：要求 `file-` 前缀否则 404，返回 `报名附件.pdf / status:'clean'`
- **影响**: ① 前端 FilePreviewPage 拿到的元数据取决于"谁注册靠前"的隐性顺序；② 同批文件 status 来源混乱（上传端点返回 `clean`，预览返回 `approved`）；③ "文件不存在"404 分支永远无法触发。
- **建议**: 删除 `recruitment-api.ts:1403` 的重复注册，统一保留 index.ts 版本并补存在性校验。
- **验证方法**: 请求 `/api/files/file-999`，若返回 `approved`/`作品集.pdf` 即证明胜出版无校验生效；删除 `recruitment-api.ts:1403` 注册后行为应改变。

### MRM-005 非法状态 `'removed'` 直接写入，不在 SM-MEM-001 状态集合内

- **位置**: `index.ts:1740-1744`；`transitions.ts:452-456`；`db.ts:75`
- **证据**: 移除成员端点直接 `member.status = 'removed'`、职位 `p.status = 'ended'`；而状态机 SM-MEM-001 中 `removed` 是**事件**（`active --removed--> exiting`），`'removed'` 并非可达状态（可达集：non_member/pending_effective/active/exiting/exited/sync_anomaly）。
- **影响**: 产生状态机体系之外的非法状态；`createMemberFromAdmission`（db.ts:609）排除 exited/removed 成员复用，被移除成员无正规恢复路径；状态机守卫对这条路完全失效。
- **建议**: 走 `active --removed--> exiting --confirmed--> exited` 正规链路，或在 transitions.ts 增加 `removed` 终态并统一 db 类型、状态机、写入点三处。
- **验证方法**: 调用移除成员端点后断言 `member.status === 'removed'`，再对照 `transitions.ts:452` 的 SM-MEM-001 可达状态集确认其为非法值。

### MRM-006 测试路径与 dev server 路径行为分叉（同一 handler 两条执行逻辑）

- **位置**: `recruitment-api.ts:70-101`（`withStatus.rawResponse`，测试用）vs `mock-plugin.ts:109-160`（dev server 用）
- **证据**: 7 个测试文件通过 `handler.rawResponse(req, res)` 调用，而 Vite 插件调用 `handler.response(...)`。差异：
  1. JSON 解析失败：rawResponse 路径静默返回 `{}`（`recruitment-api.ts:38-39`），插件路径返回 400 `IFC-ERR-017` → **400 分支在测试中永远无法触发**
  2. rawResponse 路径不支持 multipart
  3. 插件路径额外处理 `headers` 透传，rawResponse 不处理
- **影响**: 测试"通过"不代表 dev server 行为正确，契约漂移无守卫。
- **建议**: 测试统一走插件分发逻辑，或把 `withStatus` 收敛为单一实现。
- **验证方法**: 通过 `rawResponse` 发送畸形 JSON 请求，断言返回 `{}` 而非 400；同请求经 dev server 走插件路径则返回 400。

---

## P1 高

### MRM-007 资料乐观锁：版本登记先于保存生效，空 `input:{}` 也消耗版本号

- **位置**: `index.ts:515-529`（`PUT /api/auth/profile`）
- **证据**: `profileLatestVersion[user.id] = currentVersion + 1`（:529）在字段保存（:531-532）**之前**无条件执行；`body.input || {}`（:530）为空对象时仍消耗一个版本号。即"空提交"也推进版本，`expectedVersion` 校验通过一次后同版本再提交必 409。
- **影响**: 前端"空表单保存"或重复保存场景下版本号漂移，与实际内容变更不对等；乐观锁语义（版本 = 内容版本）被破坏。
- **建议**: 先校验 input 非空/有实际变更再登记版本；或版本登记与保存原子化（保存成功才 +1）。
- **验证方法**: 连续两次 PUT `/api/auth/profile`（第二次 `expectedVersion` 用第一次返回的 version）均返回 200 且版本递增，第三次同 expectedVersion 返回 409——空变更也消耗版本。
- **来源**: PR #68 评审确认。

### MRM-008 db.ts ↔ db-organization.ts 运行时循环依赖（ESM 时序敏感）

- **位置**: `db.ts:6`（`import { syncPositionMembership } from './db-organization'`）与 `db-organization.ts:9`（`import { getMemberStats } from './db'`）
- **证据**: 两文件互相导入对方导出；当前因两处均在函数体内调用（顶层无互相求值）而运行正常，但 ESM 初始化顺序一改（如新增顶层引用、重新导出、tree-shake 变更）即可能拿到未初始化绑定。
- **影响**: 隐性时序耦合，重构/升级打包器时存在挂载顺序风险；依赖图无法静态闭环分析。
- **建议**: 将 `syncPositionMembership` 或 `getMemberStats` 下沉到第三个模块（如 `db-shared.ts`）或改函数注入。
- **验证方法**: `grep -n "from './db"` 与 `from './db-organization'` 两文件相互命中即复现；用 `madge`/`circular-dependency-plugin` 验证依赖环。
- **来源**: PR #67 评审确认。

### MRM-009 导出任务 setTimeout 无主定时器 + 共享状态永不重置

- **位置**: `index.ts:2741-2747`
- **证据**: `exportTasks.push(task)` + `setTimeout(() => { task.status='completed'; ... Math.random() ... }, 3000)`；`exportTasks` 种子在 `index.ts:341-344`，全库无 reset 入口（grep 确认 reset.ts 无 exports 相关项）。
- **影响**: ① dev 会话中反复 POST exports 数组无上限增长（内存）；② 随机响应不可断言；③ `generating→completed` 时序不可控；④ 零测试覆盖。
- **建议**: 提供 `resetExportTasks()`；随机值确定性生成；延迟抽成可注入时钟。
- **验证方法**: dev server 连续 POST 创建导出任务，观察 `exportTasks` 数组无回落途径（无 reset 导出）。

### MRM-010 平台域共享状态缺失重置（测试顺序依赖）

- **位置**: `index.ts:26 (reauthProofs)`、`204 (permissionTemplates)`、`205 (templatePreviewVersion)`、`218-223 (retentionPolicies/retentionPreviewVersion)`、`269-272 (resetRetentionState 只还原部分)`、`341 (exportTasks)`
- **证据**: `permissionTemplates.push` 与 publish 就地改 version/status 无 reset；`retentionPolicies.unshift` 与 publish 就地改 status/version，而 `resetRetentionState` 只还原 `retentionSubjects`/`lastRetentionExecution`；`templatePreviewVersion`/`retentionPreviewVersion` 递增后不还原；`reauthProofs` Map 无 clear。
- **影响**: 发布策略/模板后其他测试重跑看到已 active 的策略与漂移的版本号；CI 重跑顺序敏感。
- **建议**: 仿照 `resetDb/resetNotifications` 补 `resetPlatformState()`。
- **验证方法**: 先运行 `retention-audit.test.ts`（含发布用例），再运行任一断言策略状态的用例，观察状态泄漏导致失败。

### MRM-011 GET 端点修改全局状态：预览即自增版本号

- **位置**: `index.ts:2625`（`GET .../retention/:policyId/preview` 内 `retentionPreviewVersion += 1`）、`2829`（`GET .../permission-templates/:templateId/diff` 内 `templatePreviewVersion += 1`）
- **影响**: GET 不幂等——预览→关闭→再预览，publish 的版本校验必然 409「影响预览已变化」；无途径预知期望值。
- **建议**: 预览返回当前版本号不自增；由 publish/execute 成功时统一递增。
- **验证方法**: 连续两次 GET preview 端点，观察两次响应 `previewVersion` 递增（或断点观察计数变化）。

### MRM-012 删除执行硬编码 `previewVersion === 4`

- **位置**: `index.ts:2649`
- **证据**: `if (body.input?.previewVersion !== 4) return 409`；而 `retentionPreviewVersion` 初始为 1，递增链脆弱——前端必须恰好把版本推到 4（如预览 1 次→发布→再预览）才能成功，多或少一步都 409，且 409 文案「删除影响预览已变化」对用户不可理解。
- **建议**: 与 publish（:2552）一致，改为 `!== retentionPreviewVersion`。
- **验证方法**: 依次以 previewVersion 3、4、5 调用 `/api/admin/delete/execute`，仅 4 通过——证明魔法数耦合递增链。

### MRM-013 reset 函数与模块级可变状态不对应 → 测试间污染

- **位置**: `db-organization.ts:305/371/373/117`（`positionGroupSeq`/`groupSyncTraces`/`groupSyncTraceSeq`/`memberNames`，`resetOrgDb` 全部不重置）；`db-recruitment.ts:30/2465/2467`（`autoProfileSeq`/`interviewerTasks`/`interviewerTaskSeq`）；`db-forms.ts:317`（`formSeq`）；`reset.ts` 未导出 `resetMockUsers`（auth.ts:381）；`db-member-lifecycle.test.ts` 整个文件无 beforeEach reset
- **影响**: 测试被迫手工 splice 清理（db-recruitment.test.ts:317），用例失败提前退出即污染后续；CI 随机顺序翻车。
- **建议**: 各 reset 补齐对应状态；reset.ts 统一出口调用 resetMockUsers；db-member-lifecycle.test.ts 加 beforeEach。
- **验证方法**: 手动中断（提前失败）一个写入 `interviewerTasks` 的用例后重跑依赖其初始长度的断言，观察失败——证明跨用例残留。

### MRM-014 状态机枚举/契约不一致（多组词表漂移）

- **位置**: `db-recruitment.ts:70`（`ApplicationStatus.accepted` 不在 SM-REC-003）、`:73/222`（`RecInvitationStatus`/`JointInvitationStatus` 缺 `draft`，而 SM-INV-001 有）、`transitions.ts:208`（SM-REC-003 `revised` 死状态，无迁入事件）；`db.ts:75`（`'removed'`，见 MRM-005）
- **影响**: 状态机词表与 db 类型词表双轨漂移，"单一事实来源"承诺（state-machines/index.ts:5-7）落空；spec-306 测试只验证表内部一致性，不验证与 db 类型对齐。
- **建议**: 增加"db 类型枚举 ⊆ 状态机状态集"的编译期/测试期断言。
- **验证方法**: 手工比对 `transitions.ts` 状态集合与 db 层枚举字面量（如 `'accepted'`、`'draft'` 两处不一致）。

### MRM-015 SM-REC-004（部门路径结论）在 db 层完全未接线

- **位置**: `db-recruitment.ts:1424-1518`（`setDeptLabel`/`decidePath`/`setWaitlist`/`publishDepartmentResult` 全部直接写 `path.status`，无 `assertTransition`）
- **影响**: `evaluating→published` 等跳转无守卫，规则收紧时无人拦截；文件头注释声称"状态流转经 state-machines 校验"此处违背。
- **建议**: 补 `assertTransition('SM-REC-004', ...)` 并加全链路测试。
- **验证方法**: 调用 `setDeptLabel`/`decidePath` 从任意状态置 `path.status`，观察无任何状态机校验（grep 该文件无 `SM-REC-004` 引用）。

### MRM-016 slot.taken 容量计数漂移：6 处路径置终态但不释放时段

- **位置**: `db-recruitment.ts:974-979`（cancelActivity）、`:1000-1005`（forceCompleteActivity）、`:1334-1339`（withdrawApplication）、`:1401-1406`（publishNotQualified）、`:2290-2294`（cancelJointActivity）、`:2407-2411`（forceCloseJointActivity）——均不减 `slot.taken`；对比正确路径 markAttendance(1125)/skipRoundInterview(1180)/cancelRound(1058)/invalidateJointInterview(1966) 都释放。
- **影响**: 容量永久虚高 → `slot.taken >= slot.capacity` 误报"已满员"，面试无法预约。
- **建议**: 统一释放逻辑为共享函数并补守恒测试。
- **验证方法**: 填满 slot 后取消一个面试，再尝试预约——`taken` 未回落导致误报满员。

### MRM-017 同一实体名称/身份跨模块矛盾（副本数据漂移）

- **位置**: club-002：`auth.ts:97`（网络协会）vs `db-organization.ts:137`（电子设计协会）；mem-101：`db.ts:303`（张明远）vs `db-organization.ts:119`（赵子涵）；club-003：`db-recruitment.ts:1623`（羽毛球协会）vs `db-organization.ts:144`（数学建模协会）；mem-004：`db.ts:257`（技术部）vs `db.ts:260/263`（管理）
- **影响**: 切换社团/跨模块详情姓名、社团名不一致；联合活动可能带错误社团名。
- **建议**: 名称收敛到单一种子源（如 clubRegistry），跨模块引用而非复制。
- **验证方法**: 页面切换 club-002 后在成员页/社团页观察名称不一致；或 grep 三处 club-002 定义对比。

### MRM-018 外键悬挂：Group 成员引用不存在的 db.members

- **位置**: `db-organization.ts:76-88`（grp-002 含 mem-102，grp-003/004/005 的 mem-201~403 均不存在于 db.members）
- **影响**: `getGroupDetail` 显示无头像/无档案的悬空成员；`memberCount` 口径不一致（club-002：db 统计 1 人 vs Group 2 人）。
- **建议**: 对齐种子数据或允许 Group 引用虚拟成员并在 UI 降级展示。
- **验证方法**: 调用 `getGroupDetail('grp-002')` 观察成员列表含 `mem-102`，再 `db.findMember('club-002','mem-102')` 返回 undefined。

### MRM-019 换届执行整体在 handler 层实现，绕过 db 封装与状态机；重试为"假重试"

- **位置**: `index.ts:1776-1845`（直接写 `member.status='exited'`、`pos.status='ended'`、`db.transitionState` 直接赋值、失败注入硬编码 `mem-002`）；`/transition/retry` 仅把 results 标记 `success: true`，**不执行任何真实数据变更**
- **影响**: 重试后展示"已生效"但库里无变化；换届链路与 `executeAppointmentCommand` 语义分裂。
- **建议**: 迁入 db 封装，retry 重放真实变更。
- **验证方法**: 触发换届失败后调用 `/transition/retry`，随后检查职位/Group 实际数据——返回 success 但数据未变即复现。

### MRM-020 管理端权限守卫严重不一致 + 导出链路契约分裂

- **位置**: 无守卫——`index.ts:2912/2926/2934`（config/stats）、`2958-3005`（admin/exports）、`3221-3296`（admin/forms designer 全家族）、`3498-3529`（admin 列表）；有守卫——audit/corrections/notifications/clubs/retention/permission-templates。
- **导出分裂**: `GET /api/admin/exports`（:2961）返回硬编码 `exp-003`（downloadUrl:'#'），不读取 POST 创建的 `exportTasks`；`downloadUrl: '#exp-xxx'` 与 `services/download.ts:11` 要求 http(s) 的契约冲突。
- **影响**: 非管理员 mock 用户可访问管理端表单设计器/统计/导出（假阳性）；管理端导出列表永远看不到新建任务；'#' 片段 URL 直接下载静默失败。
- **建议**: 统一补守卫（对照 1877-2032 模式）；GET 复用 exportTasks；统一 downloadUrl 语义。
- **验证方法**: 以 `_mock_user=member` 请求 `/api/admin/forms/designer/:formId` 与 `/api/admin/stats`，返回 200 而非 403；POST 创建导出任务后 GET 列表不包含新任务。

---

## P2 中

### MRM-021 联合评价 history 条目 `updatedAt` 复用旧 `concludedAt`

- **位置**: `db-recruitment.ts:651`（`upsertJointReviewExtra`）
- **证据**: history 写入 `{ ..., concludedAt: existing.concludedAt, version: existing.version, updatedAt: existing.concludedAt || new Date().toISOString() }` ——历史条目的 `updatedAt` 直接取旧 `concludedAt`，语义错误（历史变更的"修改时间"应为本次写入时刻），且存在与 `concludedAt` 恒等的死分支（`||` 永不触发）。
- **影响**: 审计/展示修改历史时时间线失真；死分支误导后续维护。
- **建议**: 历史条目 `updatedAt` 用写入时刻；`concludedAt` 保留修改前值。
- **验证方法**: 两次修改同一联合评价后读取 history，末条 `updatedAt ===` 首次 `concludedAt` 即复现。
- **来源**: PR #74 评审确认。

### MRM-022 `DEMO_ROLES` 模块加载时快照，reset 后不更新

- **位置**: `auth.ts:457`（`export const DEMO_ROLES = Object.entries(mockUsers).map(...)` 模块加载时求值）vs `auth.ts:381-382`（`resetMockUsers` 重新赋值 `mockUsers`）
- **证据**: `DEMO_ROLES` 是加载时对 `mockUsers` 的快照引用；`resetMockUsers()` 使 `mockUsers` 指向全新对象，但 `DEMO_ROLES` 仍持有旧引用/旧值；运行期 profile 变更（改邮箱/手机号）后登录页演示目录与实际会话数据漂移。
- **影响**: 演示登录页展示的身份目录与当前 mock 会话数据不一致；reset 后尤其明显。
- **建议**: 改为函数 `getDemoRoles()` 每次按当前 `mockUsers` 求值，或在 `resetMockUsers` 内同步重建。
- **验证方法**: 修改某 mock 用户资料后调用 `resetMockUsers()`，读取 `DEMO_ROLES` 观察仍为旧值。
- **来源**: PR #68 评审确认。

### MRM-023 分页契约分裂：`paginate()` 死代码，`nextCursor` 恒为 null

- **位置**: `pagination.ts:2-7`（`{items,total}` 模型）vs `types/contracts/index.ts:7-10`（`{items,nextCursor}`）；全部 list handler 返回 `{items, nextCursor: null}` 并忽略 client 的 `cursor/limit` 参数（`client.ts:168`）
- **影响**: 前端"下一页/加载更多"逻辑永远无法验证（全量返回）。
- **建议**: 删除 `paginate()`，或按 `cursor/limit` 实现真切片。
- **验证方法**: 任意列表端点传 `limit=1`，返回仍为全量且 `nextCursor: null`。

### MRM-024 文件上传 size/mimeType 伪造，multipart 的 Content-Type 未解析

- **位置**: `mock-plugin.ts:73`（认真计算了 size）vs `index.ts:2287-2299`（忽略 `body.input?.size`，返回 `Math.random()` 大小与固定 octet-stream）；下载 URL 强制拼接 `.csv`（2277）
- **建议**: `readMultipartBody` 增加 contentType 提取；handler 回传真实 size。
- **验证方法**: 上传 1MB 文件，断言响应 size 与真实不符（随机值）且 mimeType 恒为 octet-stream。

### MRM-025 错误信封三套不一致格式

- **位置**: `errors.ts:86-91`（`MOCK-<base36>`）vs `index.ts:1852/1855`（`supportId:'MOCK'`）vs 约 30 处手写无 supportId（如 :2550/2805/2849）
- **建议**: 全量收敛到 `mockErrorBody` + 统一 404/401/409 工厂函数。
- **验证方法**: 触发多个错误码观察 supportId 三种形态（`MOCK-XXXXXX` / `MOCK` / 缺失）。

### MRM-026 插件 400/500 错误体与 errors.ts 文案/结构不一致

- **位置**: `mock-plugin.ts:156/159`（文案「请求体 JSON 解析失败」「模拟服务处理失败」；IFC-ERR-016 语义为「安全提交失败」；均无 supportId）
- **建议**: 复用 `mockErrorBody` + `MOCK_ERROR_MESSAGES`。
- **验证方法**: 发送畸形 JSON，对比插件 400 文案与 `errors.ts:47` 定义。

### MRM-027 路由特异性计算对参数惩罚不足，靠数组顺序消歧（隐性契约）

- **位置**: `mock-plugin.ts:28`（`segments*10 - names.length`）+ `index.ts:1212/1845` 注释（"静态路由必须排在动态 :memberId 之前"）
- **证据**: `/members/transition`、`/members/exit`、`/members/:memberId` 特异性同为 39，全靠数组顺序决胜（V8 稳定排序掩盖）。
- **建议**: 特异性改为强序（如静态段优先），并加启动期路由冲突检测。
- **验证方法**: 在 handlers 数组将 `/members/exit` 移到 `/members/:memberId` 之后，观察匹配结果静默改变。

### MRM-028 权限模板 diff 基线错误：对比种子而非上次发布版本

- **位置**: `index.ts:2826`（`templateSeed().find(...)` 每次返回原始种子，发布 v2 后再次编辑 diff 仍对比 v1）
- **影响**: 版本化差异预览（US-CFG-01 核心卖点）在二轮编辑后失真。
- **建议**: 从 `permissionTemplates` 取上次 published 快照。
- **验证方法**: 发布 v2 后再次编辑并查看 diff，`added/removed` 仍相对 v1 计算。

### MRM-029 动态 ID 使用 `Date.now()` 前缀，同毫秒并发冲突

- **位置**: `db.ts:449/504/520/532/620/705/739/776` 等约 30 处 `'dap-'/'pos-'/'mem-'/'res-' + Date.now()`；`db-recruitment.ts` 同模式约 20 处
- **影响**: 同毫秒创建两条记录主键冲突，`find` 取到错误记录。
- **建议**: 统一 `prefix + seq++` 或追加随机后缀。
- **验证方法**: 同毫秒连续创建两条记录，断言 ID 相同（快速循环即可复现）。

### MRM-030 db.ts 的 `now` 是模块加载时固定值

- **位置**: `db.ts:171`（`const now = new Date().toISOString()`，模块加载后所有新记录同一时间戳；db-recruitment.ts:52 / db-forms.ts:42 均为函数）
- **建议**: 改为函数调用。
- **验证方法**: 模块加载后间隔数秒创建两条记录，断言 `createdAt` 相同。

### MRM-031 时间格式契约不一致：种子 `+08:00` vs 动态写入 `Z`

- **位置**: 种子（db.ts:207、db-audit.ts:25、db-corrections.ts:47）为 `+08:00` 后缀；动态写入 `toISOString()`（db-audit.ts:44 等）为 `Z`
- **建议**: 统一格式（建议统一 UTC）。
- **验证方法**: `grep -c "+08:00"` 种子数据 vs 动态 `toISOString()` 输出，观察两种后缀并存。

### MRM-032 db.ts 导出全部内部数组，封装名存实亡

- **位置**: db.ts 直接 `export const members/candidates/...`，index.ts 大量 `.filter/.find`（927/1069/1280 等）且至少 5 处直接写字段
- **影响**: 无法审计写入路径；reset 必须依赖 splice 快照恢复，新增表漏 reset 即污染（MRM-013 根因）。
- **建议**: 收敛为读取 API + 写入走封装函数。
- **验证方法**: `grep -n "db\.members\.push\|members\.find"` 观察跨模块直接操作数组。

### MRM-033 状态机接线缺口（多组）

- SM-MEM-004 `sent` 状态分裂：`withdrawInvitation` 绕过状态机直接置 withdrawn（db.ts:544），而 `respondInvitation` 对 sent 状态走 assertTransition 被拒（db.ts:554）→ `createMembershipInvitation` 创建的 sent 邀请只能撤回、无法接受
- SM-FORM-001：`saveFormDraft` 直接 `f.status='draft'` 且允许 published→draft 降级（db-forms.ts:255，无此转换）
- SM-JNT-005：`respondJointInvitation` 两处直接置 rejected/expired（db-recruitment.ts:2090-2114）
- SM-AUD-001：handler 直接 `correctionsDb.unshift` 构造 submitted（index.ts:2337/2420/3072），draft 无产生路径
- 辞职请求（ResignationRequest）无任何状态机支撑（db.ts:154）
- `executeDepartmentApplication` 不写 tenures，与 executeAppointmentCommand/decideResignationRequest 语义不一致（db.ts:502 vs 705/776）
- `disconnectClub` 对 enabled 社团永远失败（db-organization.ts:668 与 SM-ORG-001 无 disconnect 事件）
- **验证方法**: 对 sent 邀请调 accept → 被状态机拒绝；对 published 表单调 saveFormDraft → 降级成功（无守卫）；对 enabled 社团调 disconnect → 恒失败。

### MRM-034 `_mock_error` 注入仅覆盖 11% 的 handler

- **位置**: `errors.ts:1-4` 注释声称"URL 参数或全局开关"，实际 index.ts 158 路由中仅 18 处调用 `resolveMockError`（集中于 identity/notification/personal 域），且无"全局开关"实现；`_mock_user` 未传时默认 leader（auth.ts:487）
- **建议**: 在 `mock-plugin.ts` 统一层拦截 `_mock_error`；默认用户改为明确传参。
- **验证方法**: 对 listHandlers 端点（如 `/api/org/:clubId/recruitment/list`）传 `?_mock_error=IFC-ERR-001`，观察正常返回而非错误。

---

## P3 低

### MRM-035 logout DELETE 与 POST 双实现完全重复

- **位置**: `index.ts:446/638`
- **建议**: 合并复用。
- **验证方法**: 对比两 handler 体内容一致。

### MRM-036 `pathParamsFrom` 重复两份实现

- **位置**: `index.ts:357-369` vs `recruitment-api.ts:55-63`（且合并方向已不一致，见 MRM-002）
- **建议**: 收敛为单一共享实现。
- **验证方法**: diff 两处实现。

### MRM-037 注释与实现漂移（多处）

- **位置**: `index.ts:2867-2868/2283`（"3 秒安全检查"缺失）、`recruitment-api.ts:1401`（文件预览重复实现）、`index.ts:352-356`（引用不存在的 vite-plugin-mock）
- **建议**: 注释与实现同步。
- **验证方法**: 对照注释声明的行为与 handler 实际逻辑。

### MRM-038 `withStatus` 双重包装判断与 `rawResponse` 通道无说明

- **位置**: `index.ts:3583`（对已 withStatus 的 recruitmentApiHandlers 双重包装判断）、`types.ts:5`（rawResponse 无注释）
- **建议**: 收敛判断逻辑并补充通道说明。
- **验证方法**: 阅读 `index.ts:3572-3583` 包装流程。

### MRM-039 死代码与空目录

- **位置**: `reset.ts:34`（`applicantProfiles` 快照种子从未使用）、`fixtures/` 目录为空、`pagination.ts`（见 MRM-023）
- **建议**: 清理。
- **验证方法**: `grep -rn "applicantProfiles"` 确认仅定义处引用。

### MRM-040 插件层低危项汇总

- **位置**: `mock-plugin.ts:123`（HEAD 请求跳过 body 但仍回完整 body；OPTIONS 无处理直接 next()）、`:154-160`（catch 静默吞错无 console.error，真实异常被伪装为"模拟服务处理失败"）、`:85-102`（无 CORS 头、无 `Cache-Control: no-store`）
- **建议**: HEAD 语义修正、catch 补 console.error、dev 专用 CORS + no-store。
- **验证方法**: dev server 发 HEAD 请求观察响应含 body；触发 handler 内部 TypeError 观察控制台无堆栈。

---

## 附录 A 待合并 PR 预审发现（基线外快照）

> 以下条目来自未合入 PR（#62/#73）的既往评审，标注分支 SHA 与**当前状态**；合入 dev 前需在最新分支 HEAD 上复核。

### MRM-A1 platformConfig / platformConfigVersion / adminExportTasks 顶层可变状态纳入 reset（#73）

- **位置**: `origin/fix/demo-exp-stat-ops` 分支（评审时点问题）。
- **证据**: 评审时点 `platformConfig`（index.ts:207）、`platformConfigVersion`（:220）、`adminExportTasks`（:366）为模块级可变状态，reset 体系未覆盖。
- **当前状态**: **已修复**——分支 HEAD `41aac71` 的 commit `84fd3db`（"P2-017：reset 纳入共享状态"）新增 `sharedStateSeed` 与 `resetSharedState()`（index.ts:373-385），并在 `reset.ts` 透传导出，覆盖 exportTasks/adminExportTasks/platformConfig/platformConfigVersion/templatePreviewVersion。
- **验证方法**: `git show origin/fix/demo-exp-stat-ops:src/mock/index.ts | grep -n "resetSharedState"` 确认存在；合入后需确认测试均调用。

### MRM-A2 `completeWizard` deptGroupIds path/ID 两种形态混用（#62）

- **位置**: `origin/feat/P1-005-template-mapping` 分支（HEAD `0876edd`）`db-organization.ts:684`（`club.deptGroupIds = club.wizard?.deptGroups ?? club.deptGroupIds ?? []`）。
- **证据**: 分支将种子 `wizard.deptGroups` 从 path 形态（`'/学校学生组织/计算机协会/技术部'`）迁移为 ID 形态（`'grp-dept-001'`），但 `completeWizard` 直接取 `wizard.deptGroups` 赋给 `deptGroupIds`；前端向导 `echoWizardSelection` 原样回传该值。任一遗留 path 形态来源（旧种子/手写请求）进入后，`ensureMapping(clubId, deptId, ...)`（:564）将用 path 字符串作 groupId 建映射，产生失效映射。
- **当前状态**: **仍存在**（分支 HEAD 未修复）。
- **验证方法**: `git show origin/feat/P1-005-template-mapping:src/mock/db-organization.ts | sed -n '684p'` 确认直接赋值；手工构造 wizard.deptGroups = ['/a/b/c'] 后 completeWizard，观察映射表 groupId 为 path 字符串。

### MRM-A3 `demo-exp-stat-ops.test.ts` 依赖"找不到 handler 抛 throw"的负向实现断言（#73）

- **位置**: `origin/fix/demo-exp-stat-ops` 分支测试 `demo-exp-stat-ops.test.ts:22`（`if (!handler?.rawResponse) throw new Error(...)`）及 P2-2 用例（`expect(() => invokeHandler(...)).toThrow(/handler 未找到/)`）。
- **证据**: 测试通过"注册表里没有该 URL+method"来断言"路由不存在"，将**分发实现细节**（查找抛错）变成测试契约；一旦分发逻辑改为返回 undefined/404 而非 throw，用例即失效（负向误报或漏报）。
- **当前状态**: **仍存在**（分支 HEAD 未修复）。
- **验证方法**: 将 `invokeHandler` 的 `if (!handler?.rawResponse) throw` 改为返回 404 响应，观察 P2-2 用例失败。

---

## 附录 B 安全专项评估

> mock-plugin 作为 dev server 中间件直接处理任意 HTTP 输入，按攻击面逐项评估（`apply: 'serve'`，仅开发环境生效，已核实 `dist/` 无 mock 代码）。

| 攻击面 | 评估 | 结论 |
|---|---|---|
| SSRF | 插件无任何外部网络请求（仅 `new URL(request.url, 'http://localhost')` 解析请求行，mock-plugin.ts:110）；handler 内无 fetch | 低风险 |
| 路径遍历 | 文件下载 URL 全部服务端生成；`/api/mock-files/:fileId` 用正则 `(file-|exp-)[\w.-]+\.csv` 约束（index.ts:3557），`:fileId` 无法含 `/` 或 `..` | 低风险 |
| Header 注入 | `sendMockResponse` 的 headers 全部来自 handler 内部常量，非用户输入（mock-plugin.ts:94） | 低风险 |
| 超大 body / multipart DoS | `rawBody` 分块累积**无大小上限**、multipart 分块无数量/单块大小上限（mock-plugin.ts:124-131）；dev-only 但演示时可能被压测打爆 | **中风险（dev-only）**，建议加 `request.socket` 大小限制或 Content-Length 校验 |
| 错误信息泄露 | 500 返回固定文案「模拟服务处理失败」，无堆栈泄露；但 catch 无 `console.error`（MRM-040），真实异常不可见 | 低风险，附可观测性缺陷 |
| 畸形输入 | 畸形百分号编码导致未捕获异常（MRM-001）；畸形 JSON 返回 400（已处理） | 中风险（dev-only），见 MRM-001 |
| 权限默认值 | `resolveMockUser` 无 `_mock_user` 时默认 leader（auth.ts:487）——mock 层权限缺陷被掩盖，联调真实后端易踩坑 | dev-only 提示 |
| 数据泄漏 | 全部 mock 数据为合成假数据（手机号 `1380000000X`、学号合成、邮箱 `example.edu.cn`），无真实个人信息 | 无风险 |
| `_mock_user`/`_mock_error` 透传 | 参数会透传进 handler 的 `query`，前端若原样转发查询串，真实后端将收到未知参数 | 低风险（联调提醒） |

**总体结论**: dev-only 中间件无 SSRF/路径遍历/注入风险；主要风险点为超大 body 无上限（中）、畸形编码未捕获（MRM-001）、默认 leader 权限掩盖（提示）。正式环境已排除（`apply:'serve'` + 构建产物无 mock 代码）。

---

## 测试覆盖缺口

### A. 完全无测试的 handler 组（index.ts 与 recruitment-api.ts 已被 vitest 排除在覆盖率统计外）

| 域 | 端点 |
|---|---|
| 列表域 | `/api/org/:clubId/recruitment/list`、`/joint/list`、`/forms`、`/api/admin/forms`、`/api/admin/joint`、`/api/admin/recruitment` |
| 导出域 | exports GET/POST、`/:id/download`、`/:id/status`、admin/exports（**同时是 MRM-009 setTimeout 所在**） |
| 权限模板 | 4 个路由（**MRM-028 diff 基线 bug 无守卫**） |
| 删除预览/执行 |（**MRM-012 魔法数无守卫**） |
| 文件域 | `/api/files/:fileId`、`/download`、`/upload`（multipart 仅解析器测试，无 handler 级测试） |
| 批量域 | `/api/org/:clubId/batch/*` |
| 统计/配置 | stats、config、ops-status |
| 个人中心 | `/api/me/todo`、`/ongoing`、`/history`、`/schedule` |
| 身份域 | logout、send-email-code、sync-conflict、casdoor/login-url |
| 成员域 | members/invite、invitations/membership、resignation、exit |
| 平台运维 | import、normal-suspend、force-suspend、recover、disconnect、repair、rebind、reaccess |
| 通知 HTTP 层 | notifications 系列、email-config、kill-switch、preferences、email-outbox、templates（notifications.test.ts 只测 db 层） |

### B. db 函数级零覆盖（节选）

- `db-recruitment.ts` 约 52 个：活动全家族（create/update/publish/pause/cancel/forceComplete）、通道 reopen/pause/resume、`withdrawApplication`、`publishNotQualified`、**SM-REC-004 全链路（setDeptLabel/decidePath/setWaitlist/publishDepartmentResult）**、`createRecInvitation` 系列、联合活动大半、`revokeInterviewerTask`/`expireRoundTasks`、`applicantTimeConflict`
- `db-organization.ts`：`listGroups`；`db-audit.ts`：`writeAuditLog`

### C. 结构性问题（无测试可覆盖）

- 状态机"表内自洽"测试（spec-306）不验证与 db 类型/接线对齐（MRM-014/015）
- handler 直接写库的 5 处（MRM-005/019/033）无任何状态机遵守断言
- reset 完备性无"reset 后各表等于种子"测试（MRM-010/013）
- slot.taken 守恒（MRM-016）无测试
- **无"URL+method 唯一性"守卫测试**（MRM-004 只能靠人工发现）
- `db-member-lifecycle.test.ts` 直接改写内部数组绕过状态机（:102/:122 直接 `status = 'pending_acceptance'`）

---

## 附录 C 问题清单跟踪表

> 状态列待填：`待办 / 处理中 / 已修复`。owner 与计划修复版本按团队排期补充。

| 编号 | 级别 | 快照归属 | 问题摘要 | 验证方法 | 建议 | 状态 | Owner |
|---|---|---|---|---|---|---|---|
| MRM-001 | P0 | 0a7d114 | 畸形编码未捕获异常 | 请求 `/api/org/%zz/members` | 匹配移入 try | | |
| MRM-002 | P0 | 0a7d114 | query 覆盖路径参数越权 | `/org/club-001/members?clubId=club-002` | 统一路径参数优先 | | |
| MRM-003 | P0 | 0a7d114 | IFC-ERR-012 误用 404 | 请求不存在文件 | 改用 IFC-ERR-015 | | |
| MRM-004 | P0 | 0a7d114 | 文件详情双注册 | 请求 `/api/files/file-999` | 删 recruitment-api 重复注册 | | |
| MRM-005 | P0 | 0a7d114 | `removed` 非法状态写入 | 移除成员后断言 status | 走正规迁移链路 | | |
| MRM-006 | P0 | 0a7d114 | 测试/dev 双通道分叉 | rawResponse 发畸形 JSON | 收敛单一分发实现 | | |
| MRM-007 | P1 | 0a7d114 | 乐观锁版本提前消耗 | 空 input 重复提交 | 版本登记与保存原子化 | | |
| MRM-008 | P1 | 0a7d114 | db↔db-organization 循环依赖 | 检查 import 图 | 下沉共享模块 | | |
| MRM-009 | P1 | 0a7d114 | 导出 setTimeout 无 reset | 反复 POST 观察数组 | resetExportTasks + 注入时钟 | | |
| MRM-010 | P1 | 0a7d114 | 平台域状态不重置 | 重跑 retention 测试 | resetPlatformState | | |
| MRM-011 | P1 | 0a7d114 | GET 预览自增版本 | 两次 GET preview | 预览不自增 | | |
| MRM-012 | P1 | 0a7d114 | previewVersion===4 魔法数 | 依次传 3/4/5 | 改为动态版本比对 | | |
| MRM-013 | P1 | 0a7d114 | reset 遗漏模块级状态 | 中断用例后重跑 | 补全 reset + beforeEach | | |
| MRM-014 | P1 | 0a7d114 | 状态机枚举双轨漂移 | 比对枚举字面量 | 类型集断言 | | |
| MRM-015 | P1 | 0a7d114 | SM-REC-004 零接线 | 直接改 path.status | 补 assertTransition | | |
| MRM-016 | P1 | 0a7d114 | slot.taken 6 处不释放 | 取消面试后预约 | 统一释放函数 | | |
| MRM-017 | P1 | 0a7d114 | 名称跨模块矛盾 | 页面交叉对比 | 单一种子源 | | |
| MRM-018 | P1 | 0a7d114 | Group 外键悬挂 | getGroupDetail 检查 | 对齐种子 | | |
| MRM-019 | P1 | 0a7d114 | 换届假重试 | retry 后查数据 | 迁入 db 封装 | | |
| MRM-020 | P1 | 0a7d114 | admin 守卫缺失+导出分裂 | 非管理员访问 | 统一守卫 + 复用 exportTasks | | |
| MRM-021 | P2 | 0a7d114 | history updatedAt 复用旧值 | 两次修改查 history | 用写入时刻 | | |
| MRM-022 | P2 | 0a7d114 | DEMO_ROLES 快照漂移 | reset 后读取 | 改函数求值 | | |
| MRM-023 | P2 | 0a7d114 | 分页契约分裂 | 传 limit=1 | 真分页或删 paginate | | |
| MRM-024 | P2 | 0a7d114 | 上传 size/mimeType 伪造 | 上传后比对 | 解析 Content-Type | | |
| MRM-025 | P2 | 0a7d114 | 错误信封三套格式 | 触发多错误码 | 收敛 mockErrorBody | | |
| MRM-026 | P2 | 0a7d114 | 插件错误文案不一致 | 畸形 JSON | 复用错误文案 | | |
| MRM-027 | P2 | 0a7d114 | 路由特异性隐性契约 | 重排数组顺序 | 强序 + 冲突检测 | | |
| MRM-028 | P2 | 0a7d114 | diff 基线错误 | 发布后二次编辑 | 取上次发布快照 | | |
| MRM-029 | P2 | 0a7d114 | Date.now() ID 冲突 | 同毫秒连建 | prefix+seq | | |
| MRM-030 | P2 | 0a7d114 | now 固定值 | 间隔建两条记录 | 改函数 | | |
| MRM-031 | P2 | 0a7d114 | 时间格式混用 | grep 后缀 | 统一 UTC | | |
| MRM-032 | P2 | 0a7d114 | db 数组全部导出 | grep 直接写库 | 收敛读写 API | | |
| MRM-033 | P2 | 0a7d114 | 状态机接线缺口 7 组 | 逐组复现 | 补接线 | | |
| MRM-034 | P2 | 0a7d114 | _mock_error 仅 11% | 对列表端点注入 | 插件层统一拦截 | | |
| MRM-035 | P3 | 0a7d114 | logout 双实现 | diff 两 handler | 合并 | | |
| MRM-036 | P3 | 0a7d114 | pathParamsFrom 重复 | diff 两实现 | 收敛共享 | | |
| MRM-037 | P3 | 0a7d114 | 注释漂移 | 对照注释与实现 | 同步 | | |
| MRM-038 | P3 | 0a7d114 | 双重包装判断 | 阅读注册流程 | 收敛 | | |
| MRM-039 | P3 | 0a7d114 | 死代码/空目录 | grep 引用 | 清理 | | |
| MRM-040 | P3 | 0a7d114 | 插件 HEAD/OPTIONS/吞错/CORS | HEAD 请求观察 | 逐项修正 | | |
| MRM-A1 | P1 | #73 分支 | platformConfig 系列未入 reset | git show 分支 | 已修复@84fd3db，合入前复核 | | |
| MRM-A2 | P2 | #62 分支 | deptGroupIds path/ID 混用 | 分支 sed 684 | 统一 ID 形态 | | |
| MRM-A3 | P2 | #73 分支 | 负向 throw 断言 | 改分发逻辑测 P2-2 | 改为响应式断言 | | |

---

## 总结

**亮点**：mock 层业务逻辑密度极高（含乐观锁、审计闭环、29 状态机 306+ 规则），db 层测试扎实，数据为合成假数据（无真实个人信息泄漏）。

**三大系统性风险**：
1. **分发层双通道**（插件 `response` vs 测试 `rawResponse`）导致契约漂移无守卫（MRM-006）
2. **平台域内存态与 reset 体系不完整**，测试顺序依赖（MRM-009/010/013）
3. **状态机接线缺口**：词表双轨漂移 + SM-REC-004 等全链路零接线（MRM-005/014/015/033）

**建议修复顺序**：MRM-001~006（P0）→ MRM-007/009/010/011/012（状态与版本号）→ MRM-013（reset 完备性，先于一切测试补充）→ 补守卫测试（URL 唯一性、reset 完备性、slot 守恒）→ 契约对齐（分页、错误码、错误信封、时间格式）→ 附录 A 随 PR 合入复核。
