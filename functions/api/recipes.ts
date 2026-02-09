
// Placeholder types for Cloudflare environment
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT data FROM recipes ORDER BY updated_at DESC"
    ).all();
    
    // Parse the JSON string back into objects
    const recipes = results.map((row: any) => JSON.parse(row.data));
    return new Response(JSON.stringify(recipes), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const recipe = await context.request.json() as any;
    const now = Date.now();
    recipe.updatedAt = now;
    
    await context.env.DB.prepare(
      "INSERT INTO recipes (id, name, category, is_favorite, is_archived, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, is_favorite=excluded.is_favorite, is_archived=excluded.is_archived, data=excluded.data, updated_at=excluded.updated_at"
    ).bind(
      recipe.id, 
      recipe.name, 
      recipe.category, 
      recipe.favorite ? 1 : 0, 
      recipe.archived ? 1 : 0, 
      JSON.stringify(recipe), 
      now
    ).run();

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
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
