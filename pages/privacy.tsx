import Seo from '../components/Seo';
import styles from '../styles/Guide.module.css';

export default function PrivacyPolicy() {
  return (
    <div>
      <Seo title="Privacy Policy" description="How prameshsharma.com uses analytics, purchase information, and advertising services." path="/privacy" />

      <main className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>Last updated: November 25, 2026</p>
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
              <strong>Google AdSense:</strong> May display ads when advertising placements are enabled. Google may use cookies to track your activity across websites.
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
            Google AdSense is configured for optional advertising placements. Ad scripts load only when those placements are enabled. Google uses cookies and web beacons to:
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

          <h2>Free downloads</h2>
          <p>The lab-search tracker can be downloaded without providing an email address. The spreadsheet stays on your device; this site does not receive its contents.</p>
          <h2>Digital purchases</h2>
          <p>On product pages, Gumroad’s embedded product viewer loads from Gumroad. Selecting a purchase link can open a product preview on this site; checkout and file delivery take place on Gumroad. Gumroad collects the information needed to process your order and emails your purchase receipt and download link. See <a href="https://gumroad.com/privacy">Gumroad’s privacy policy</a> for its handling of purchase information.</p>
          <p>When this site’s Stripe checkout is available, Stripe handles payment details. This site does not receive or store your full card number. Your checkout email address is used to deliver files and handle purchase support. Payment status is checked before downloads are released. Private files are stored using Vercel Blob, and transactional emails are sent through the seller’s email service. Stripe checkout metadata records completed email delivery.</p>
          <p>The purchase-download page does not run this site’s analytics. It keeps your purchase reference in browser session storage so you can retry a download in the same browser session. Keep your purchase email and access link private.</p>
          <h2>Structure Analysis Tools</h2>
          <p>On My Device calculates structural descriptors, warnings, and optional batch comparisons and clustering in your browser. Coordinate files, filenames, optional confidence metadata, and analysis results are not uploaded. The engine runs in Web Workers. Save Progress On This Device is enabled by default where supported. It stores one run’s input files, confidence metadata, settings, completed descriptor artifacts, accepted comparisons, and final results in this browser’s IndexedDB storage for recovery. Cancelling stops calculations but keeps saved progress. Delete Saved Run removes that saved data; starting a new saved run replaces a completed one. With saving turned off, current calculations use temporary memory and are lost when the page closes. Saved data is not uploaded or shared across devices. Clearing site data, private browsing, browser storage cleanup, or storage limits can remove or prevent checkpoints. Download your reports before leaving. Structure previews and inspection of calculated results also happen locally.</p>
          <p>The on-device engine downloads a pinned Python/WebAssembly runtime and scientific libraries from jsDelivr when you start a calculation. This CDN receives normal connection information, such as your IP address, when serving those public assets; it does not receive your structure files. Ordinary site analytics remain separate from the analysis and are not given filenames, coordinates, or results.</p>
          <p>Hosted Server Analysis is planned for a future release. If this mode becomes available and you explicitly submit a job, coordinates, filenames, settings, and optional confidence metadata are uploaded to that service for analysis and clustering.</p>
          <p>The prepared Server Analysis implementation retains inputs, outputs, and worker diagnostics for up to 24 hours after submission, with periodic cleanup. You can use Cancel Analysis or Delete Job Files to request earlier removal. Results require a randomly generated job-access key, kept in this browser tab’s session storage to allow a refresh. Anyone with that key can access the job until it expires. Files are not added to the public examples.</p>
          <p>That implementation also stores a keyed hash of your IP address for daily usage limits. Hosting providers may process connection information in their infrastructure logs.</p>
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
            <a href="mailto:prameshsharma25@gmail.com">prameshsharma25@gmail.com</a>
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
