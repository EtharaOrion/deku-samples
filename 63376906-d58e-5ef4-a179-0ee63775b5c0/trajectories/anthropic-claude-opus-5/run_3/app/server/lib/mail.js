import nodemailer from 'nodemailer';

// Every mail leaves through mailpit over SMTP, addressed to exactly one
// recipient with no copies. Four acts send mail and nothing else does.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  tls: { rejectUnauthorized: false }
});

const FROM = 'Ravel <records@ravel.example.com>';

async function send(to, subject, text) {
  if (Array.isArray(to)) throw new Error('one recipient, no copies');
  await transport.sendMail({ from: FROM, to, subject, text });
  return { to, subject, sent_at: new Date().toISOString() };
}

function pct(bp) {
  // A percentage is rendered from basis points without ever becoming a float
  // in transit: 9000 bp reads as 90.00 per cent.
  const whole = Math.floor(bp / 100);
  const frac = String(bp % 100).padStart(2, '0');
  return `${whole}.${frac} per cent`;
}

export async function mailCertificateIssued(cert) {
  const body = [
    `Certificate ${cert.number} has been issued to ${cert.recipient_name}.`,
    '',
    `Number:          ${cert.number}`,
    `Claim type:      ${cert.claim_type}`,
    `Recycled content: ${pct(cert.content_bp)} (${cert.content_bp} basis points)`,
    '',
    'Permitted statement',
    cert.permitted_statement,
    '',
    'Prohibited statement',
    cert.prohibited_statement,
    '',
    `Verify this certificate at ravel.example.com/verify/${cert.number}.`
  ].join('\n');
  return send(cert.recipient_contact, `Certificate ${cert.number} issued`, body);
}

export async function mailCertificateWithdrawn(cert, reason, voidStatements) {
  const body = [
    `Certificate ${cert.number} has been withdrawn.`,
    '',
    `Number: ${cert.number}`,
    `Reason: ${reason}`,
    '',
    'The following statements are now void and must no longer be made:',
    ...voidStatements.map((s) => `  - ${s}`),
    '',
    'A withdrawal is not a deletion. The document stays readable at its address',
    `at ravel.example.com/verify/${cert.number}.`
  ].join('\n');
  return send(cert.recipient_contact, `Certificate ${cert.number} withdrawn`, body);
}

export async function mailChangeNotice(notice, customerContact) {
  const body = [
    `Change notice ${notice.reference} requires your acknowledgement.`,
    '',
    `The change:      ${notice.title}`,
    notice.detail,
    '',
    `Specifications affected: ${(notice.specifications_affected || []).join(', ') || 'none'}`,
    `Notice period:   ${notice.notice_period_days} days`,
    '',
    'This change cannot be released until you have acknowledged it or recorded a waiver.'
  ].join('\n');
  return send(customerContact, `Change notice ${notice.reference} requires acknowledgement`, body);
}

export async function mailEnquiryReceived(enquiry) {
  const body = [
    `Thank you. Your enquiry has been received and given the reference ${enquiry.reference}.`,
    '',
    `Reference:       ${enquiry.reference}`,
    `Sent to:         ${enquiry.destination}`,
    `We reply within: ${enquiry.response_days} working day${enquiry.response_days === 1 ? '' : 's'}`,
    '',
    'What we do with this data',
    'Ravel Materials SAS is the controller. We use your enquiry to answer it and',
    'for no other purpose. We keep it for the period stated in our privacy policy.',
    'To have it removed, write to privacy@example.com.'
  ].join('\n');
  return send(enquiry.email, `Enquiry ${enquiry.reference} received`, body);
}

export async function mailReady() {
  try {
    await transport.verify();
    return true;
  } catch {
    return false;
  }
}
