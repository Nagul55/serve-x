import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

function hasSmtpConfig() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

let transporter;

function getTransporter() {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
      },
    });
  }

  return transporter;
}

export async function sendOtpEmail({ toEmail, otp, expiresInMinutes }) {
  const tx = getTransporter();
  if (!tx) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.');
  }

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">ServeX Login OTP</h2>
      <p>Your one-time password is:</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px; margin: 12px 0;">${otp}</p>
      <p>This OTP expires in ${expiresInMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  await tx.sendMail({
    from: env.smtpFrom,
    to: toEmail,
    subject: 'ServeX OTP Code',
    text: `Your ServeX OTP is ${otp}. It expires in ${expiresInMinutes} minutes.`,
    html,
  });
}

export function smtpConfigured() {
  return hasSmtpConfig();
}
