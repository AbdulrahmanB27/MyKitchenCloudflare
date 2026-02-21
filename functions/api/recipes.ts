
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  IMAGES: any; // R2Bucket binding
  FAMILY_PASSWORD: string;
}

// Securely verify HMAC-SHA256 signature
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

        return true;
    } catch (e) {
        return false;
    }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const since = url.searchParams.get("since");

    let query = "SELECT data, updated_at FROM recipes WHERE share_to_family = 1";
    let params: any[] = [];

    if (since) {
        query += " AND updated_at > ?";
        params.push(parseInt(since));
    }
    
    query += " ORDER BY updated_at DESC";

    const { results } = await context.env.DB.prepare(query).bind(...params).all();
    
    const recipes = results.map((row: any) => JSON.parse(row.data));
    return new Response(JSON.stringify(recipes), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // Trim the env password to match the trimming done in auth.ts during token generation
  const envPassword = (context.env.FAMILY_PASSWORD || '').trim();
  const authorized = await checkAuth(context.request, envPassword);
  
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  try {
    const recipe = await context.request.json() as any;
    const now = Date.now();
    recipe.updatedAt = now;
    delete recipe.deleted; // Ensure fresh updates don't carry deleted flag
    
    await context.env.DB.prepare(
      "INSERT INTO recipes (id, name, category, is_favorite, is_archived, share_to_family, tenant_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, is_favorite=excluded.is_favorite, is_archived=excluded.is_archived, share_to_family=excluded.share_to_family, data=excluded.data, updated_at=excluded.updated_at"
    ).bind(
      recipe.id, 
      recipe.name, 
      recipe.category, 
      recipe.favorite ? 1 : 0, 
      recipe.archived ? 1 : 0,
      recipe.shareToFamily ? 1 : 0,
      recipe.tenantId || 'global',
      JSON.stringify(recipe), 
      now
    ).run();

    return new Response(JSON.stringify({ success: true, timestamp: now }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
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

    // 1. Fetch existing recipe to find Image URL
    const existing = await context.env.DB.prepare("SELECT data FROM recipes WHERE id = ?").bind(id).first();
    
    if (existing) {
        try {
            const recipeData = JSON.parse(existing.data);
            // Check if image is hosted by us (contains /api/images?key=)
            if (recipeData.image && recipeData.image.includes('/api/images?key=')) {
                const key = recipeData.image.split('key=')[1];
                if (key) {
                    await context.env.IMAGES.delete(key);
                }
            }
        } catch (imgError) {
            console.error("Failed to delete associated image", imgError);
            // Continue with recipe deletion even if image delete fails
        }
    }

    const now = Date.now();
    const tombstone = JSON.stringify({ id, deleted: true, updatedAt: now });

    // Perform Soft Delete (update data with tombstone and flag record)
    await context.env.DB.prepare(
        "UPDATE recipes SET data = ?, updated_at = ?, name = 'Deleted' WHERE id = ?"
    ).bind(tombstone, now, id).run();

    return new Response(JSON.stringify({ success: true, timestamp: now }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
