
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const checkAuth = async (request: Request, secret: string) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.split(' ')[1];
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return null;
    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        if (!valid) return null;
        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch (e) { return null; }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const jwtSecret = (context.env.JWT_SECRET || '').trim();
  const payload = await checkAuth(context.request, jwtSecret);
  if (!payload) return new Response("Unauthorized", { status: 401 });
  
  try {
    const familyId = payload.familyId;
    const { results } = await context.env.DB.prepare("SELECT data FROM shopping_list WHERE family_id = ?").bind(familyId).all();
    const items = results.map((row: any) => JSON.parse(row.data));
    return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const jwtSecret = (context.env.JWT_SECRET || '').trim();
  const payload = await checkAuth(context.request, jwtSecret);
  if (!payload) return new Response("Unauthorized", { status: 401 });

  try {
    const item = await context.request.json() as any;
    const familyId = payload.familyId;
    
    await context.env.DB.prepare(
      "INSERT INTO shopping_list (id, family_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
    ).bind(item.id, familyId, JSON.stringify(item), Date.now()).run();
    return new Response(JSON.stringify({ success: true }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const jwtSecret = (context.env.JWT_SECRET || '').trim();
  const payload = await checkAuth(context.request, jwtSecret);
  if (!payload) return new Response("Unauthorized", { status: 401 });

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const clearAll = url.searchParams.get("clearAll");
    const familyId = payload.familyId;

    if (clearAll === "true") {
        await context.env.DB.prepare("DELETE FROM shopping_list WHERE family_id = ?").bind(familyId).run();
    } else if (clearAll === "checked") {
        const { results } = await context.env.DB.prepare("SELECT id, data FROM shopping_list WHERE family_id = ?").bind(familyId).all();
        const idsToDelete = results.filter((row: any) => JSON.parse(row.data).isChecked).map((row: any) => row.id);
        if (idsToDelete.length > 0) {
            const placeholders = idsToDelete.map(() => '?').join(',');
            await context.env.DB.prepare(`DELETE FROM shopping_list WHERE id IN (${placeholders}) AND family_id = ?`).bind(...idsToDelete, familyId).run();
        }
    } else if (id) {
        await context.env.DB.prepare("DELETE FROM shopping_list WHERE id = ? AND family_id = ?").bind(id, familyId).run();
    }
    return new Response(JSON.stringify({ success: true }));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
