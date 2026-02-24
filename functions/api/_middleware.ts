
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

export const onRequest: PagesFunction = async (context) => {
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
