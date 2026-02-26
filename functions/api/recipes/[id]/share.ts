
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; params: any; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  FAMILY_PASSWORD: string;
}

// Securely verify HMAC-SHA256 signature
const checkAuth = async (request: Request, secret: string) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
        console.log("checkAuth: No auth header or invalid format");
        return false;
    }
    
    const token = auth.split(' ')[1];
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) {
        console.log("checkAuth: Invalid token format (missing payload or signature)");
        return false;
    }

    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        
        if (!valid) {
            console.log("checkAuth: Signature verification failed");
            return false;
        }

        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) {
            console.log("checkAuth: Token expired");
            return false; // Token expired
        }

        return payload; 
    } catch (e: any) {
        console.error("checkAuth: Exception during verification", e);
        return false;
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const envPassword = (context.env.FAMILY_PASSWORD || '').trim();
    // Auth is optional for sharing now
    let authPayload = await checkAuth(context.request, envPassword);
    
    // If not authenticated, use a default 'public' identity
    const familyId = authPayload ? (authPayload.familyId || 'default') : 'public';

    const recipeId = context.params.id;
    if (!recipeId) return new Response(JSON.stringify({ error: "Missing Recipe ID" }), { status: 400, headers: { "Content-Type": "application/json" } });

    if (!context.env.DB) {
        throw new Error("DB binding is missing");
    }

    // 1. Verify recipe exists
    let recipe = await context.env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(recipeId).first();
    
    if (!recipe) {
        // Try to read body to see if client sent recipe data
        try {
            const body = await context.request.json() as any;
            if (body && body.id === recipeId) {
                const now = Date.now();
                // Insert recipe into DB so it can be shared
                await context.env.DB.prepare(
                  "INSERT INTO recipes (id, name, category, is_favorite, is_archived, share_to_family, tenant_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                ).bind(
                  body.id, 
                  body.name, 
                  body.category, 
                  0, // is_favorite (default 0 for public/shared)
                  0, // is_archived
                  0, // share_to_family (0 so it doesn't sync to everyone else unless authorized)
                  familyId, // 'public' or 'default' or actual familyId
                  JSON.stringify(body), 
                  now
                ).run();
                
                recipe = { id: recipeId }; // Now it exists
            }
        } catch (e) {
            // Ignore body parse errors
        }
    }
    
    if (!recipe) {
        return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // 2. Check if share link already exists
    // We check for ANY valid link for this recipe, regardless of who created it, to avoid duplicates if possible.
    // Or, if we want unique links per user, we filter by family_id.
    // For public sharing, we might just want to return an existing valid link if one exists.
    const existing = await context.env.DB.prepare(
        "SELECT token FROM recipe_share_links WHERE recipe_id = ? AND revoked_at IS NULL"
    ).bind(recipeId).first();

    if (existing) {
        return new Response(JSON.stringify({ token: existing.token, recipeId }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Generate new token
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
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
    const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
    console.error("Share API Error:", e);
    return new Response(JSON.stringify({ error: `Share Error: ${msg}` }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
