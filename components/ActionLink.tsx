import Link from 'next/link';
import { track } from '@vercel/analytics';
import type { AnchorHTMLAttributes } from 'react';
export function recordAction(action: string, source: string) {
  // Never send emails, payment references, or personal data in analytics events.
  try { track(action, { source }); } catch { /* Analytics must not block navigation. */ }
}
type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; event: string; source: string };
export default function ActionLink({ href, event, source, children, onClick, ...props }: Props) {
  const click: Props['onClick'] = (e) => { recordAction(event, source); onClick?.(e); };
  if (href.startsWith('https:') || props.download) return <a href={href} onClick={click} {...props}>{children}</a>;
  return <Link href={href} onClick={click} {...props}>{children}</Link>;
}
