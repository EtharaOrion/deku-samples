import nodemailer from 'nodemailer';
import { config } from './config.js';
import { MAIL_FROM } from './db/constants.js';

const transport = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: false });

export interface Mail { to: string; subject: string; text: string }

export async function sendMail(mail: Mail): Promise<void> {
  await transport.sendMail({ from: MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
}

export const SUBJECTS = {
  certificateIssued: (number: string) => `Certificate ${number} issued`,
  certificateWithdrawn: (number: string) => `Certificate ${number} withdrawn`,
  changeNotice: (reference: string) => `Change notice ${reference} requires acknowledgement`,
  enquiryReceived: (reference: string) => `Enquiry ${reference} received`,
};
