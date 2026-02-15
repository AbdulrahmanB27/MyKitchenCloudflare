
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        // Get active session
        const sessionRes = await context.env.DB.prepare("SELECT * FROM vote_sessions WHERE active = 1 ORDER BY created_at DESC LIMIT 1").first();
        
        if (!sessionRes) return new Response(JSON.stringify(null), { headers: { "Content-Type": "application/json" } });

        // Get votes for this session
        const { results } = await context.env.DB.prepare("SELECT * FROM votes WHERE session_id = ?").bind(sessionRes.id).all();

        return new Response(JSON.stringify({
            session: {
                id: sessionRes.id,
                familyId: sessionRes.family_id,
                createdAt: sessionRes.created_at,
                createdByDeviceId: sessionRes.created_by_device_id,
                active: sessionRes.active === 1
            },
            votes: results.map((r: any) => ({
                id: r.id,
                sessionId: r.session_id,
                restaurantId: r.restaurant_id,
                deviceId: r.device_id,
                voteValue: r.vote_value,
                createdAt: r.created_at
            }))
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body = await context.request.json() as any;
        const now = Date.now();
        const id = crypto.randomUUID();

        // Close any existing sessions first
        await context.env.DB.prepare("UPDATE vote_sessions SET active = 0 WHERE active = 1").run();

        // Create new
        await context.env.DB.prepare(
            "INSERT INTO vote_sessions (id, family_id, created_at, created_by_device_id, active) VALUES (?, ?, ?, ?, 1)"
        ).bind(id, 'global', now, body.deviceId || 'unknown').run();

        return new Response(JSON.stringify({ 
            id, 
            familyId: 'global', 
            createdAt: now, 
            createdByDeviceId: body.deviceId, 
            active: true 
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
