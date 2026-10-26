/**
 * Pages anyone can open without logging in. They render without the app chrome (navbar,
 * live call connection). Intuit requires the terms and privacy pages to be public.
 */
export const PUBLIC_PAGES = ["/login", "/terms", "/privacy"];

export function isPublicPage(pathname: string | null): boolean {
  return !!pathname && PUBLIC_PAGES.includes(pathname);
}
