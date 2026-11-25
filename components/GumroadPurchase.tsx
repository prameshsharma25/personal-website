import Script from 'next/script';
import type { ReactNode } from 'react';

export default function GumroadPurchase({ href, className, children }: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return <>
    <a href={href} className={className} rel="noopener noreferrer">{children}</a>
    {/* Next deduplicates this script across products and client-side navigation.
        The ordinary link also works without JavaScript or if the widget is blocked. */}
    <Script id="gumroad-overlay" src="https://gumroad.com/js/gumroad.js" strategy="afterInteractive" />
  </>;
}
