import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Seo from '../components/Seo';
import PageIntro from '../components/PageIntro';
import ui from '../styles/Interface.module.css';
import styles from '../styles/Contact.module.css';
import resource from '../styles/Resources.module.css';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [phase, setPhase] = useState<'idle' | 'sending' | 'success' | 'error'>(
    'idle'
  );
  const [status, setStatus] = useState('');
  const pending = useRef(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      message: formData.message.trim(),
    };
    if (!payload.name || !payload.email || !payload.message) {
      setPhase('error');
      setStatus('Please complete all three fields.');
      return;
    }
    pending.current = true;
    setPhase('sending');
    setStatus('Sending your message…');
    try {
      const response = await fetch('/api/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Your message could not be sent. Please try again.'
        );
      setPhase('success');
      setStatus('Message sent successfully!');
      setFormData({ name: '', email: '', message: '' });
    } catch (error) {
      setPhase('error');
      setStatus(
        error instanceof Error
          ? error.message
          : 'Your message could not be sent. Please try again.'
      );
    } finally {
      pending.current = false;
    }
  }
  return (
    <>
      <Seo
        title="Contact Pramesh Sharma"
        description="Contact Pramesh Sharma about computational biology research, collaboration, mentorship, or support for a digital download."
        path="/contact"
      />
      <main className={ui.page}>
        <PageIntro
          eyebrow="Get In Touch"
          title="Let’s Start"
          accent="A Conversation."
          description="A research question, an idea for a project, or something you read here—tell me what’s on your mind."
        />
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div data-reveal className={styles.conversation}>
              <p className={ui.eyebrow}>A Place To Begin</p>
              <h2>What Are You Thinking About?</h2>
              <p>
                A little context helps: who you are, what you’re working on, and
                what you’d like to discuss.
              </p>
              <div className={styles.signalLines} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
            <Link
              data-reveal
              data-tilt
              href="/mentorship"
              className={`${ui.panel} ${styles.contactLink}`}
            >
              <div className={ui.meta}>
                <span>Mentorship</span>
                <span aria-hidden="true">↗</span>
              </div>
              <h3>Work Through Your Next Step</h3>
              <p>
                Explore the topics we can discuss and choose a time to talk.
              </p>
            </Link>
            <Link
              data-reveal
              data-tilt
              href="/resources"
              className={`${ui.panel} ${styles.contactLink}`}
            >
              <div className={ui.meta}>
                <span>Tools & Downloads</span>
                <span aria-hidden="true">↗</span>
              </div>
              <h3>Find A Resource</h3>
              <p>
                Browse the free tracker, application guides, and essay
                collection.
              </p>
            </Link>
          </aside>
          <section
            data-reveal
            className={styles.formPanel}
            aria-labelledby="message-heading"
          >
            <div className={styles.formHeader}>
              <span>01 / A Note From You</span>
              <span aria-hidden="true">↗</span>
            </div>
            <h2 id="message-heading">Send A Message</h2>
            <p className={styles.formIntro}>
              Use the email address where you’d like to hear back.
            </p>
            <form
              action="/api/sendMessage"
              method="post"
              onSubmit={handleSubmit}
              aria-busy={phase === 'sending'}
            >
              <fieldset
                className={styles.fields}
                disabled={phase === 'sending'}
              >
                <div className={styles.identity}>
                  <div className={styles.field}>
                    <label htmlFor="contact-name">Name</label>
                    <input
                      id="contact-name"
                      type="text"
                      name="name"
                      autoComplete="name"
                      required
                      placeholder="Your Name"
                      value={formData.name}
                      onChange={(event) =>
                        setFormData({ ...formData, name: event.target.value })
                      }
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="contact-email">Email</label>
                    <input
                      id="contact-email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      required
                      placeholder="Your Email"
                      value={formData.email}
                      onChange={(event) =>
                        setFormData({ ...formData, email: event.target.value })
                      }
                    />
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="contact-message">Message</label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={8}
                    required
                    placeholder="What Would You Like To Discuss?"
                    value={formData.message}
                    onChange={(event) =>
                      setFormData({ ...formData, message: event.target.value })
                    }
                  />
                </div>
                <button
                  className={resource.primaryButton}
                  type="submit"
                  disabled={phase === 'sending'}
                >
                  {phase === 'sending' ? 'Sending…' : 'Send Message'}{' '}
                  <span aria-hidden="true">↗</span>
                </button>
              </fieldset>
            </form>
            {status && (
              <p
                className={styles.status}
                data-state={phase}
                role={phase === 'error' ? 'alert' : 'status'}
              >
                {status}
              </p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
