import Head from 'next/head';
import styles from '../styles/Guide.module.css';

export default function PrivacyPolicy() {
  return (
    <div>
      <Head>
        <title>Privacy Policy - Pramesh Sharma</title>
        <meta name="description" content="Privacy policy for Pramesh Sharma's personal website" />
      </Head>

      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>Last updated: April 14, 2026</p>
        </div>

        <article className={styles.content}>
          <h2>Introduction</h2>
          <p>
            Pramesh Sharma (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the personal website at prameshsharma.com (the &ldquo;Site&rdquo;).
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our Site.
          </p>

          <h2>Information We Collect</h2>
          <h3>1. Automatically Collected Information</h3>
          <p>
            When you visit the Site, we automatically collect certain information about your device and usage patterns, including:
          </p>
          <ul>
            <li>Your IP address</li>
            <li>Browser type and version</li>
            <li>Operating system</li>
            <li>Pages visited and time spent on each page</li>
            <li>Referral sources</li>
          </ul>

          <h3>2. Cookies and Tracking Technologies</h3>
          <p>
            We use cookies, web beacons, and similar technologies to:
          </p>
          <ul>
            <li>Remember your preferences</li>
            <li>Understand how you use the Site</li>
            <li>Deliver personalized advertising through Google AdSense</li>
          </ul>

          <h3>3. Third-Party Services</h3>
          <p>
            This Site uses the following third-party services that may collect information:
          </p>
          <ul>
            <li>
              <strong>Google AdSense:</strong> Displays personalized ads based on your interests. Google may use cookies to track your activity across websites.
            </li>
            <li>
              <strong>Vercel Analytics:</strong> Tracks website performance and user behavior.
            </li>
          </ul>

          <h2>How We Use Your Information</h2>
          <p>We use collected information to:</p>
          <ul>
            <li>Improve and optimize the Site&apos;s performance</li>
            <li>Display relevant advertisements through Google AdSense</li>
            <li>Understand user preferences and behavior</li>
            <li>Respond to inquiries and support requests</li>
          </ul>

          <h2>Google AdSense and Personalized Ads</h2>
          <p>
            This Site uses Google AdSense to display advertisements. Google uses cookies and web beacons to:
          </p>
          <ul>
            <li>Serve ads based on your previous visits to this Site and other websites</li>
            <li>Report how ad impressions and interactions with ad services relate to visits to the Site</li>
          </ul>

          <p>
            You can opt out of personalized advertising by visiting{' '}
            <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">
              Google Ads Settings
            </a>
            {' '}or{' '}
            <a href="https://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer">
              Network Advertising Initiative opt-out tool
            </a>.
          </p>

          <h2>Data Sharing</h2>
          <p>
            We do not sell your personal information. However, we share information with third-party service providers including Google, Vercel, and analytics platforms to operate the Site and display advertisements.
          </p>

          <h2>Your Rights and Choices</h2>
          <ul>
            <li>You can disable cookies in your browser settings</li>
            <li>You can opt out of personalized advertising through Google Ads Settings</li>
            <li>You can request information about what data we have collected by contacting us</li>
          </ul>

          <h2>Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or our privacy practices, please contact us at:
          </p>
          <p>
            Email:{' '}
            <a href="mailto:contact@prameshsharma.com">contact@prameshsharma.com</a>
          </p>

          <h2>Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by updating the &ldquo;Last updated&rdquo; date at the top of this page.
          </p>
        </article>
      </main>
    </div>
  );
}
