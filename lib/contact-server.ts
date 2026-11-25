import { validEmail, type ContactMessage } from './contact';
import { CONTACT_EMAIL } from './site';

export function contactConfig(env: NodeJS.ProcessEnv = process.env) {
  const sender = env.USER_EMAIL?.trim() || '';
  // Google displays app passwords in groups separated by spaces.
  const password = env.GMAIL_APP_PASSWORD?.replace(/\s/g, '') || '';
  const recipient = env.RECIPIENT_EMAIL?.trim() || CONTACT_EMAIL;
  if (!validEmail(sender) || !password || !validEmail(recipient)) return null;
  return { sender, password, recipient };
}

export function contactMail(
  config: NonNullable<ReturnType<typeof contactConfig>>,
  message: ContactMessage
) {
  return {
    from: { name: 'Pramesh Sharma Website', address: config.sender },
    to: config.recipient,
    replyTo: { name: message.name, address: message.email },
    subject: `Website message from ${message.name}`,
    text: `Name: ${message.name}\nReply email: ${message.email}\n\n${message.message}`,
  };
}
