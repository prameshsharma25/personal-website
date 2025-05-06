import Head from 'next/head';
import Navbar from '../components/Navbar';

export default function Home() {
  return (
    <div>
      <Head>
        <title>Pramesh Sharma </title>
        <meta name="description" content="Welcome to my personal website!" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1>Welcome to My Personal Website</h1>
        <p>This is a simple Next.js application.</p>
      </main>
    </div>
  );
}
