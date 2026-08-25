/**
 * 幂等键状态机（独立模块）。
 *
 * 将幂等键表从 client.ts 主模块中拆分出来：
 * 1. 隔离「请求发送」与「幂等键生命周期管理」两类职责，client.ts 只依赖对外接口；
 * 2. 测试钩子（__testing_*）放在本内部模块，不再污染 client.ts 对外的公共 API。
 *
 * 生命周期规则（对应缺陷 M-3）：
 * - 键 TTL 为 IDEMPOTENCY_TTL_MS（15 分钟）；
 * - 请求成功（204/非 202 的 2xx）后按指纹删除；
 * - 失败/网络错误/超时等路径不删除，由 cleanupExpiredIdempotencyKeys 按 1 分钟节流回收过期条目，
 *   避免 Map 无限增长（仅在生成/查询键时按需触发，不引入额外定时器）。
 */

const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000
/**
 * 过期幂等键清理的最小间隔（毫秒）。
 * - 选取 1 分钟：与 TTL（15 分钟）同量级，节流遍历开销；
 * - 仅在生成/查询键时按需触发，不引入额外定时器，避免无活动页面空跑。
 */
const IDEMPOTENCY_CLEANUP_INTERVAL_MS = 60 * 1000

const pendingIdempotencyKeys = new Map<string, { key: string; expiresAt: number }>()
let lastIdempotencyCleanupAt = 0

function generateIdempotencyKey(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`
}

/**
 * 清理已过期的幂等键条目，避免 Map 随失败请求无限增长（M-3 生命周期缺陷）。
 * 按 lastIdempotencyCleanupAt 节流，调用方可无负担。
 */
function cleanupExpiredIdempotencyKeys(now: number): void {
  if (now - lastIdempotencyCleanupAt < IDEMPOTENCY_CLEANUP_INTERVAL_MS) return
  lastIdempotencyCleanupAt = now
  for (const [fingerprint, entry] of pendingIdempotencyKeys) {
    if (entry.expiresAt <= now) {
      pendingIdempotencyKeys.delete(fingerprint)
    }
  }
}

/**
 * 取得（或生成并登记）指定指纹的幂等键。过期条目在访问时按节流回收，不额外开定时器。
 * @param fingerprint 请求意图指纹（method/path/action/targetId/expectedVersion/body 序列化）。
 */
export function getIdempotencyKey(fingerprint: string): string {
  const now = Date.now()
  // 顺手清理：访问即触发按节流的过期回收（避免为清理单独开定时器）
  cleanupExpiredIdempotencyKeys(now)
  const existing = pendingIdempotencyKeys.get(fingerprint)
  if (existing && existing.expiresAt > now) return existing.key
  const key = generateIdempotencyKey()
  pendingIdempotencyKeys.set(fingerprint, { key, expiresAt: now + IDEMPOTENCY_TTL_MS })
  return key
}

/**
 * 请求成功后按指纹删除幂等键，避免键被复用（幂等键生命周期结束）。
 * @returns 是否存在并删除了该指纹条目。
 */
export function removeIdempotencyKey(fingerprint: string): boolean {
  return pendingIdempotencyKeys.delete(fingerprint)
}

/**
 * 仅供测试使用：返回当前 pending 幂等键表大小（验证 M-3 过期清理）。
 * 不要在业务代码中调用。
 */
export function __testing_pendingIdempotencyKeyCount(): number {
  return pendingIdempotencyKeys.size
}

/**
 * 仅供测试使用：重置 pending 幂等键表与清理节流（隔离测试用例）。
 * 不要在业务代码中调用。
 */
export function __testing_resetPendingIdempotencyKeys(): void {
  pendingIdempotencyKeys.clear()
  lastIdempotencyCleanupAt = 0
}
