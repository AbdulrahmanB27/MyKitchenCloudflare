
// Placeholder types for Cloudflare environment
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { results } = await context.env.DB.prepare("SELECT data FROM shopping_list").all();
    const items = results.map((row: any) => JSON.parse(row.data));
    return new Response(JSON.stringify(items), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const item = await context.request.json() as any;
    await context.env.DB.prepare(
      "INSERT INTO shopping_list (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at"
    ).bind(item.id, JSON.stringify(item), Date.now()).run();
    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");
    const clearAll = url.searchParams.get("clearAll");

    if (clearAll === "true") {
        await context.env.DB.prepare("DELETE FROM shopping_list").run();
    } else if (clearAll === "checked") {
        // We need to fetch all, filter, and delete. 
        // In a real app, we'd store 'checked' as a column. For this JSON blob approach:
        const { results } = await context.env.DB.prepare("SELECT id, data FROM shopping_list").all();
        const idsToDelete = results
            .filter((row: any) => JSON.parse(row.data).isChecked)
            .map((row: any) => row.id);
        
        if (idsToDelete.length > 0) {
            // Batch delete
            const placeholders = idsToDelete.map(() => '?').join(',');
            await context.env.DB.prepare(`DELETE FROM shopping_list WHERE id IN (${placeholders})`)
                .bind(...idsToDelete)
                .run();
        }
    } else if (id) {
        await context.env.DB.prepare("DELETE FROM shopping_list WHERE id = ?").bind(id).run();
    }
    
    return new Response(JSON.stringify({ success: true }));
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
