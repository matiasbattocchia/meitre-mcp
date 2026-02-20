import { encrypt, decrypt } from '../lib/crypto.ts';

export async function getToken(db: D1Database, cacheKey: string, encryptionKey: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT token FROM tokens WHERE cache_key = ?')
    .bind(cacheKey)
    .first<{ token: string }>();
  if (!row) return null;
  return decrypt(row.token, encryptionKey);
}

export async function setToken(db: D1Database, cacheKey: string, token: string, encryptionKey: string): Promise<void> {
  const encrypted = await encrypt(token, encryptionKey);
  await db
    .prepare('INSERT OR REPLACE INTO tokens (cache_key, token) VALUES (?, ?)')
    .bind(cacheKey, encrypted)
    .run();
}

export async function deleteToken(db: D1Database, cacheKey: string): Promise<void> {
  await db
    .prepare('DELETE FROM tokens WHERE cache_key = ?')
    .bind(cacheKey)
    .run();
}
