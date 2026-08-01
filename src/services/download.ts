export function openAuthorizedDownload(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false

  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return false
  }

  const isSameOriginHttp = url.origin === window.location.origin && url.protocol === 'http:'
  if (url.protocol !== 'https:' && !isSameOriginHttp) return false

  const link = document.createElement('a')
  link.href = url.href
  link.rel = 'noopener noreferrer'
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}
