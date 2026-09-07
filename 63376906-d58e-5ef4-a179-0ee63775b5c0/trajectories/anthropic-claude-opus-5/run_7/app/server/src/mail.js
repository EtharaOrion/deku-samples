import nodemailer from 'nodemailer';

// Every mail leaves through mailpit over SMTP, addressed to exactly one recipient with no
// copies. Nothing else sends mail.
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 1025),
  secure: false,
  tls: { rejectUnauthorized: false }
});

const FROM = 'record@ravel.example.com';

async function send(to, subject, text) {
  if (Array.isArray(to)) throw new Error('one recipient, no copies');
  const info = await transport.sendMail({ from: FROM, to, subject, text });
  return { to, subject, message_id: info.messageId, sent_at: new Date().toISOString() };
}

export function certificateIssued(cert) {
  return send(
    cert.recipient_contact,
    `Certificate ${cert.number} issued`,
    [
      `Certificate ${cert.number} has been issued to ${cert.recipient_name}.`,
      '',
      `Claim type: ${cert.claim_type}`,
      `Recycled content: ${cert.content_bp} basis points`,
      '',
      'Permitted statement:',
      cert.permitted_statement,
      '',
      'Prohibited statement:',
      cert.prohibited_statement,
      '',
      `Verify this certificate at ravel.example.com/verify/${cert.number}.`
    ].join('\n')
  );
}

export function certificateWithdrawn(cert, reason, voidStatements) {
  return send(
    cert.recipient_contact,
    `Certificate ${cert.number} withdrawn`,
    [
      `Certificate ${cert.number} was withdrawn on ${new Date().toISOString().slice(0, 10)}.`,
      `Reason: ${reason}`,
      '',
      'The following statements are now void and must no longer be made:',
      ...voidStatements.map((s) => `- ${s}`),
      '',
      `The certificate remains readable at ravel.example.com/verify/${cert.number}.`
    ].join('\n')
  );
}

export function changeNoticeAcknowledgement(notice, customerContact) {
  return send(
    customerContact,
    `Change notice ${notice.reference} requires acknowledgement`,
    [
      `A change has been proposed: ${notice.description}`,
      '',
      `Specifications affected: ${(notice.specifications_affected || []).join(', ') || 'none'}`,
      `Notice period: ${notice.notice_period_days} days`,
      '',
      'This change requires your acknowledgement before it is released.'
    ].join('\n')
  );
}

export function enquiryReceived(enquiry) {
  return send(
    enquiry.email,
    `Enquiry ${enquiry.reference} received`,
    [
      `Your enquiry has been received under reference ${enquiry.reference}.`,
      '',
      `It has been directed to ${enquiry.destination}.`,
      `We state a response time of ${enquiry.response_days} working days.`,
      '',
      'Ravel Materials SAS holds this enquiry to answer it and for no other purpose.',
      'Write to privacy@example.com to have it removed.'
    ].join('\n')
  );
}
