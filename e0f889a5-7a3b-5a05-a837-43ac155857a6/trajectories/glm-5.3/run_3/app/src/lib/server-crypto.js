import crypto from 'crypto';
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
