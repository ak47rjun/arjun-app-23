import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { encryptSecret, decryptSecret } from '../crypto';

authenticator.options = { window: 1 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(secret: string, email: string, issuer = 'ARJUN'): string {
  return authenticator.keyuri(email, issuer, secret);
}

export async function totpQrDataUrl(secret: string, email: string): Promise<string> {
  return QRCode.toDataURL(totpUri(secret, email));
}

export function verifyTotp(code: string, secretEnc: string): boolean {
  try {
    const secret = decryptSecret(secretEnc);
    return authenticator.check(code.replace(/\s/g, ''), secret);
  } catch {
    return false;
  }
}

export function encryptTotpSecret(secret: string): string {
  return encryptSecret(secret);
}
