import { CONTACT_EMAIL } from './site';

export const CONTACT_LIMITS = { name: 100, email: 254, message: 5000 };
export const CONTACT_UNAVAILABLE =
  'The contact form is temporarily unavailable. Please email me directly instead.';
export const CONTACT_SEND_ERROR =
  'Your message could not be sent. Please try again or email me directly.';
export type ContactMessage = { name: string; email: string; message: string };

export function validEmail(value: string) {
  return (
    value.length <= CONTACT_LIMITS.email &&
    !value.includes('\x00') &&
    /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value)
  );
}

export function parseContactMessage(value: unknown): ContactMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    ['name', 'email', 'message'].some((key) => typeof input[key] !== 'string')
  )
    return null;
  const message = {
    name: (input.name as string).trim(),
    email: (input.email as string).trim(),
    message: (input.message as string).trim(),
  };
  if (
    !message.name ||
    message.name.length > CONTACT_LIMITS.name ||
    /[\r\n]/.test(message.name) ||
    message.name.includes('\x00') ||
    !validEmail(message.email) ||
    !message.message ||
    message.message.length > CONTACT_LIMITS.message ||
    message.message.includes('\x00')
  )
    return null;
  return message;
}

export function contactEmailLink(draft: ContactMessage) {
  const subject = draft.name.trim()
    ? `Website message from ${draft.name.trim()}`
    : 'A message from your website';
  const body = [
    draft.name.trim() ? `Name: ${draft.name.trim()}` : '',
    draft.email.trim() ? `Reply email: ${draft.email.trim()}` : '',
    '',
    draft.message.trim(),
  ].join('\n');
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
