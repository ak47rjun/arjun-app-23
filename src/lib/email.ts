/** Transactional email. Without SMTP configured, messages are logged (development mode). */
import nodemailer from 'nodemailer';
import { env, smtpConfigured } from './env';

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!smtpConfigured) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export async function sendEmail(opts: { to: string; subject: string; text: string; html?: string }): Promise<{ delivered: boolean; mode: 'smtp' | 'log' }> {
  const t = getTransporter();
  if (!t) {
    console.log(`[email:console] to=${opts.to} subject=${JSON.stringify(opts.subject)}\n${opts.text}`);
    return { delivered: false, mode: 'log' };
  }
  await t.sendMail({ from: env.SMTP_FROM, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
  return { delivered: true, mode: 'smtp' };
}
