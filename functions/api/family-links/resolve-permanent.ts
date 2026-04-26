type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body: any = await context.request.json();
    const token = body.token;
    if (!token) return new Response("Missing token", { status: 400 });

    const link = await context.env.DB.prepare("SELECT * FROM family_links WHERE token = ?").bind(token).first();
    if (!link) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
    if (link.type !== 'permanent') return new Response(JSON.stringify({ error: "Invalid link type" }), { status: 400 });

    const family = await context.env.DB.prepare("SELECT id, name FROM families WHERE id = ?").bind(link.family_id).first();
    if (!family) return new Response(JSON.stringify({ error: "Family not found" }), { status: 404 });

    // We do NOT issue a JWT. We just return the family name so the client can prompt for the password.
    return new Response(JSON.stringify({ success: true, familyName: family.name }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
