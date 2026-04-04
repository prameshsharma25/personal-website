import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Navbar from '../components/Navbar';
import Script from 'next/script';
import { Analytics } from "@vercel/analytics/next"

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2651199811728382"
        crossOrigin="anonymous"
        strategy="beforeInteractive"
      />
      <Navbar />
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
