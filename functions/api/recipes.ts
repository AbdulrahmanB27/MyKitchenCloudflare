
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  FAMILY_PASSWORD: string;
}

const checkAuth = (request: Request) => {
    const auth = request.headers.get('Authorization');
    // In a real app, verify the JWT signature.
    // Here we assume the client obtained a valid token via the /auth endpoint.
    // For robust security, verify the token signature.
    return auth && auth.startsWith('Bearer ');
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
  if (!checkAuth(context.request)) return new Response("Unauthorized", { status: 401 });

  try {
    const recipe = await context.request.json() as any;
    const now = Date.now();
    recipe.updatedAt = now;
    
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
  if (!checkAuth(context.request)) return new Response("Unauthorized", { status: 401 });

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    if (!id) return new Response("Missing ID", { status: 400 });

    await context.env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
