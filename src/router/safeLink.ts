import router from './index'

export function isSafeInternalLink(link: string | null | undefined): link is string {
  if (!link) return false
  return link.startsWith('/') && !link.startsWith('//') && !link.startsWith('/\\') && !/^[a-z][a-z0-9+.-]*:/i.test(link)
}

export function navigateByLink(link: string | null | undefined): void {
  if (!isSafeInternalLink(link)) return
  void router.push(link)
}
