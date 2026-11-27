import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PageMotion from '../components/PageMotion';
import { Analytics } from '@vercel/analytics/next';
import { useRouter } from 'next/router';
import localFont from 'next/font/local';
import PortfolioShortcut from '../components/PortfolioShortcut';
import shortcutStyles from '../styles/PortfolioShortcut.module.css';

const bodyFont = localFont({ src: '../public/fonts/Manrope-Latin.woff2', weight: '200 800', display: 'swap', variable: '--font-body', adjustFontFallback: 'Arial' });
const displayFont = localFont({ src: '../public/fonts/SpaceGrotesk-Latin.woff2', weight: '300 700', display: 'swap', variable: '--font-display', adjustFontFallback: 'Arial' });

export default function MyApp({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  const showPortfolioShortcut = pathname !== '/tools' && !pathname.startsWith('/tools/');
  return <div className={`${bodyFont.variable} ${displayFont.variable} siteShell ${showPortfolioShortcut ? shortcutStyles.withShortcut : ''}`}>
    <div className="ambientField" aria-hidden="true"><span /><span /></div>
    <a href="#main-content" className="skipLink">Skip To Content</a>
    <Navbar />
    <PageMotion><Component {...pageProps} /></PageMotion>
    <Footer />
    {showPortfolioShortcut && <PortfolioShortcut active={pathname === '/road-to-10000'} />}
    {!pathname.endsWith('/thanks') && <Analytics beforeSend={event => new URL(event.url).pathname.endsWith('/thanks') ? null : event} />}
  </div>;
}
