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
        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        
        if (!valid) return null;

        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) return null;

        return payload;
    } catch (e) {
        return null;
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const jwtSecret = (context.env.JWT_SECRET || '').trim();
  const payload = await checkAuth(context.request, jwtSecret);
  
  if (!payload) return new Response("Unauthorized", { status: 401 });

  try {
    const body: any = await context.request.json();
    const type = body.type; // 'temporary', 'view', or 'permanent'
    if (type !== 'temporary' && type !== 'view' && type !== 'permanent') return new Response("Invalid type", { status: 400 });

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const now = Date.now();
    // permanent links effectively never expire (100 years)
    const expiresAt = type === 'temporary' ? now + 24 * 60 * 60 * 1000 : (type === 'view' ? now + 365 * 24 * 60 * 60 * 1000 : now + 100 * 365 * 24 * 60 * 60 * 1000);

    await context.env.DB.prepare(
        "INSERT INTO family_links (token, family_id, type, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(token, payload.familyId, type, now, expiresAt).run();

    return new Response(JSON.stringify({ token, type, expiresAt }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
