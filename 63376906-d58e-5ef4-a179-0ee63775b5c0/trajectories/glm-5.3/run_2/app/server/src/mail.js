import nodemailer from "nodemailer";
import { cfg } from "./config.js";

// Every mail leaves through mailpit, addressed to exactly one recipient, with
// no copies. Nothing outside the four acts sends anything.
const transport = nodemailer.createTransport({
  host: cfg.smtpHost,
  port: cfg.smtpPort,
  secure: false,
  tls: { rejectUnauthorized: false },
});

export async function sendMail(to, subject, body) {
  const text = typeof body === "string" ? body : body.text;
  const html = typeof body === "string" ? null : body.html || null;
  await transport.sendMail({
    from: "Ravel Materials <records@ravel.example.com>",
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}

export const mailActs = {
  certificateIssued: {
    subject: (n) => `Certificate ${n} issued`,
    body: (c) =>
      `Certificate ${c.number} was issued to ${c.recipient_name}.\n\nClaim type: ${c.claim_type}\nRecycled content: ${c.content_bp / 100} per cent\nCarbon figure: ${c.carbon?.value_mg_per_kg ?? "n/a"} mg CO2e per kg\n\nPermitted statement:\n${c.permitted_statement}\n\nVerify this certificate at ravel.example.com/verify/${c.number}.\n`,
  },
  certificateWithdrawn: {
    subject: (n) => `Certificate ${n} withdrawn`,
    body: (c) =>
      `Certificate ${c.number} has been withdrawn.\n\nReason: ${c.withdrawn_reason}\n\nEvery statement now void:\n${(c.void_statements || []).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nThe certificate remains readable at ravel.example.com/verify/${c.number} and states its withdrawal.\n`,
  },
  changeNotice: {
    subject: (id) => `Change notice ${id} requires acknowledgement`,
    body: (n) =>
      `Change notice ${n.reference} has been raised.\n\nChange: ${n.change}\nSpecifications affected: ${(n.specifications_affected || []).join(", ") || "none"}\nNotice period: ${n.notice_period_days} days\n\nPlease acknowledge this notice.\n`,
  },
  enquiryReceived: {
    subject: (r) => `Enquiry ${r} received`,
    body: (e) =>
      `Enquiry ${e.reference} was received.\n\nDestination: ${e.destination}\nStated response time: ${e.response_days} days\n\nA reply will reach you within that time.\n`,
  },
};
