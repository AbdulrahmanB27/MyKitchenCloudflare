
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; params: any; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  FAMILY_PASSWORD: string;
}

// Securely verify HMAC-SHA256 signature (reused from recipes.ts logic)
const checkAuth = async (request: Request, secret: string) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return false;
    
    const token = auth.split(' ')[1];
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return false;

    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        
        if (!valid) return false;

        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) return false; // Token expired

        return payload; // Return payload to get familyId
    } catch (e) {
        return false;
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const envPassword = (context.env.FAMILY_PASSWORD || '').trim();
  const authPayload = await checkAuth(context.request, envPassword);
  
  if (!authPayload) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const recipeId = context.params.id;
  if (!recipeId) return new Response(JSON.stringify({ error: "Missing Recipe ID" }), { status: 400, headers: { "Content-Type": "application/json" } });

  const familyId = authPayload.familyId;

  try {
    // 1. Verify recipe exists and belongs to family (or is global/accessible)
    // Actually, recipes table has tenant_id/family_id. We should check that.
    // The current recipes table schema has `tenant_id` which seems to be the family ID.
    // Let's verify ownership.
    const recipe = await context.env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(recipeId).first();
    
    if (!recipe) {
        return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // 2. Check if share link already exists
    const existing = await context.env.DB.prepare(
        "SELECT token FROM recipe_share_links WHERE family_id = ? AND recipe_id = ? AND revoked_at IS NULL"
    ).bind(familyId, recipeId).first();

    if (existing) {
        return new Response(JSON.stringify({ token: existing.token, recipeId }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Generate new token
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    // URL-safe base64
    const token = btoa(String.fromCharCode(...randomBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const now = Date.now();

    await context.env.DB.prepare(
        "INSERT INTO recipe_share_links (token, family_id, recipe_id, created_at) VALUES (?, ?, ?, ?)"
    ).bind(token, familyId, recipeId, now).run();

    return new Response(JSON.stringify({ token, recipeId }), { headers: { "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
