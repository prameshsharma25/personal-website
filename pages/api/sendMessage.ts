import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import { contactConfig, contactMail } from '../../lib/contact-server';
import {
  CONTACT_SEND_ERROR,
  CONTACT_UNAVAILABLE,
  parseContactMessage,
} from '../../lib/contact';

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const mailConfig = contactConfig();
  // Configuration readiness only: no Gmail connection and no exposed secrets.
  // A configured transport can still fail authentication or delivery.
  if (req.method === 'GET')
    return res.status(200).json({ available: Boolean(mailConfig) });
  const message = parseContactMessage(req.body);
  if (!message)
    return res.status(400).json({
      error:
        'Enter your name, a valid email address, and a message of up to 5,000 characters.',
    });
  if (!mailConfig) return res.status(503).json({ error: CONTACT_UNAVAILABLE });

  let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: mailConfig.sender, pass: mailConfig.password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    const result = await transporter.sendMail(contactMail(mailConfig, message));
    if (!result.accepted?.length) throw new Error('NoRecipientAccepted');
    return res.status(200).json({ success: 'Message sent successfully!' });
  } catch (error) {
    // Never log submitted messages, addresses, credentials, or SMTP objects.
    const code = (error as { code?: unknown })?.code;
    const responseCode = (error as { responseCode?: unknown })?.responseCode;
    console.error('Contact email delivery failed', {
      code:
        typeof code === 'string' && /^[A-Z_]{2,30}$/.test(code)
          ? code
          : 'UNKNOWN',
      responseCode: typeof responseCode === 'number' ? responseCode : undefined,
    });
    return res.status(503).json({ error: CONTACT_SEND_ERROR });
  } finally {
    transporter?.close();
  }
}
