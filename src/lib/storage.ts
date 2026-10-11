/**
 * Object storage abstraction. Default: local disk under ./uploads served through
 * the access-controlled /api/files route. S3-compatible providers (S3, R2, MinIO)
 * are supported via STORAGE_PROVIDER=s3 + credentials.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { env, s3Configured } from './env';

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageProvider {
  name: string;
  put(key: string, buffer: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Resolve a storage key to an absolute path, refusing anything that escapes
 * UPLOAD_DIR.
 *
 * Keys are generated server-side today, but /api/files/<key> hands a
 * URL-decoded, user-controlled key straight to the storage layer, and
 * `path.join(UPLOAD_DIR, '../../.env')` happily resolves outside the uploads
 * directory. The route's authorization check currently masks that, but the
 * storage layer must not rely on its callers for containment.
 */
function resolveLocalPath(key: string): string | null {
  const full = path.resolve(UPLOAD_DIR, key);
  if (full !== UPLOAD_DIR && !full.startsWith(UPLOAD_DIR + path.sep)) return null;
  return full;
}

const localProvider: StorageProvider = {
  name: 'local',
  async put(key, buffer) {
    const full = resolveLocalPath(key);
    if (!full) throw new Error('Invalid storage key: escapes the upload directory');
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return { key, url: `/api/files/${encodeURIComponent(key)}` };
  },
  async get(key) {
    const full = resolveLocalPath(key);
    if (!full) return null;
    try {
      return await fs.readFile(full);
    } catch {
      return null;
    }
  },
  async delete(key) {
    const full = resolveLocalPath(key);
    if (!full) return;
    try {
      await fs.unlink(full);
    } catch {
      /* ignore */
    }
  },
};

// ── Minimal S3-compatible provider (SigV4, path-style) ──
function s3Sign(method: string, key: string, payload: Buffer, mimeType: string) {
  const endpoint = env.S3_ENDPOINT || `https://s3.${env.S3_REGION}.amazonaws.com`;
  const host = new URL(endpoint).host;
  const region = env.S3_REGION;
  const bucket = env.S3_BUCKET;
  const objectPath = `/${bucket}/${key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, objectPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

  const hmac = (k: Buffer | string, data: string) => crypto.createHmac('sha256', k).update(data).digest();
  const kDate = hmac(`AWS4${env.S3_SECRET_ACCESS_KEY}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const url = `${endpoint}${objectPath}`;
  const headers: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'content-type': mimeType,
    authorization: `AWS4-HMAC-SHA256 Credential=${env.S3_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  return { url, headers };
}

const s3Provider: StorageProvider = {
  name: 's3',
  async put(key, buffer, mimeType) {
    if (!s3Configured) throw new Error('S3 storage is not configured (set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)');
    const { url, headers } = s3Sign('PUT', key, buffer, mimeType);
    const res = await fetch(url, { method: 'PUT', headers, body: buffer });
    if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${await res.text()}`);
    const publicBase = env.S3_PUBLIC_URL || (env.S3_ENDPOINT ? `${env.S3_ENDPOINT}/${env.S3_BUCKET}` : '');
    return { key, url: publicBase ? `${publicBase}/${key}` : url };
  },
  async get(key) {
    if (!s3Configured) return null;
    const endpoint = env.S3_ENDPOINT || `https://s3.${env.S3_REGION}.amazonaws.com`;
    const res = await fetch(`${endpoint}/${env.S3_BUCKET}/${key}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  },
  async delete(key) {
    if (!s3Configured) return;
    const endpoint = env.S3_ENDPOINT || `https://s3.${env.S3_REGION}.amazonaws.com`;
    const { url, headers } = s3Sign('DELETE', key, Buffer.alloc(0), 'application/octet-stream');
    await fetch(url, { method: 'DELETE', headers: { ...headers, host: new URL(endpoint).host } });
  },
};

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (provider) return provider;
  if (env.STORAGE_PROVIDER === 's3') {
    if (!s3Configured) throw new Error('STORAGE_PROVIDER=s3 but S3 credentials are missing — set a setup-required state or use local storage');
    provider = s3Provider;
  } else {
    provider = localProvider;
  }
  return provider;
}

export function randomStorageKey(kind: string, ext: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${kind}/${y}/${m}/${crypto.randomUUID()}${ext}`;
}

export function extForMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/pdf': '.pdf',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return map[mime] ?? '';
}
