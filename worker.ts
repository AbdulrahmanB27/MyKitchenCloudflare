
interface Env {
  DB: any;
  IMAGES: any;
  FAMILY_PASSWORD: string;
  TURNSTILE_SECRET: string;
  [key: string]: any; 
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

// --- Helpers ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// --- Schema Initialization ---
async function ensureSchema(env: Env) {
    try {
        await env.DB.batch([
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS recipes (
                id TEXT PRIMARY KEY,
                name TEXT,
                category TEXT,
                is_favorite INTEGER DEFAULT 0,
                is_archived INTEGER DEFAULT 0,
                share_to_family INTEGER DEFAULT 1,
                tenant_id TEXT DEFAULT 'global',
                data TEXT,
                updated_at INTEGER,
                created_at INTEGER
            )`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS shopping_list (
                id TEXT PRIMARY KEY,
                data TEXT,
                updated_at INTEGER
            )`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS meal_plans (
                id TEXT PRIMARY KEY,
                date TEXT,
                slot TEXT,
                recipe_id TEXT,
                data TEXT,
                updated_at INTEGER
            )`)
        ]);
    } catch (e) {
        console.error("Schema init failed", e);
    }
}

async function signToken(payload: any, secret: string) {
    if (!secret) throw new Error("Secret required for signing");
    const encoder = new TextEncoder();
    const data = btoa(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${data}.${signatureB64}`;
}

const checkAuth = async (request: Request, secret: string) => {
    if (!secret) return false;

    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return false;
    
    const token = auth.split(' ')[1];
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    
    const [payloadB64, signatureB64] = parts;
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
        if (payload.exp < Date.now()) return false; 

        return true;
    } catch (e) {
        return false;
    }
};

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

function errorResponse(message: string, status = 500) {
    return jsonResponse({ error: message }, status);
}

// --- Handlers ---

// 1. Auth
async function handleAuth(request: Request, env: Env) {
    if (request.method !== "POST") return errorResponse("Method Not Allowed", 405);
    
    try {
        const body: any = await request.json();
        const password = (body.password || '').trim();
        const turnstileToken = body.turnstileToken;

        let envPassword = env.FAMILY_PASSWORD;
        let envTurnstile = env.TURNSTILE_SECRET;

        // Robust Env Retrieval
        if (!envPassword) {
            const allKeys = Object.keys(env);
            const passKey = allKeys.find(k => k.trim() === 'FAMILY_PASSWORD');
            if (passKey) envPassword = env[passKey];
        }
        
        if (!envTurnstile) {
             const allKeys = Object.keys(env);
             const turnKey = allKeys.find(k => k.trim() === 'TURNSTILE_SECRET');
             if (turnKey) envTurnstile = env[turnKey];
        }

        envPassword = (envPassword || '').trim();
        envTurnstile = (envTurnstile || '').trim();

        if (!envPassword) {
            return errorResponse('Server configuration missing: Password not set.', 401);
        }

        if (password === envPassword) {
            const payload = { 
                sub: 'family_member', 
                exp: Date.now() + (1000 * 60 * 60 * 24 * 365 * 100) 
            };
            const token = await signToken(payload, envPassword);
            return jsonResponse({ token, success: true });
        } else {
            return errorResponse('Incorrect password', 401);
        }
    } catch (e: any) {
        return errorResponse(`Server Error: ${e.message}`, 500);
    }
}

// 2. Recipes
async function handleRecipes(request: Request, env: Env, ctx: ExecutionContext) {
    // Ensure DB exists before any recipe op
    await ensureSchema(env);

    const url = new URL(request.url);
    
    if (request.method === 'GET') {
        const since = url.searchParams.get("since");
        let query = "SELECT data, updated_at FROM recipes WHERE share_to_family = 1";
        let params: any[] = [];
        if (since) {
            query += " AND updated_at > ?";
            params.push(parseInt(since));
        }
        query += " ORDER BY updated_at DESC";
        
        try {
            const { results } = await env.DB.prepare(query).bind(...params).all();
            const recipes = results.map((row: any) => JSON.parse(row.data));
            return jsonResponse(recipes);
        } catch(e: any) { return errorResponse(e.message); }
    }

    let envPassword = env.FAMILY_PASSWORD;
    if (!envPassword) {
        const key = Object.keys(env).find(k => k.trim() === 'FAMILY_PASSWORD');
        if (key) envPassword = env[key];
    }
    
    const authorized = await checkAuth(request, (envPassword || '').trim());
    if (!authorized) return errorResponse("Unauthorized", 401);

    if (request.method === 'POST') {
        try {
            const recipe: any = await request.json();
            const now = Date.now();
            recipe.updatedAt = now;
            // Ensure any existing deleted flag is removed on insert/update
            delete recipe.deleted;
            
            await env.DB.prepare(
                "INSERT INTO recipes (id, name, category, is_favorite, is_archived, share_to_family, tenant_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, is_favorite=excluded.is_favorite, is_archived=excluded.is_archived, share_to_family=excluded.share_to_family, data=excluded.data, updated_at=excluded.updated_at"
            ).bind(recipe.id, recipe.name, recipe.category, recipe.favorite?1:0, recipe.archived?1:0, recipe.shareToFamily?1:0, recipe.tenantId||'global', JSON.stringify(recipe), now).run();
            return jsonResponse({ success: true, timestamp: now });
        } catch(e: any) { return errorResponse(e.message); }
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        if (!id) return errorResponse("Missing ID", 400);
        
        const now = Date.now();
        // Soft Delete: Insert a tombstone so other clients know to delete it
        const tombstone = JSON.stringify({ id, deleted: true, updatedAt: now });
        
        try {
            // 1. Minimize Row: Update name to 'Deleted', clear metadata, set data to small tombstone
            await env.DB.prepare(
                "INSERT INTO recipes (id, name, share_to_family, data, updated_at) VALUES (?, 'Deleted', 1, ?, ?) ON CONFLICT(id) DO UPDATE SET name='Deleted', share_to_family=1, data=excluded.data, updated_at=excluded.updated_at"
            ).bind(id, tombstone, now).run();

            // 2. Self-Cleaning: Delete tombstones older than 30 days to prevent clutter
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            ctx.waitUntil(
                env.DB.prepare("DELETE FROM recipes WHERE name = 'Deleted' AND updated_at < ?").bind(thirtyDaysAgo).run()
            );

            return jsonResponse({ success: true, timestamp: now });
        } catch(e: any) { return errorResponse(e.message); }
    }

    return errorResponse("Method Not Allowed", 405);
}

// 3. Shopping
async function handleShopping(request: Request, env: Env) {
    await ensureSchema(env);
    
    let envPassword = env.FAMILY_PASSWORD;
    if (!envPassword) {
        const key = Object.keys(env).find(k => k.trim() === 'FAMILY_PASSWORD');
        if (key) envPassword = env[key];
    }
    const authorized = await checkAuth(request, (envPassword || '').trim());
    if (!authorized) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);

    if (request.method === 'GET') {
        const { results } = await env.DB.prepare("SELECT data FROM shopping_list").all();
        const items = results.map((row: any) => JSON.parse(row.data));
        return jsonResponse(items);
    }

    if (request.method === 'POST') {
        const item: any = await request.json();
        await env.DB.prepare(
            "INSERT INTO shopping_list (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
        ).bind(item.id, JSON.stringify(item), Date.now()).run();
        return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        const clearAll = url.searchParams.get("clearAll");
        if (clearAll === "true") {
            await env.DB.prepare("DELETE FROM shopping_list").run();
        } else if (clearAll === "checked") {
            const { results } = await env.DB.prepare("SELECT id, data FROM shopping_list").all();
            const ids = results.filter((row: any) => JSON.parse(row.data).isChecked).map((row: any) => row.id);
            if (ids.length > 0) {
                const p = ids.map(() => '?').join(',');
                await env.DB.prepare(`DELETE FROM shopping_list WHERE id IN (${p})`).bind(...ids).run();
            }
        } else if (id) {
            await env.DB.prepare("DELETE FROM shopping_list WHERE id = ?").bind(id).run();
        }
        return jsonResponse({ success: true });
    }
    return errorResponse("Method Not Allowed", 405);
}

// 4. Plans
async function handlePlans(request: Request, env: Env) {
    await ensureSchema(env);
    
    let envPassword = env.FAMILY_PASSWORD;
    if (!envPassword) {
        const key = Object.keys(env).find(k => k.trim() === 'FAMILY_PASSWORD');
        if (key) envPassword = env[key];
    }
    const authorized = await checkAuth(request, (envPassword || '').trim());
    if (!authorized) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);

    if (request.method === 'GET') {
        const { results } = await env.DB.prepare("SELECT data FROM meal_plans").all();
        const plans = results.map((row: any) => JSON.parse(row.data));
        return jsonResponse(plans);
    }

    if (request.method === 'POST') {
        const plan: any = await request.json();
        await env.DB.prepare(
            "INSERT INTO meal_plans (id, date, slot, recipe_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
        ).bind(plan.id, plan.date, plan.slot, plan.recipeId, JSON.stringify(plan), Date.now()).run();
        return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        if (!id) return errorResponse("Missing ID", 400);
        await env.DB.prepare("DELETE FROM meal_plans WHERE id = ?").bind(id).run();
        return jsonResponse({ success: true });
    }
    return errorResponse("Method Not Allowed", 405);
}

// 5. Images (Deduplicated with Hashing)
async function handleImages(request: Request, env: Env) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (request.method === 'GET') {
        if (!key) return errorResponse('Missing key', 400);
        const object = await env.IMAGES.get(key);
        if (!object) return errorResponse('Image not found', 404);
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000');
        // Add CORS to image response too
        Object.entries(corsHeaders).forEach(([k,v]) => headers.set(k, v));
        return new Response(object.body, { headers });
    }

    if (request.method === 'POST') {
        let envPassword = env.FAMILY_PASSWORD;
        if (!envPassword) {
            const k = Object.keys(env).find(k => k.trim() === 'FAMILY_PASSWORD');
            if (k) envPassword = env[k];
        }
        const authorized = await checkAuth(request, (envPassword || '').trim());
        if (!authorized) return errorResponse("Unauthorized", 401);

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) return errorResponse("No file uploaded", 400);

        try {
            // Calculate SHA-256 hash of the file content
            const arrayBuffer = await file.arrayBuffer();
            const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(digest));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Determine extension (default to jpg if blob)
            let extension = file.name.split('.').pop();
            if (!extension || extension === file.name || extension === 'blob') {
                extension = file.type === 'image/png' ? 'png' : 'jpg';
            }
            
            const uniqueKey = `${hashHex}.${extension}`;
            
            // Deduplication: Check if an image with this hash already exists
            const existing = await env.IMAGES.head(uniqueKey);
            
            if (!existing) {
                // If new content, upload it
                await env.IMAGES.put(uniqueKey, arrayBuffer, { httpMetadata: { contentType: file.type } });
            }
            // If exists, simply return the URL for the existing file (deduplication)

            return jsonResponse({ url: `/api/images?key=${uniqueKey}` });
        } catch (e: any) {
            return errorResponse(`Upload failed: ${e.message}`, 500);
        }
    }

    return errorResponse("Method Not Allowed", 405);
}

// --- Main Router ---

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // Handle CORS Preflight globally
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (url.pathname.startsWith('/api/auth')) return handleAuth(request, env);
        if (url.pathname.startsWith('/api/recipes')) return handleRecipes(request, env, ctx);
        if (url.pathname.startsWith('/api/shopping')) return handleShopping(request, env);
        if (url.pathname.startsWith('/api/plans')) return handlePlans(request, env);
        if (url.pathname.startsWith('/api/images')) return handleImages(request, env);

        if (url.pathname.startsWith('/api/')) {
             return new Response("Not Found", { status: 404, headers: corsHeaders });
        }
        return new Response("Not Found", { status: 404 });
    }
}
