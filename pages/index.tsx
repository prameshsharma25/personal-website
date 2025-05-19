import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Home() {
  return (
    <div>
      <Head>
        <title>Pramesh Sharma</title>
        <meta name="description" content="Welcome to my personal website!" />
      </Head>

      <main className={styles.animatedBackground}>
        <div className={styles.heroCard}>
          <img
            src="profile.jpg"
            alt="Profile Picture"
            className={styles.profileImage}
          />
          <h1 className={styles.heroName}>
            Pramesh Sharma <span role="img" aria-label="waving hand">👋</span>
          </h1>
          <p className={styles.heroText}>
            I’m a Software Engineer passionate about <b>Machine Learning Infrastructure</b> and <b>Scientific Computing</b>.<br />
            I earned my Bachelor’s in Computer Science from the University of California, Davis. Currently, I work at the Intelligent Retail Lab by Walmart, building and optimizing self-checkout systems that shape the future of retail technology.
          </p>
        </div>
      </main>
    </div>
  );
}