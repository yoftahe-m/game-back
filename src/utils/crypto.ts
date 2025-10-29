import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const algorithm = 'aes-256-cbc';

const keyHex = process.env.ENCRYPTION_KEY;
if (!keyHex) throw new Error('ENCRYPTION_KEY not set in .env');

const saltHex = process.env.ENCRYPTION_SALT;
if (!saltHex) throw new Error('ENCRYPTION_SALT not set in .env');

const defaultKey: Buffer = Buffer.from(keyHex, 'hex'); 
const salt: string = saltHex;

function getKey(id: string): Buffer {
  return crypto.scryptSync(id, salt, 32) as Buffer;
}

interface EncryptedResult {
  iv: string;
  encryptedData: string;
}

export function encrypt(text: string, id?: string): EncryptedResult {
  const key: Buffer = id ? getKey(id) : defaultKey;
  const iv: Buffer = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { iv: iv.toString('hex'), encryptedData: encrypted };
}

export function decrypt(encryptedData: string, ivHex: string, id?: string): string {
  const key: Buffer = id ? getKey(id) : defaultKey;
  const iv: Buffer = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
