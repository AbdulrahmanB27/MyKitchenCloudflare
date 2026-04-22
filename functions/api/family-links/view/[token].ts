type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const token = context.params.token;
    if (!token) return new Response("Missing token", { status: 400 });

    const link = await context.env.DB.prepare("SELECT * FROM family_links WHERE token = ?").bind(token).first();
    if (!link) return new Response(JSON.stringify({ error: "Invalid link" }), { status: 404 });
    if (link.expires_at < Date.now()) return new Response(JSON.stringify({ error: "Link expired" }), { status: 403 });
    if (link.type !== 'view') return new Response(JSON.stringify({ error: "Invalid link type" }), { status: 400 });

    const family = await context.env.DB.prepare("SELECT id, name FROM families WHERE id = ?").bind(link.family_id).first();
    if (!family) return new Response(JSON.stringify({ error: "Family not found" }), { status: 404 });

    let query = "SELECT data FROM recipes WHERE share_to_family = 1 AND (tenant_id = ? OR data LIKE ?)";
    let params: any[] = [family.id, `%"${family.id}"%`];

    const { results } = await context.env.DB.prepare(query).bind(...params).all();
    
    // We parse and re-stringify to ensure clean JSON without exposing other family internals if we don't want to
    const recipes = results.map((row: any) => JSON.parse(row.data));
    
    return new Response(JSON.stringify({ familyName: family.name, recipes }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
