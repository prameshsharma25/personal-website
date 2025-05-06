import Head from 'next/head';

export default function About() {
  return (
    <div>
      <Head>
        <title>About Me</title>
        <meta
          name="description"
          content="Learn more about me and my journey."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="container mx-auto p-4">
        <h1 className="text-2xl font-bold">About Me</h1>
        <p className="mt-4">
          Hello! I'm Pramesh Sharma, a passionate software developer with a love
          for creating innovative solutions. I have experience in various
          programming languages and frameworks, and I'm always eager to learn
          more.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Resume</h2>
          <p className="mt-2">
            You can view my resume below or download it using the button:
          </p>

          <div
            className="mt-4 border rounded overflow-hidden"
            style={{ height: '100vh' }}
          >
            <iframe
              src="/resume.pdf"
              className="w-full h-full"
              title="Resume"
            ></iframe>
          </div>

          <a
            href="/resume.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Download Resume
          </a>
        </section>
      </main>
    </div>
  );
}
