export async function getToken(db: D1Database, cacheKey: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT token FROM tokens WHERE cache_key = ?')
    .bind(cacheKey)
    .first<{ token: string }>();
  return row?.token ?? null;
}

export async function setToken(db: D1Database, cacheKey: string, token: string): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO tokens (cache_key, token) VALUES (?, ?)')
    .bind(cacheKey, token)
    .run();
}

export async function deleteToken(db: D1Database, cacheKey: string): Promise<void> {
  await db
    .prepare('DELETE FROM tokens WHERE cache_key = ?')
    .bind(cacheKey)
    .run();
}
