import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PageMotion from '../components/PageMotion';
import { Analytics } from '@vercel/analytics/next';
import { useRouter } from 'next/router';
import localFont from 'next/font/local';

const bodyFont = localFont({ src: '../public/fonts/Manrope-Latin.woff2', weight: '200 800', display: 'swap', variable: '--font-body', adjustFontFallback: 'Arial' });
const displayFont = localFont({ src: '../public/fonts/SpaceGrotesk-Latin.woff2', weight: '300 700', display: 'swap', variable: '--font-display', adjustFontFallback: 'Arial' });

export default function MyApp({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  return <div className={`${bodyFont.variable} ${displayFont.variable} siteShell`}>
    <div className="ambientField" aria-hidden="true"><span /><span /></div>
    <a href="#main-content" className="skipLink">Skip to content</a>
    <Navbar />
    <PageMotion><Component {...pageProps} /></PageMotion>
    <Footer />
    {!pathname.endsWith('/thanks') && <Analytics beforeSend={event => new URL(event.url).pathname.endsWith('/thanks') ? null : event} />}
  </div>;
}
