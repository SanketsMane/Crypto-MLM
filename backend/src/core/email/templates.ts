import { env } from '../../config/env.js';
import type { Message } from './mailer.js';

/**
 * Email templates.
 *
 * Deliberately plain HTML with inline styles and no external assets. Mail
 * clients strip <style> blocks, block remote images by default, and render
 * anything clever inconsistently — and a verification code that does not
 * display is a support ticket. Every template also carries a real plain-text
 * part, because that is what a screen reader and a text-only client get.
 *
 * The tone is the same throughout: say what happened, say what to do, and for
 * anything security-related say what to do if it was not them.
 */

const BRAND = env.BRAND_NAME;
const GOLD = '#B8860B';
const INK = '#111827';
const MUTED = '#6B7280';

const layout = (title: string, body: string) => `
<div style="margin:0;padding:24px;background:#F6F8FC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:14px;border:1px solid #E5E9F2;overflow:hidden;">
    <div style="padding:20px 28px;border-bottom:1px solid #EEF1F7;">
      <span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${GOLD};">${BRAND}</span>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 14px;font-size:19px;line-height:1.35;font-weight:650;color:${INK};">${title}</h1>
      ${body}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #EEF1F7;">
      <p style="margin:0;font-size:11.5px;line-height:1.6;color:${MUTED};">
        This is an automated message from ${BRAND}. Please do not reply to it.
      </p>
    </div>
  </div>
</div>`;

const p = (text: string) =>
  `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:${INK};">${text}</p>`;

const muted = (text: string) =>
  `<p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:${MUTED};">${text}</p>`;

const codeBlock = (code: string) => `
<div style="margin:18px 0;padding:16px;border-radius:10px;background:#F6F8FC;border:1px solid #E5E9F2;text-align:center;">
  <div style="font-size:28px;font-weight:700;letter-spacing:0.24em;color:${INK};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</div>
</div>`;

const button = (href: string, label: string) => `
<div style="margin:20px 0;">
  <a href="${href}" style="display:inline-block;padding:11px 20px;border-radius:9px;background:${GOLD};color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">${label}</a>
</div>`;

/** Minutes remaining, phrased for a human. */
const validFor = (minutes: number) =>
  minutes === 1 ? '1 minute' : minutes < 60 ? `${minutes} minutes` : `${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}`;

export function verifyEmail(opts: { to: string; code: string; minutes: number }): Message {
  const title = 'Confirm your email address';
  return {
    to: opts.to,
    template: 'verify-email',
    subject: `${opts.code} is your ${BRAND} verification code`,
    html: layout(title, [
      p(`Enter this code to confirm your email address and finish setting up your ${BRAND} account.`),
      codeBlock(opts.code),
      muted(`The code is valid for ${validFor(opts.minutes)}. If you did not create an account, you can ignore this email.`),
    ].join('')),
    text: `${title}\n\nYour ${BRAND} verification code is ${opts.code}.\nIt is valid for ${validFor(opts.minutes)}.\n\nIf you did not create an account, ignore this email.`,
  };
}

export function resetPassword(opts: { to: string; code: string; minutes: number }): Message {
  const title = 'Reset your password';
  return {
    to: opts.to,
    template: 'reset-password',
    subject: `${opts.code} is your ${BRAND} password reset code`,
    html: layout(title, [
      p('Use this code to choose a new password.'),
      codeBlock(opts.code),
      muted(
        `The code is valid for ${validFor(opts.minutes)}. If you did not ask to reset your password, ignore this email — your password has not changed, and nobody can use this code without access to your inbox.`,
      ),
    ].join('')),
    text: `${title}\n\nYour ${BRAND} password reset code is ${opts.code}.\nIt is valid for ${validFor(opts.minutes)}.\n\nIf you did not request this, ignore this email — your password has not changed.`,
  };
}

export function confirmWithdrawal(opts: {
  to: string; code: string; minutes: number; amount: string; address: string;
}): Message {
  const title = 'Confirm your withdrawal';
  return {
    to: opts.to,
    template: 'confirm-withdrawal',
    subject: `${opts.code} — confirm your $${opts.amount} withdrawal`,
    html: layout(title, [
      p(`You asked to withdraw <strong>$${opts.amount}</strong> to <strong>${opts.address}</strong>.`),
      p('Enter this code to submit the request:'),
      codeBlock(opts.code),
      muted(
        `The code is valid for ${validFor(opts.minutes)}. <strong>If you did not request this withdrawal, do not enter the code.</strong> Change your password immediately and contact support — someone may have access to your account.`,
      ),
    ].join('')),
    text: `${title}\n\nYou asked to withdraw $${opts.amount} to ${opts.address}.\nYour confirmation code is ${opts.code}, valid for ${validFor(opts.minutes)}.\n\nIf you did not request this withdrawal, DO NOT enter the code. Change your password and contact support.`,
  };
}

export function passwordChanged(opts: { to: string; when: Date }): Message {
  const title = 'Your password was changed';
  const when = opts.when.toUTCString();
  return {
    to: opts.to,
    template: 'password-changed',
    subject: `Your ${BRAND} password was changed`,
    html: layout(title, [
      p(`Your ${BRAND} password was changed on ${when}. You have been signed out everywhere as a precaution.`),
      muted('If this was not you, reset your password now and contact support — someone else may have had access to your account.'),
    ].join('')),
    text: `${title}\n\nYour ${BRAND} password was changed on ${when}. You have been signed out on all devices.\n\nIf this was not you, reset your password immediately and contact support.`,
  };
}

export function payoutAddressChanged(opts: { to: string; masked: string; when: Date }): Message {
  const title = 'Your payout address was changed';
  return {
    to: opts.to,
    template: 'payout-address-changed',
    subject: `Your ${BRAND} payout address was changed`,
    html: layout(title, [
      p(`Future withdrawals will be sent to <strong>${opts.masked}</strong>, changed on ${opts.when.toUTCString()}.`),
      muted('If this was not you, contact support immediately — this is the change an attacker makes to redirect your money.'),
    ].join('')),
    text: `${title}\n\nFuture withdrawals will be sent to ${opts.masked}, changed on ${opts.when.toUTCString()}.\n\nIf this was not you, contact support immediately.`,
  };
}

export function twoFactorChanged(opts: { to: string; enabled: boolean; when: Date }): Message {
  const title = opts.enabled
    ? 'Two-factor authentication is on'
    : 'Two-factor authentication was turned off';
  return {
    to: opts.to,
    template: opts.enabled ? '2fa-enabled' : '2fa-disabled',
    subject: `${BRAND}: ${title.toLowerCase()}`,
    html: layout(title, [
      p(
        opts.enabled
          ? `Signing in now needs a code from your authenticator app as well as your password. Changed on ${opts.when.toUTCString()}.`
          : `Signing in now needs only your password. Changed on ${opts.when.toUTCString()}.`,
      ),
      muted('If this was not you, contact support immediately.'),
    ].join('')),
    text: `${title}\n\nChanged on ${opts.when.toUTCString()}.\n\nIf this was not you, contact support immediately.`,
  };
}

export function kycDecision(opts: { to: string; approved: boolean; reason?: string; webUrl: string }): Message {
  const title = opts.approved ? 'Your identity has been verified' : 'We could not verify your identity';
  return {
    to: opts.to,
    template: opts.approved ? 'kyc-approved' : 'kyc-rejected',
    subject: `${BRAND}: ${title.toLowerCase()}`,
    html: layout(title, [
      p(
        opts.approved
          ? 'Verification is complete. Withdrawals are now available on your account.'
          : `Your submission was not accepted. Reason given: <strong>${opts.reason ?? 'not specified'}</strong>. You can submit new documents at any time.`,
      ),
      button(`${opts.webUrl}/profile`, opts.approved ? 'Go to your account' : 'Submit new documents'),
    ].join('')),
    text: opts.approved
      ? `${title}\n\nVerification is complete. Withdrawals are now available on your account.\n${opts.webUrl}/profile`
      : `${title}\n\nYour submission was not accepted. Reason: ${opts.reason ?? 'not specified'}.\nYou can submit new documents at ${opts.webUrl}/profile`,
  };
}

export function withdrawalProcessed(opts: {
  to: string; amount: string; net: string; address: string; txHash?: string | null;
}): Message {
  const title = 'Your withdrawal has been sent';
  return {
    to: opts.to,
    template: 'withdrawal-processed',
    subject: `${BRAND}: $${opts.net} sent to your wallet`,
    html: layout(title, [
      p(`$${opts.net} has been sent to <strong>${opts.address}</strong> (from a $${opts.amount} withdrawal, after fees).`),
      opts.txHash ? p(`Transaction: <code style="font-size:12px;word-break:break-all;">${opts.txHash}</code>`) : '',
      muted('Settlement on the network usually takes a few minutes.'),
    ].join('')),
    text: `${title}\n\n$${opts.net} has been sent to ${opts.address} (from a $${opts.amount} withdrawal, after fees).${opts.txHash ? `\nTransaction: ${opts.txHash}` : ''}`,
  };
}

export function depositCredited(opts: { to: string; amount: string; txHash?: string | null }): Message {
  const title = 'Your deposit has been credited';
  return {
    to: opts.to,
    template: 'deposit-credited',
    subject: `${BRAND}: $${opts.amount} credited to your Fund wallet`,
    html: layout(title, [
      p(`$${opts.amount} has been credited to your Fund wallet and is ready to invest.`),
      opts.txHash ? p(`Transaction: <code style="font-size:12px;word-break:break-all;">${opts.txHash}</code>`) : '',
    ].join('')),
    text: `${title}\n\n$${opts.amount} has been credited to your Fund wallet.${opts.txHash ? `\nTransaction: ${opts.txHash}` : ''}`,
  };
}

/** Internal notification for a public contact-form enquiry. */
export function contactEnquiry(opts: {
  to: string; name: string; email: string; phone?: string | null;
  subject: string; message: string; at: Date;
}): Message {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body =
    p(`<strong>${esc(opts.name)}</strong> &lt;${esc(opts.email)}&gt;${opts.phone ? ` · ${esc(opts.phone)}` : ''}`) +
    p(`<em>${esc(opts.subject)}</em>`) +
    `<div style="margin:16px 0;padding:16px;border-radius:10px;background:#F6F8FC;border:1px solid #E5E9F2;">
       <p style="margin:0;font-size:14px;line-height:1.7;color:${INK};white-space:pre-wrap;">${esc(opts.message)}</p>
     </div>` +
    muted(`Received ${opts.at.toISOString()}. Reply directly to ${esc(opts.email)}.`);

  return {
    to: opts.to,
    subject: `[Contact] ${opts.subject}`,
    html: layout('New enquiry from the website', body),
    text:
      `${opts.name} <${opts.email}>${opts.phone ? ` · ${opts.phone}` : ''}\n` +
      `${opts.subject}\n\n${opts.message}\n\nReceived ${opts.at.toISOString()}`,
    template: 'contact-enquiry',
  };
}
