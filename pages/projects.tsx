import Head from 'next/head';

export default function Project() {
  return (
    <div>
      <Head>
        <title>My Projects</title>
        <meta
          name="description"
          content="Explore my projects and contributions."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto p-4">
        <h1 className="text-2xl font-bold">My Projects</h1>
        <p className="mt-4">Here are some of the projects I've worked on:</p>
        <ul className="list-disc list-inside mt-4">
          <li>Project 1: Description of project 1.</li>
          <li>Project 2: Description of project 2.</li>
          <li>Project 3: Description of project 3.</li>
        </ul>
      </main>
    </div>
  );
}
