
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; params: any; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const recipeId = url.searchParams.get("recipeId");
    const token = url.searchParams.get("token");

    if (!recipeId || !token) {
        return new Response("Missing recipeId or token", { status: 400 });
    }

    // 1. Validate token
    const share = await context.env.DB.prepare(
        "SELECT * FROM recipe_share_links WHERE token = ? AND recipe_id = ? AND revoked_at IS NULL"
    ).bind(token, recipeId).first();

    if (!share) {
        console.error(`Share link not found or revoked: token=${token}, recipeId=${recipeId}`);
        return new Response(JSON.stringify({ error: "Invalid or revoked share link" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    // 2. Fetch recipe
    const recipe = await context.env.DB.prepare(
        "SELECT data FROM recipes WHERE id = ?"
    ).bind(recipeId).first();

    if (!recipe) {
        console.error(`Recipe not found for share link: recipeId=${recipeId}`);
        return new Response(JSON.stringify({ error: "Recipe not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const recipeData = JSON.parse(recipe.data);

    // 3. Return recipe (view-only)
    return new Response(JSON.stringify(recipeData), { headers: { "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
