
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  FAMILY_PASSWORD: string;
}

const checkAuth = async (request: Request, secret: string) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return false;
    const token = auth.split(' ')[1];
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return false;
    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        if (!valid) return false;
        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) return false;
        return true;
    } catch (e) { return false; }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    // Return all restaurants (including deleted ones) so clients can sync deletions
    const { results } = await context.env.DB.prepare("SELECT data, deleted FROM restaurants ORDER BY updated_at DESC").all();
    const list = results.map((row: any) => {
        const data = JSON.parse(row.data);
        // Ensure the deleted flag from the column overrides the JSON blob (or is added)
        return { ...data, deleted: !!row.deleted };
    });
    return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const envPassword = (context.env.FAMILY_PASSWORD || '').trim();
  const authorized = await checkAuth(context.request, envPassword);
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  try {
    const r = await context.request.json() as any;
    const now = Date.now();
    r.updatedAt = now;
    
    // Ensure core fields map to columns for indexing if needed, but we mostly use 'data' JSON blob for app
    // We update columns to allow for easier querying in future
    await context.env.DB.prepare(
      `INSERT INTO restaurants (id, family_id, name, cuisine_tags, stars, price, notes, go_to_order, last_visited_at, data, updated_at, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
         name=excluded.name, 
         cuisine_tags=excluded.cuisine_tags, 
         stars=excluded.stars, 
         price=excluded.price, 
         notes=excluded.notes, 
         go_to_order=excluded.go_to_order, 
         last_visited_at=excluded.last_visited_at, 
         data=excluded.data, 
         updated_at=excluded.updated_at`
    ).bind(
      r.id, 
      r.familyId || 'global',
      r.name,
      JSON.stringify(r.cuisineTags || []),
      r.stars || 0,
      r.price || '',
      r.notes || '',
      r.goToOrder || '',
      r.lastVisitedAt || null,
      JSON.stringify(r),
      now,
      r.createdAt || now
    ).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const envPassword = (context.env.FAMILY_PASSWORD || '').trim();
  const authorized = await checkAuth(context.request, envPassword);
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("Missing ID", { status: 400 });

    const now = Date.now();
    // Fetch existing to preserve some data if needed, or just overwrite with tombstone
    // For restaurants, we just need to know it's deleted
    const tombstone = JSON.stringify({ id, deleted: true, updatedAt: now });

    // Soft delete: set deleted=1 AND update data blob
    await context.env.DB.prepare("UPDATE restaurants SET deleted = 1, data = ?, updated_at = ? WHERE id = ?")
        .bind(tombstone, now, id)
        .run();
        
    return new Response(JSON.stringify({ success: true }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
