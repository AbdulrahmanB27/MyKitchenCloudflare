type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

async function signToken(payload: any, secret: string) {
    const encoder = new TextEncoder();
    const data = btoa(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${data}.${signatureB64}`;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body: any = await context.request.json();
    const token = body.token;
    if (!token) return new Response("Missing token", { status: 400 });

    const link = await context.env.DB.prepare("SELECT * FROM family_links WHERE token = ?").bind(token).first();
    if (!link) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
    if (link.expires_at < Date.now()) return new Response(JSON.stringify({ error: "Link expired" }), { status: 403 });
    if (link.type !== 'temporary') return new Response(JSON.stringify({ error: "Invalid link type" }), { status: 400 });

    const family = await context.env.DB.prepare("SELECT id, name FROM families WHERE id = ?").bind(link.family_id).first();
    if (!family) return new Response(JSON.stringify({ error: "Family not found" }), { status: 404 });

    const jwtSecret = (context.env.JWT_SECRET || '').trim();
    if (!jwtSecret) return new Response(JSON.stringify({ error: "Server configuration missing JWT_SECRET" }), { status: 500 });
            
    // Create payload
    const payload = {
        familyId: family.id,
        name: family.name,
        iat: Date.now(),
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
    };

    const jwt = await signToken(payload, jwtSecret);

    return new Response(JSON.stringify({ success: true, token: jwt, familyId: family.id, name: family.name }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
