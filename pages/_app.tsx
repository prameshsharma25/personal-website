import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import NewsletterProvider from '../components/NewsletterProvider';
import { Analytics } from "@vercel/analytics/next"
import { useRouter } from 'next/router';

export default function MyApp({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  return (
    <NewsletterProvider>
      <a href="#main-content" className="skipLink">Skip to content</a>
      <Navbar />
      <div id="main-content" tabIndex={-1}><Component {...pageProps} /></div>
      <Footer />
      {!pathname.endsWith('/thanks') && !pathname.startsWith('/newsletter') && <Analytics beforeSend={event => { const path = new URL(event.url).pathname; return path.startsWith('/newsletter') || path.endsWith('/thanks') ? null : event; }} />}
    </NewsletterProvider>
  );
}
