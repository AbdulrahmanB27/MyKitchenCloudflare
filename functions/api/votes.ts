
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    try {
        const body = await context.request.json() as any;
        const now = Date.now();
        const id = crypto.randomUUID();

        // Upsert vote for this user/session/restaurant combination
        // Actually, schema uses ID primary key, so we need to check if user already voted for this item in this session
        // For simplicity, we just insert. The frontend should handle state. 
        // Or we can delete previous vote from this device for this rest/session.

        await context.env.DB.prepare(
            "DELETE FROM votes WHERE session_id = ? AND restaurant_id = ? AND device_id = ?"
        ).bind(body.sessionId, body.restaurantId, body.deviceId).run();

        await context.env.DB.prepare(
            "INSERT INTO votes (id, session_id, restaurant_id, device_id, vote_value, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(id, body.sessionId, body.restaurantId, body.deviceId, body.voteValue, now).run();

        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });

    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
