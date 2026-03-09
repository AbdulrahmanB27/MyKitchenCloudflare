
type PagesFunction<T = any> = (context: { request: Request; env: T; next: () => Promise<Response>; [key: string]: any }) => Promise<Response>;

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

export const onRequest: PagesFunction = async (context) => {
  // Simple Rate Limiting
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const userData = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - userData.lastReset > RATE_LIMIT_WINDOW) {
    userData.count = 1;
    userData.lastReset = now;
  } else {
    userData.count++;
  }
  rateLimitMap.set(ip, userData);

  if (userData.count > MAX_REQUESTS) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Ensure DB schema exists (resilience for dev/preview)
  if (context.env.DB) {
      try {
          await context.env.DB.batch([
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, name TEXT UNIQUE, password_hash TEXT, admin_password_hash TEXT, salt TEXT, created_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_tokens (token TEXT PRIMARY KEY, family_id TEXT, created_at INTEGER, last_used_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, family_id TEXT, name TEXT, category TEXT, is_favorite INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, share_to_family INTEGER DEFAULT 1, tenant_id TEXT DEFAULT 'global', data TEXT, updated_at INTEGER, created_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS meal_plans (id TEXT PRIMARY KEY, family_id TEXT, date TEXT, slot TEXT, recipe_id TEXT, data TEXT, updated_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS restaurants (id TEXT PRIMARY KEY, family_id TEXT, name TEXT, cuisine_tags TEXT, stars INTEGER DEFAULT 0, price TEXT, notes TEXT, go_to_order TEXT, last_visited_at INTEGER, data TEXT, updated_at INTEGER, created_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS shopping_list (id TEXT PRIMARY KEY, family_id TEXT, data TEXT, updated_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS vote_sessions (id TEXT PRIMARY KEY, family_id TEXT, access_code TEXT, data TEXT, created_at INTEGER, ended_at INTEGER, active INTEGER DEFAULT 1)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS votes (id TEXT PRIMARY KEY, session_id TEXT, restaurant_id TEXT, device_id TEXT, vote_value INTEGER, created_at INTEGER)`),
            context.env.DB.prepare(`CREATE TABLE IF NOT EXISTS recipe_share_links (token TEXT PRIMARY KEY, family_id TEXT, recipe_id TEXT, created_at INTEGER, revoked_at INTEGER)`)
          ]);
      } catch (e) {
          // Ignore errors (e.g. if tables already exist or concurrent creation)
          console.warn("Middleware schema init warning:", e);
      }
  }

  try {
    const response = await context.next();
    // Clone response to ensure it's mutable
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    return newResponse;
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "Middleware Error" }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
};
