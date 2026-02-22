
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
