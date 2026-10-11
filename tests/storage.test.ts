/**
 * Local storage provider: a storage key must never resolve outside uploads/.
 *
 * /api/files/<key> passes a URL-decoded, user-controlled key straight into the
 * storage layer, so `../../.env` used to resolve to the app root. These tests
 * pin the containment check in place.
 */
import { describe, expect, it } from 'vitest';
import { getStorage, randomStorageKey } from '@/lib/storage';

describe('local storage path containment', () => {
  const storage = getStorage();

  it('refuses to write, read or delete through a traversing key', async () => {
    await expect(storage.put('../../.env', Buffer.from('pwned'), 'text/plain')).rejects.toThrow(/escapes/i);
    expect(await storage.get('../../.env')).toBeNull();
    expect(await storage.get('../../../etc/passwd')).toBeNull();
    expect(await storage.get('../prisma/schema.prisma')).toBeNull();
    // delete must no-op instead of unlinking a file outside uploads/
    await expect(storage.delete('../../package.json')).resolves.toBeUndefined();
  });

  it('leaves files outside the uploads directory untouched', async () => {
    const { readFile } = await import('fs/promises');
    await storage.delete('../../package.json');
    // if the traversal delete above had worked, this read would throw
    const pkg = await readFile(new URL('../package.json', import.meta.url), 'utf8');
    expect(pkg).toContain('"name": "arjun"');
  });

  it('still round-trips keys that stay inside the uploads directory', async () => {
    const key = randomStorageKey('attachment', '.txt');
    await storage.put(key, Buffer.from('hello'), 'text/plain');
    expect((await storage.get(key))?.toString()).toBe('hello');
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });
});
