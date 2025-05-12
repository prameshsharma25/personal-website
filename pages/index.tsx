import Head from 'next/head';
import Navbar from '../components/Navbar';

export default function Home() {
  return (
    <div>
      <Head>
        <title>Pramesh Sharma </title>
        <meta name="description" content="Welcome to my personal website!" />
      </Head>

      <main>
        <div>
          <p>Hello! I'm Pramesh Sharma, a Software Engineer interested in Machine Learning Infrastructure and Scientific Computing.</p>
        </div>
      </main>
    </div>
  );
}
