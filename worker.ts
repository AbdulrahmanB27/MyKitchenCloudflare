
interface Env {
  DB: any;
  IMAGES: any;
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

function jsonResponse(data: any, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

function errorResponse(message: string, status = 500) {
    return jsonResponse({ error: message }, status);
}

// --- Crypto Utils ---

async function hashPassword(password: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
        { "name": "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { "name": "AES-GCM", "length": 256 },
        true,
        [ "encrypt", "decrypt" ]
    );
    const exported = await crypto.subtle.exportKey("raw", key);
    return Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
    return crypto.randomUUID();
}

function generateToken(): string {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

// --- Auth Middleware ---

async function getSession(request: Request, env: Env): Promise<{ familyId: string } | null> {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    
    const token = auth.split(' ')[1];
    
    // Check DB for token
    try {
        const result = await env.DB.prepare("SELECT family_id FROM device_tokens WHERE token = ?").bind(token).first();
        if (result) {
            // Async update last_used could go here
            return { familyId: result.family_id };
        }
    } catch (e) {
        console.error("Session lookup failed", e);
    }
    return null;
}

// --- Schema Initialization ---
async function ensureSchema(env: Env) {
    try {
        // Create tables if they don't exist. 
        await env.DB.batch([
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT UNIQUE, password_hash TEXT, admin_password_hash TEXT, salt TEXT, created_at INTEGER)`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_tokens (token TEXT PRIMARY KEY, family_id TEXT, created_at INTEGER, last_used_at INTEGER)`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, family_id TEXT, name TEXT, category TEXT, is_favorite INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, share_to_family INTEGER DEFAULT 1, tenant_id TEXT DEFAULT 'global', data TEXT, updated_at INTEGER, created_at INTEGER)`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS meal_plans (id TEXT PRIMARY KEY, family_id TEXT, date TEXT, slot TEXT, recipe_id TEXT, data TEXT, updated_at INTEGER)`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS restaurants (id TEXT PRIMARY KEY, family_id TEXT, name TEXT, cuisine_tags TEXT, stars INTEGER DEFAULT 0, price TEXT, notes TEXT, go_to_order TEXT, last_visited_at INTEGER, data TEXT, updated_at INTEGER, created_at INTEGER)`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS vote_sessions (id TEXT PRIMARY KEY, access_code TEXT, data TEXT, created_at INTEGER, ended_at INTEGER, active INTEGER DEFAULT 1)`),
            env.DB.prepare(`CREATE TABLE IF NOT EXISTS votes (id TEXT PRIMARY KEY, session_id TEXT, restaurant_id TEXT, device_id TEXT, vote_value INTEGER, created_at INTEGER)`)
        ]);
    } catch (e) {
        console.error("Schema init failed", e);
    }
}

// --- Handlers ---

// 1. Auth & Admin Handlers
async function handleAuth(request: Request, env: Env) {
    await ensureSchema(env); // Ensure schema on auth too, to create families table
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/auth', ''); // /login, /register

    if (request.method !== "POST") return errorResponse("Method Not Allowed", 405);
    
    const body: any = await request.json();

    // REGISTER
    if (path === '/register') {
        const { familyName, password, adminPassword } = body;
        if (!familyName || !password || !adminPassword) return errorResponse("Missing fields", 400);

        try {
            // Check for existing family name (case-insensitive)
            const exists = await env.DB.prepare("SELECT id FROM families WHERE lower(name) = lower(?)").bind(familyName).first();
            if (exists) return errorResponse("Family name already exists", 409);

            const salt = generateSalt();
            const pwHash = await hashPassword(password, salt);
            const adminHash = await hashPassword(adminPassword, salt);
            const familyId = crypto.randomUUID();
            const now = Date.now();

            await env.DB.prepare(
                "INSERT INTO families (id, name, password_hash, admin_password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(familyId, familyName, pwHash, adminHash, salt, now).run();

            // Auto-login: Issue token
            const token = generateToken();
            await env.DB.prepare("INSERT INTO device_tokens (token, family_id, created_at, last_used_at) VALUES (?, ?, ?, ?)").bind(token, familyId, now, now).run();

            return jsonResponse({ success: true, token, familyId, name: familyName });
        } catch (e: any) {
            return errorResponse(e.message);
        }
    }

    // LOGIN
    if (path === '/login') {
        const { familyName, password } = body;
        if (!familyName || !password) return errorResponse("Missing credentials", 400);

        try {
            // Case-insensitive lookup for login convenience
            const family = await env.DB.prepare("SELECT * FROM families WHERE lower(name) = lower(?)").bind(familyName).first();
            if (!family) return errorResponse("Family not found", 404);

            const hash = await hashPassword(password, family.salt);
            if (hash !== family.password_hash) return errorResponse("Incorrect password", 401);

            // Issue token
            const token = generateToken();
            const now = Date.now();
            await env.DB.prepare("INSERT INTO device_tokens (token, family_id, created_at, last_used_at) VALUES (?, ?, ?, ?)").bind(token, family.id, now, now).run();

            return jsonResponse({ success: true, token, familyId: family.id, name: family.name });
        } catch (e: any) {
            return errorResponse(e.message);
        }
    }

    return errorResponse("Not Found", 404);
}

// Admin Actions
async function handleAdmin(request: Request, env: Env) {
    const session = await getSession(request, env);
    if (!session) return errorResponse("Unauthorized", 401);

    const body: any = await request.json();
    const { action, adminPassword } = body; // action: 'update_password' | 'delete_family' | 'rename_family'

    try {
        // Verify Admin Password
        const family = await env.DB.prepare("SELECT * FROM families WHERE id = ?").bind(session.familyId).first();
        if (!family) return errorResponse("Family not found", 404);

        const adminHashCheck = await hashPassword(adminPassword, family.salt);
        if (adminHashCheck !== family.admin_password_hash) {
            return errorResponse("Invalid Admin Password", 403);
        }

        if (action === 'delete_family') {
            await env.DB.batch([
                env.DB.prepare("DELETE FROM families WHERE id = ?").bind(session.familyId),
                env.DB.prepare("DELETE FROM device_tokens WHERE family_id = ?").bind(session.familyId),
                env.DB.prepare("DELETE FROM recipes WHERE family_id = ?").bind(session.familyId),
                // No shopping list table to delete from
                env.DB.prepare("DELETE FROM meal_plans WHERE family_id = ?").bind(session.familyId),
                env.DB.prepare("DELETE FROM restaurants WHERE family_id = ?").bind(session.familyId),
            ]);
            return jsonResponse({ success: true, deleted: true });
        }

        if (action === 'update_passwords') {
            const { newFamilyPassword, newAdminPassword } = body;
            if (!newFamilyPassword && !newAdminPassword) return errorResponse("No changes requested", 400);

            let newPwHash = family.password_hash;
            let newAdminHash = family.admin_password_hash;

            if (newFamilyPassword) newPwHash = await hashPassword(newFamilyPassword, family.salt);
            if (newAdminPassword) newAdminHash = await hashPassword(newAdminPassword, family.salt);

            await env.DB.prepare("UPDATE families SET password_hash = ?, admin_password_hash = ? WHERE id = ?")
                .bind(newPwHash, newAdminHash, session.familyId).run();
            
            return jsonResponse({ success: true });
        }

        if (action === 'rename_family') {
            const { newFamilyName } = body;
            if (!newFamilyName || newFamilyName.length < 2) return errorResponse("Invalid name", 400);
            
            // Check uniqueness (case-insensitive)
            const exists = await env.DB.prepare("SELECT id FROM families WHERE lower(name) = lower(?)").bind(newFamilyName).first();
            if (exists) return errorResponse("Family name already exists", 409);

            await env.DB.prepare("UPDATE families SET name = ? WHERE id = ?").bind(newFamilyName, session.familyId).run();
            return jsonResponse({ success: true, newName: newFamilyName });
        }

    } catch (e: any) {
        return errorResponse(e.message);
    }

    return errorResponse("Invalid action", 400);
}

// 2. Recipes
async function handleRecipes(request: Request, env: Env, ctx: ExecutionContext) {
    await ensureSchema(env);
    
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const session = await getSession(request, env);
    if (!session) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);
    
    if (request.method === 'GET') {
        const since = url.searchParams.get("since");
        let query = "SELECT data, updated_at, family_id FROM recipes WHERE family_id = ?";
        let params: any[] = [session.familyId];
        
        if (since) {
            query += " AND updated_at > ?";
            params.push(parseInt(since));
        }
        query += " ORDER BY updated_at DESC";
        
        try {
            const { results } = await env.DB.prepare(query).bind(...params).all();
            // Inject the actual family_id from the DB column into the JSON blob
            // This ensures the frontend knows EXACTLY which family this recipe belongs to
            const recipes = results.map((row: any) => {
                const r = JSON.parse(row.data);
                r.familyId = row.family_id; 
                return r;
            });
            return jsonResponse(recipes);
        } catch(e: any) { return errorResponse(e.message); }
    }

    if (request.method === 'POST') {
        try {
            const recipe: any = await request.json();
            const now = Date.now();
            recipe.updatedAt = now;
            delete recipe.deleted;
            
            await env.DB.prepare(
                "INSERT INTO recipes (id, family_id, name, category, is_favorite, is_archived, share_to_family, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, is_favorite=excluded.is_favorite, is_archived=excluded.is_archived, share_to_family=excluded.share_to_family, data=excluded.data, updated_at=excluded.updated_at"
            ).bind(recipe.id, session.familyId, recipe.name, recipe.category, recipe.favorite?1:0, recipe.archived?1:0, 1, JSON.stringify(recipe), now).run();
            return jsonResponse({ success: true, timestamp: now });
        } catch(e: any) { return errorResponse(e.message); }
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        if (!id) return errorResponse("Missing ID", 400);
        
        // Image Deletion Logic
        try {
            const existing = await env.DB.prepare("SELECT data FROM recipes WHERE id = ?").bind(id).first();
            if (existing) {
                const recipeData = JSON.parse(existing.data);
                if (recipeData.image && recipeData.image.includes('/api/images?key=')) {
                    const key = recipeData.image.split('key=')[1];
                    if (key) {
                        // Fire and forget image deletion
                        ctx.waitUntil(env.IMAGES.delete(key));
                    }
                }
            }
        } catch (e) {
            console.error("Image deletion error", e);
        }

        const now = Date.now();
        const tombstone = JSON.stringify({ id, deleted: true, updatedAt: now });
        
        try {
            await env.DB.prepare(
                "INSERT INTO recipes (id, family_id, name, data, updated_at) VALUES (?, ?, 'Deleted', ?, ?) ON CONFLICT(id) DO UPDATE SET name='Deleted', data=excluded.data, updated_at=excluded.updated_at"
            ).bind(id, session.familyId, tombstone, now).run();

            // Cleanup old tombstones scoped to family
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            ctx.waitUntil(
                env.DB.prepare("DELETE FROM recipes WHERE family_id = ? AND name = 'Deleted' AND updated_at < ?").bind(session.familyId, thirtyDaysAgo).run()
            );

            return jsonResponse({ success: true, timestamp: now });
        } catch(e: any) { return errorResponse(e.message); }
    }

    return errorResponse("Method Not Allowed", 405);
}

// 4. Plans
async function handlePlans(request: Request, env: Env) {
    await ensureSchema(env);
    const session = await getSession(request, env);
    if (!session) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);

    if (request.method === 'GET') {
        const { results } = await env.DB.prepare("SELECT data FROM meal_plans WHERE family_id = ?").bind(session.familyId).all();
        const plans = results.map((row: any) => JSON.parse(row.data));
        return jsonResponse(plans);
    }

    if (request.method === 'POST') {
        const plan: any = await request.json();
        await env.DB.prepare(
            "INSERT INTO meal_plans (id, family_id, date, slot, recipe_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
        ).bind(plan.id, session.familyId, plan.date, plan.slot, plan.recipeId, JSON.stringify(plan), Date.now()).run();
        return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        if (!id) return errorResponse("Missing ID", 400);
        await env.DB.prepare("DELETE FROM meal_plans WHERE id = ? AND family_id = ?").bind(id, session.familyId).run();
        return jsonResponse({ success: true });
    }
    return errorResponse("Method Not Allowed", 405);
}

// 5. Restaurants
async function handleRestaurants(request: Request, env: Env) {
    await ensureSchema(env); // Ensure table exists
    const session = await getSession(request, env);
    if (!session) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);

    if (request.method === 'GET') {
        const { results } = await env.DB.prepare("SELECT data FROM restaurants WHERE family_id = ? ORDER BY updated_at DESC").bind(session.familyId).all();
        const list = results.map((row: any) => JSON.parse(row.data));
        return jsonResponse(list);
    }

    if (request.method === 'POST') {
        const r: any = await request.json();
        const now = Date.now();
        r.updatedAt = now;
        await env.DB.prepare(
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
        ).bind(r.id, session.familyId, r.name, JSON.stringify(r.cuisineTags||[]), r.stars||0, r.price||'', r.notes||'', r.goToOrder||'', r.lastVisitedAt||null, JSON.stringify(r), now, r.createdAt||now).run();
        return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
        const id = url.searchParams.get("id");
        if (!id) return errorResponse("Missing ID", 400);
        await env.DB.prepare("DELETE FROM restaurants WHERE id = ? AND family_id = ?").bind(id, session.familyId).run();
        return jsonResponse({ success: true });
    }
    return errorResponse("Method Not Allowed", 405);
}

// 6. Vote Sessions & Votes (Public / Code based)
async function handleVoteSessions(request: Request, env: Env) {
    await ensureSchema(env);
    // No auth check for public voting functionality

    const url = new URL(request.url);

    if (request.method === 'GET') {
        const code = url.searchParams.get('code');
        if (!code) return errorResponse("Missing code", 400);

        const session = await env.DB.prepare("SELECT * FROM vote_sessions WHERE access_code = ? AND active = 1").bind(code.toUpperCase()).first();
        if (!session) return errorResponse("Session not found", 404);

        const { results } = await env.DB.prepare("SELECT * FROM votes WHERE session_id = ?").bind(session.id).all();
        
        return jsonResponse({
            session: { 
                id: session.id, 
                accessCode: session.access_code,
                createdAt: session.created_at, 
                active: session.active === 1,
                snapshot: session.data ? JSON.parse(session.data) : [] 
            },
            votes: results.map((r: any) => ({
                id: r.id, sessionId: r.session_id, restaurantId: r.restaurant_id, deviceId: r.device_id, voteValue: r.vote_value, createdAt: r.created_at
            }))
        });
    }

    if (request.method === 'POST') {
        const body: any = await request.json();
        const now = Date.now();
        const id = crypto.randomUUID();
        // Generate 4-char alpha code
        const code = Math.random().toString(36).substring(2, 6).toUpperCase().replace(/[0-9O]/g, 'X'); // Simple cleanup
        
        // Use provided restaurants snapshot or empty
        const restaurantData = body.restaurants || [];

        await env.DB.prepare(
            "INSERT INTO vote_sessions (id, access_code, data, created_at, active) VALUES (?, ?, ?, ?, 1)"
        ).bind(id, code, JSON.stringify(restaurantData), now).run();
        
        return jsonResponse({ 
            id, 
            accessCode: code,
            createdAt: now, 
            active: true,
            snapshot: restaurantData 
        });
    }
    
    // Deleting a session (closing it) deletes it from DB completely
    if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) return errorResponse("Missing session ID", 400);

        await env.DB.prepare("DELETE FROM votes WHERE session_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM vote_sessions WHERE id = ?").bind(id).run();

        return jsonResponse({ success: true });
    }

    return errorResponse("Method Not Allowed", 405);
}

async function handleVotes(request: Request, env: Env) {
    await ensureSchema(env);
    // Public endpoint for voting

    if (request.method === 'POST') {
        const body: any = await request.json();
        const now = Date.now();
        const id = crypto.randomUUID();
        
        await env.DB.prepare("DELETE FROM votes WHERE session_id = ? AND restaurant_id = ? AND device_id = ?").bind(body.sessionId, body.restaurantId, body.deviceId).run();
        await env.DB.prepare("INSERT INTO votes (id, session_id, restaurant_id, device_id, vote_value, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(id, body.sessionId, body.restaurantId, body.deviceId, body.voteValue, now).run();
        return jsonResponse({ success: true });
    }
    return errorResponse("Method Not Allowed", 405);
}

// 7. Images (Shared Bucket, no strict family segregation on GET for simplicity, but POST requires auth)
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
        Object.entries(corsHeaders).forEach(([k,v]) => headers.set(k, v));
        return new Response(object.body, { headers });
    }

    if (request.method === 'POST') {
        const session = await getSession(request, env);
        if (!session) return errorResponse("Unauthorized", 401);

        const formData = await request.formData();
        const file = formData.get('file');
        if (!file || !(file instanceof File)) return errorResponse("No file uploaded", 400);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(digest));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            let extension = file.name.split('.').pop();
            if (!extension || extension === file.name || extension === 'blob') extension = file.type === 'image/png' ? 'png' : 'jpg';
            const uniqueKey = `${hashHex}.${extension}`;
            
            const existing = await env.IMAGES.head(uniqueKey);
            if (!existing) {
                await env.IMAGES.put(uniqueKey, arrayBuffer, { httpMetadata: { contentType: file.type } });
            }
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

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // New Routes
        if (url.pathname.startsWith('/api/auth')) return handleAuth(request, env);
        if (url.pathname.startsWith('/api/admin')) return handleAdmin(request, env);
        
        // Updated Routes (now use token-based session)
        if (url.pathname.startsWith('/api/recipes')) return handleRecipes(request, env, ctx);
        // Shopping list removed
        if (url.pathname.startsWith('/api/plans')) return handlePlans(request, env);
        if (url.pathname.startsWith('/api/restaurants')) return handleRestaurants(request, env);
        if (url.pathname.startsWith('/api/vote_sessions')) return handleVoteSessions(request, env);
        if (url.pathname.startsWith('/api/votes')) return handleVotes(request, env);
        if (url.pathname.startsWith('/api/images')) return handleImages(request, env);

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
}
