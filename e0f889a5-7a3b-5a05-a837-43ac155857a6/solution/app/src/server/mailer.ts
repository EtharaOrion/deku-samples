import nodemailer from "nodemailer";
import { env } from "./env";
import { formatMinor } from "./money";
import { logError, logEvent } from "./log";

/** Mail goes over real SMTP. A body written to a log is not a sent mail, so
 *  nothing here logs a body in place of delivering one. */
let transport: nodemailer.Transporter | null = null;

function mailer(): nodemailer.Transporter {
  if (transport) return transport;
  const auth = env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined;
  const implicitTls = env.smtp.port === 465;
  transport = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: implicitTls,
    requireTLS: Boolean(auth) && !implicitTls,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 15_000,
    ...(auth ? { auth } : {}),
  });
  return transport;
}

export async function healthy(): Promise<boolean> {
  try {
    return await mailer().verify();
  } catch {
    return false;
  }
}

export type OrderMailLine = { title: string; option: string; quantity: number; totalMinor: number };

export type OrderMail = {
  to: string;
  orderNumber: string;
  lines: OrderMailLine[];
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  shippingMethod: string;
  trackUrl: string;
};

function plainBody(mail: OrderMail): string {
  const rows = mail.lines
    .map((line) => {
      const label = line.option && line.option !== "Standard" ? `${line.title} (${line.option})` : line.title;
      return `  ${label} x ${line.quantity}  ${formatMinor(line.totalMinor)}`;
    })
    .join("\n");

  return [
    `Order ${mail.orderNumber} is confirmed.`,
    "",
    "What you bought",
    rows,
    "",
    `Subtotal      ${formatMinor(mail.subtotalMinor)}`,
    `Delivery      ${formatMinor(mail.shippingMinor)} (${mail.shippingMethod})`,
    `Tax           ${formatMinor(mail.taxMinor)}`,
    `Total         ${formatMinor(mail.totalMinor)}`,
    "",
    `You can read this order at ${mail.trackUrl}`,
    "",
    "The Vela team.",
  ].join("\n");
}

function htmlBody(mail: OrderMail): string {
  const rows = mail.lines
    .map((line) => {
      const label = line.option && line.option !== "Standard" ? `${line.title} (${line.option})` : line.title;
      return `<tr><td>${escapeHtml(label)}</td><td>${line.quantity}</td><td>${formatMinor(line.totalMinor)}</td></tr>`;
    })
    .join("");
  return [
    `<p>Order ${escapeHtml(mail.orderNumber)} is confirmed.</p>`,
    "<table><thead><tr><th>Item</th><th>Quantity</th><th>Total</th></tr></thead>",
    `<tbody>${rows}</tbody></table>`,
    `<p>Subtotal ${formatMinor(mail.subtotalMinor)}<br>`,
    `Delivery ${formatMinor(mail.shippingMinor)} (${escapeHtml(mail.shippingMethod)})<br>`,
    `Tax ${formatMinor(mail.taxMinor)}<br>`,
    `Total ${formatMinor(mail.totalMinor)}</p>`,
    `<p><a href="${escapeHtml(mail.trackUrl)}">Read this order</a></p>`,
    "<p>The Vela team.</p>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] as string);
}

/** Exactly one mail for a confirmed order, to the order address alone, with no
 *  cc and no bcc. The subject opens with the fixed prefix and the order number. */
export async function sendOrderConfirmation(mail: OrderMail, requestId: string): Promise<void> {
  if (!env.smtp.host) {
    logError("mail_not_configured", { request_id: requestId, order: mail.orderNumber });
    throw new Error("SMTP is not configured");
  }
  try {
    await mailer().sendMail({
      from: env.smtp.from,
      to: mail.to,
      subject: `Order confirmed: ${mail.orderNumber}`,
      text: plainBody(mail),
      html: htmlBody(mail),
    });
    logEvent("mail_sent", { request_id: requestId, order: mail.orderNumber });
  } catch (error) {
    logError("mail_failed", {
      request_id: requestId,
      order: mail.orderNumber,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
