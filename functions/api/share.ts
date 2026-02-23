
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
        return new Response("Missing ID", { status: 400 });
    }

    // Fetch the recipe by ID. 
    // We don't check for auth here, relying on the UUID being secret enough for a "shared link".
    // We also don't check share_to_family because a user might want to share a private recipe via link.
    const result = await context.env.DB.prepare("SELECT data FROM recipes WHERE id = ?").bind(id).first();

    if (!result) {
        return new Response("Recipe not found", { status: 404 });
    }

    const recipe = JSON.parse(result.data);
    
    // Sanitize if needed (remove internal flags if any)
    // For now, just return the data.

    return new Response(JSON.stringify(recipe), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const recipe = await context.request.json() as any;
    const now = Date.now();
    
    // Insert into DB. We set share_to_family = 0 so it doesn't appear in the global sync list.
    // We treat this as a "public" upload accessible only by ID.
    await context.env.DB.prepare(
      "INSERT INTO recipes (id, name, category, is_favorite, is_archived, share_to_family, tenant_id, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, data=excluded.data, updated_at=excluded.updated_at"
    ).bind(
      recipe.id, 
      recipe.name, 
      recipe.category, 
      0, // is_favorite (not relevant for public view)
      0, // is_archived
      0, // share_to_family (0 = hidden from list, accessible by ID)
      'public', // tenant_id
      JSON.stringify(recipe), 
      now
    ).run();

    return new Response(JSON.stringify({ success: true, id: recipe.id }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
