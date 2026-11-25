import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PageMotion from '../components/PageMotion';
import { Analytics } from '@vercel/analytics/next';
import { useRouter } from 'next/router';

export default function MyApp({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  return <>
    <a href="#main-content" className="skipLink">Skip to content</a>
    <Navbar />
    <PageMotion><Component {...pageProps} /></PageMotion>
    <Footer />
    {!pathname.endsWith('/thanks') && <Analytics beforeSend={event => new URL(event.url).pathname.endsWith('/thanks') ? null : event} />}
  </>;
}
