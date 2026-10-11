'use client';

/** Typed fetch wrapper for ARJUN APIs. Throws ApiClientError with server message. */
export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(method: string, url: string, body?: unknown, opts: { form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !opts.form ? { 'content-type': 'application/json' } : undefined,
    body: opts.form ? opts.form : body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    throw new ApiClientError(res.status, data?.error ?? 'ERROR', data?.message ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, undefined, { form }),
};
