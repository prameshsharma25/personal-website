import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Seo from '../components/Seo';
import PageIntro from '../components/PageIntro';
import { CONTACT_EMAIL } from '../lib/site';
import {
  CONTACT_LIMITS,
  CONTACT_SEND_ERROR,
  CONTACT_UNAVAILABLE,
  contactEmailLink,
} from '../lib/contact';
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
  const [available, setAvailable] = useState<boolean | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    const timer = setTimeout(() => controller.abort(), 5000);
    async function checkAvailability() {
      try {
        const response = await fetch('/api/sendMessage', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (mounted) setAvailable(response.ok && data?.available === true);
      } catch {
        if (mounted) setAvailable(false);
      } finally {
        clearTimeout(timer);
      }
    }
    void checkAvailability();
    return () => {
      mounted = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!available) {
      setPhase('error');
      setStatus(CONTACT_UNAVAILABLE);
      return;
    }
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch('/api/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.success !== 'string') {
        setPhase('error');
        setStatus(
          typeof data?.error === 'string' ? data.error : CONTACT_SEND_ERROR
        );
        return;
      }
      setPhase('success');
      setStatus('Message sent successfully!');
      setFormData({ name: '', email: '', message: '' });
    } catch {
      setPhase('error');
      setStatus(CONTACT_SEND_ERROR);
    } finally {
      clearTimeout(timeout);
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
          description="Tell me about a research question, a project idea, or something you read here."
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
            {available === false && (
              <p className={styles.availability} role="status">
                {CONTACT_UNAVAILABLE} You can still write your draft below.
              </p>
            )}
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
                      maxLength={CONTACT_LIMITS.name}
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
                      maxLength={CONTACT_LIMITS.email}
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
                    maxLength={CONTACT_LIMITS.message}
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
                  disabled={phase === 'sending' || available !== true}
                >
                  {phase === 'sending'
                    ? 'Sending…'
                    : available === null
                      ? 'Checking Contact Form…'
                      : 'Send Message'}{' '}
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
            <div className={styles.directEmail}>
              <a href={contactEmailLink(formData)}>Email Me Directly</a>
              <span>{CONTACT_EMAIL}</span>
              <p>Opens your email app with your draft.</p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
