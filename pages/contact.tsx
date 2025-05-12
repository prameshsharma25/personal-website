import { useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Contact.module.css';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [status, setStatus] = useState('');

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('Sending...');

    try {
      const response = await fetch('/api/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setStatus('Message sent successfully!');
        setFormData({ name: '', email: '', message: '' });
      } else {
        const errorData = await response.json();
        setStatus(errorData.error || 'Failed to send message.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setStatus('Failed to send message.');
    }
  };

  return (
    <div>
      <Head>
        <title>Contact Me</title>
        <meta name="description" content="Get in touch with me." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.container}>
        <h1 className={styles.heading}>Contact Me</h1>
        <p className={styles.description}>
          Have questions or want to work together? Feel free to reach out!
        </p>

        <div className={styles.formWrapper}>
          <form onSubmit={handleSubmit}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}
                htmlFor="name"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className={styles.inputField}
                placeholder="Your Name"
                value={formData.name}
                onChange={handleChange}
              />
            </div>
            <div className={styles.formRow}>
              <label
                htmlFor="email"
                className={styles.formLabel}
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                className={styles.inputField}
                placeholder="Your Email"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div className={styles.formRow}>
              <label
                htmlFor="message"
                className={styles.formLabel}
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={5}
                required
                className={styles.inputField}
                placeholder="Your Message"
                value={formData.message}
                onChange={handleChange}
              ></textarea>
            </div>
            <button type="submit" className={styles.submitButton}>
              Send Message
            </button>
          </form>
          {status && <p className="mt-4 text-center text-gray-600">{status}</p>}
        </div>
      </main>
    </div>
  );
}
