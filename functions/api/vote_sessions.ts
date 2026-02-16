
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
    try {
        const url = new URL(context.request.url);
        const code = url.searchParams.get('code');

        if (!code) return new Response(JSON.stringify({ error: "Missing code" }), { status: 400 });

        // Get session by code
        const sessionRes = await context.env.DB.prepare("SELECT * FROM vote_sessions_v2 WHERE access_code = ? AND active = 1").bind(code.toUpperCase()).first();
        
        if (!sessionRes) return new Response(JSON.stringify(null), { headers: { "Content-Type": "application/json" } });

        // Parse data blob (contains restaurants snapshot and mode)
        let sessionData: any = {};
        try {
            sessionData = JSON.parse(sessionRes.data || '{}');
        } catch (e) {
            // ignore
        }

        // Get votes for this session
        const { results } = await context.env.DB.prepare("SELECT * FROM votes_v2 WHERE session_id = ?").bind(sessionRes.id).all();

        return new Response(JSON.stringify({
            session: {
                id: sessionRes.id,
                accessCode: sessionRes.access_code,
                createdAt: sessionRes.created_at,
                active: sessionRes.active === 1,
                mode: sessionData.mode || 'list',
                snapshot: sessionData.restaurants || [] // Ensure this matches front-end expectation
            },
            votes: results.map((r: any) => ({
                id: r.id,
                sessionId: r.session_id,
                restaurantId: r.restaurant_id,
                deviceId: r.device_id,
                voteValue: r.vote_value,
                createdAt: r.created_at
            })),
            restaurants: sessionData.restaurants || [] // Pass explicitly as top level too if needed by joinSession return type
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
        // Generate 4-char alpha code
        const code = Math.random().toString(36).substring(2, 6).toUpperCase().replace(/[0-9O]/g, 'X'); // Simple cleanup

        const payload = {
            restaurants: body.restaurants || [],
            mode: body.mode || 'list'
        };

        await context.env.DB.prepare(
            "INSERT INTO vote_sessions_v2 (id, access_code, data, created_at, active) VALUES (?, ?, ?, ?, 1)"
        ).bind(id, code, JSON.stringify(payload), now).run();

        return new Response(JSON.stringify({ 
            id, 
            accessCode: code,
            createdAt: now, 
            active: true,
            mode: payload.mode,
            snapshot: payload.restaurants
        }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
