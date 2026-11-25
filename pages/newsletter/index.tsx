import type { GetServerSideProps } from 'next';
import Seo from '../../components/Seo';
import NewsletterForm from '../../components/NewsletterForm';
import { newsletterConfig } from '../../lib/newsletter-server';
import resource from '../../styles/Resources.module.css';
export default function Newsletter({ available }: { available: boolean }) {
  return <><Seo title="Get New Posts by Email" description="Research updates and new posts from Pramesh Sharma, a computational biologist at NIH. Subscribe by email and unsubscribe at any time." path="/newsletter" noindex={!available} />
    <main className={`${resource.page} ${resource.narrow}`}>
      <h1 className={resource.title}>Get new posts by email.</h1>
      <p className={resource.lead}>I share what I’m working on, what I’m learning, and advice for finding your way into research.</p>
      {available ? <NewsletterForm source="newsletter_page" /> : <p className={resource.status}>I’m setting up the mailing list. Please check back soon.</p>}
    </main>
  </>;
}
export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: { available: Boolean(newsletterConfig()) } };
};
