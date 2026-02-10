
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  FAMILY_PASSWORD: string;
  TURNSTILE_SECRET: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { password, turnstileToken } = await context.request.json() as any;
    
    // 1. Validate Turnstile
    if (context.env.TURNSTILE_SECRET) { // Only check if secret is set (prod)
        const ip = context.request.headers.get('CF-Connecting-IP');
        const formData = new FormData();
        formData.append('secret', context.env.TURNSTILE_SECRET);
        formData.append('response', turnstileToken);
        formData.append('remoteip', ip || '');
    
        const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const result = await fetch(url, {
          body: formData,
          method: 'POST',
        });
    
        const outcome = await result.json() as any;
        if (!outcome.success) {
           return new Response(JSON.stringify({ error: 'Turnstile verification failed' }), { status: 403 });
        }
    }

    // 2. Validate Password
    if (password === context.env.FAMILY_PASSWORD) {
        // Issue a simple token (in a real app, use JWT signed with a secret)
        // For simplicity here, we assume the client holds this "token" and sends it back.
        // We can just return a simple hash or static token if we trust the password check.
        // Better: Return a signed token.
        const token = btoa(`authorized:${Date.now()}`); // Simple weak token for demo
        return new Response(JSON.stringify({ token, success: true }));
    } else {
        return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 });
    }

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};