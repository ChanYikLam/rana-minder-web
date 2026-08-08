/** 服务端分页（IFC-QRY-006）：列表接口统一切片，每页默认 20 条 */
export function paginate<T>(items: T[], query: Record<string, string>, defaultPageSize = 20): { items: T[]; total: number } {
  const page = Math.max(1, Number(query.page) || 1)
  const size = Math.min(100, Math.max(1, Number(query.pageSize) || defaultPageSize))
  const start = (page - 1) * size
  return { items: items.slice(start, start + size), total: items.length }
}
