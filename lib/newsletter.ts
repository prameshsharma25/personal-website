// A public hosted signup form is all the website needs. No subscriber API key.
export function newsletterSignupUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

// Next.js substitutes this public setting at build time.
export const NEWSLETTER_URL = newsletterSignupUrl(process.env.NEXT_PUBLIC_NEWSLETTER_URL);
