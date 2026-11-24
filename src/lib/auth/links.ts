/** Sign-in page of the locale of `returnTo` ("/ro/..." or "/en/..."), coming back to it afterwards. */
export function loginHref(returnTo: string): string {
  const locale = returnTo.startsWith("/en") ? "en" : "ro";
  return `/${locale}/autentificare?next=${encodeURIComponent(returnTo)}`;
}
