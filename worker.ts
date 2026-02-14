
interface Env {
  DB: any;
  IMAGES: any;
  FAMILY_PASSWORD: string;
  TURNSTILE_SECRET: string;
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
    // CRITICAL: Return false immediately if secret is missing to prevent crypto crash
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

        // Ensure secrets are strictly from the environment
        const envPassword = (env.FAMILY_PASSWORD || '').trim();
        const envTurnstile = (env.TURNSTILE_SECRET || '').trim();

        // STRICT CHECK: If password is not set in environment, fail immediately.
        if (!envPassword) {
            console.error('[Auth] FAMILY_PASSWORD environment variable is missing.');
            return errorResponse('Server configuration missing: Password not set.', 401);
        }

        // Turnstile Verification
        if (envTurnstile) {
            if (!turnstileToken) return errorResponse('Verification token missing', 400);
            
            const ip = request.headers.get('CF-Connecting-IP');
            const formData = new FormData();
            formData.append('secret', envTurnstile);
            formData.append('response', turnstileToken);
            formData.append('remoteip', ip || '');

            const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { body: formData, method: 'POST' });
            const outcome: any = await result.json();
            if (!outcome.success) {
                console.error('[Auth] Turnstile verification failed', outcome);
                return errorResponse('Security check failed.', 403);
            }
        }

        if (password === envPassword) {
            const payload = { 
                sub: 'family_member', 
                exp: Date.now() + (1000 * 60 * 60 * 24 * 365 * 100) // 100 years
            };
            const token = await signToken(payload, envPassword);
            return jsonResponse({ token, success: true });
        } else {
            return errorResponse('Incorrect password', 401);
        }
    } catch (e: any) {
        console.error('[Auth] Internal Error:', e);
        return errorResponse(`Server Error: ${e.message}`, 500);
    }
}

// 2. Recipes
async function handleRecipes(request: Request, env: Env) {
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

    // Write operations require auth
    const authorized = await checkAuth(request, env.FAMILY_PASSWORD || '');
    if (!authorized) return errorResponse("Unauthorized", 401);

    if (request.method === 'POST') {
        try {
            const recipe: any = await request.json();
            const now = Date.now();
            recipe.updatedAt = now;
            await env.DB.prepare(
                "INSERT INTO recipes (id, name, category, is_favorite, is_archived, share_to_family, tenant_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, is_favorite=excluded.is_favorite, is_archived=excluded.is_archived, share_to_family=excluded.share_to_family, data=excluded.data, updated_at=excluded.updated_at"
            ).bind(recipe.id, recipe.name, recipe.category, recipe.favorite?1:0, recipe.archived?1:0, recipe.shareToFamily?1:0, recipe.tenantId||'global', JSON.stringify(recipe), now).run();
            return jsonResponse({ success: true, timestamp: now });
        } catch(e: any) { return errorResponse(e.message); }
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        if (!id) return errorResponse("Missing ID", 400);
        await env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
        return jsonResponse({ success: true });
    }

    return errorResponse("Method Not Allowed", 405);
}

// 3. Shopping
async function handleShopping(request: Request, env: Env) {
    const authorized = await checkAuth(request, env.FAMILY_PASSWORD || '');
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
    const authorized = await checkAuth(request, env.FAMILY_PASSWORD || '');
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

// 5. Images
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
        const authorized = await checkAuth(request, env.FAMILY_PASSWORD || '');
        if (!authorized) return errorResponse("Unauthorized", 401);

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) return errorResponse("No file uploaded", 400);

        const extension = file.name.split('.').pop();
        const uniqueKey = `${crypto.randomUUID()}.${extension}`;
        await env.IMAGES.put(uniqueKey, file.stream(), { httpMetadata: { contentType: file.type } });
        return jsonResponse({ url: `/api/images?key=${uniqueKey}` });
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
        if (url.pathname.startsWith('/api/recipes')) return handleRecipes(request, env);
        if (url.pathname.startsWith('/api/shopping')) return handleShopping(request, env);
        if (url.pathname.startsWith('/api/plans')) return handlePlans(request, env);
        if (url.pathname.startsWith('/api/images')) return handleImages(request, env);

        // Fallback for unknown API routes
        if (url.pathname.startsWith('/api/')) {
             return new Response("Not Found", { status: 404, headers: corsHeaders });
        }

        // For non-API requests (assets), the Worker with Assets setup should handle them automatically 
        // before reaching here, OR we return 404 and let the asset system fallback (depending on config).
        // Since we only set `main` and `assets`, usually valid assets are served first. 
        // If we get here, it means no asset was found.
        return new Response("Not Found", { status: 404 });
    }
}
