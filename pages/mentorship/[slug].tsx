import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps, GetStaticPaths } from 'next';
import { MDXRemote, MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import { getGuideBySlug, getAllGuides, GuideMetadata } from '../../lib/guides';
import styles from '../../styles/Guide.module.css';

interface GuidePageProps {
  guide: {
    slug: string;
    title: string;
    description: string;
    date?: string;
  };
  source: MDXRemoteSerializeResult;
  allGuides: GuideMetadata[];
}

type ComponentProps = Record<string, unknown>;

export default function GuidePage({ guide, source, allGuides }: GuidePageProps) {
  const components = {
    h1: (props: ComponentProps) => <h1 className={styles.h1} {...props} />,
    h2: (props: ComponentProps) => <h2 className={styles.h2} {...props} />,
    h3: (props: ComponentProps) => <h3 className={styles.h3} {...props} />,
    p: (props: ComponentProps) => <p className={styles.p} {...props} />,
    ul: (props: ComponentProps) => <ul className={styles.ul} {...props} />,
    ol: (props: ComponentProps) => <ol className={styles.ol} {...props} />,
    li: (props: ComponentProps) => <li className={styles.li} {...props} />,
    blockquote: (props: ComponentProps) => <blockquote className={styles.blockquote} {...props} />,
    code: (props: ComponentProps) => <code className={styles.code} {...props} />,
    pre: (props: ComponentProps) => <pre className={styles.pre} {...props} />,
    a: (props: ComponentProps) => <a className={styles.a} {...props} />,
  };

  return (
    <div>
      <Head>
        <title>{guide.title} - Pramesh Sharma</title>
        <meta name="description" content={guide.description} />
        <meta name="og:title" content={guide.title} />
        <meta name="og:description" content={guide.description} />
      </Head>

      <main className={styles.container}>
        <div className={styles.navigation}>
          <Link href="/mentorship#guides" className={styles.backLink}>
            ← Back to Guides
          </Link>
        </div>

        <article className={styles.article}>
          <header className={styles.header}>
            <h1 className={styles.title}>{guide.title}</h1>
            <p className={styles.description}>{guide.description}</p>
            {guide.date && (
              <p className={styles.date}>
                Published {new Date(guide.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </header>

          <div className={styles.content}>
            <MDXRemote {...source} components={components} />
          </div>
        </article>

        <aside className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>Other Guides</h3>
          <ul className={styles.guidesList}>
            {allGuides
              .filter((g) => g.slug !== guide.slug)
              .map((g) => (
                <li key={g.slug}>
                  <Link href={`/mentorship/${g.slug}`} className={styles.guideLink}>
                    {g.title}
                  </Link>
                </li>
              ))}
          </ul>
        </aside>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const slug = params?.slug as string;

  try {
    const guide = getGuideBySlug(slug);
    const source = await serialize(guide.content);
    const allGuides = getAllGuides();

    return {
      props: {
        guide: {
          slug: guide.slug,
          title: guide.title,
          description: guide.description,
          date: guide.date,
        },
        source,
        allGuides,
      },
      revalidate: 3600, // Revalidate every hour
    };
  } catch {
    return {
      notFound: true,
    };
  }
};

export const getStaticPaths: GetStaticPaths = async () => {
  const guides = getAllGuides();
  const paths = guides.map((guide) => ({
    params: {
      slug: guide.slug,
    },
  }));

  return {
    paths,
    fallback: false,
  };
};
