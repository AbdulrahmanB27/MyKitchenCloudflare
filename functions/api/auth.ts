
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  FAMILY_PASSWORD: string;
  TURNSTILE_SECRET: string;
}

async function signToken(payload: any, secret: string) {
    const encoder = new TextEncoder();
    const data = btoa(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${data}.${signatureB64}`;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle CORS Preflight
  if (context.request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
  }

  // Enforce POST
  if (context.request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    let body;
    try {
        body = await context.request.json() as any;
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), { status: 400, headers: corsHeaders });
    }

    const password = (body.password || '').trim();
    const turnstileToken = body.turnstileToken;
    const envPassword = (context.env.FAMILY_PASSWORD || '').trim();

    if (!envPassword) {
        return new Response(JSON.stringify({ error: 'Server misconfigured: FAMILY_PASSWORD missing' }), { status: 500, headers: corsHeaders });
    }
    
    // 1. Validate Turnstile
    if (context.env.TURNSTILE_SECRET) {
        if (!turnstileToken) {
            return new Response(JSON.stringify({ error: 'Verification token missing' }), { status: 400, headers: corsHeaders });
        }

        const ip = context.request.headers.get('CF-Connecting-IP');
        const formData = new FormData();
        formData.append('secret', context.env.TURNSTILE_SECRET);
        formData.append('response', turnstileToken);
        formData.append('remoteip', ip || '');
    
        try {
            const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
            const result = await fetch(url, { body: formData, method: 'POST' });
            const outcome = await result.json() as any;
            
            if (!outcome.success) {
               console.error('Turnstile verification failed', outcome);
               return new Response(JSON.stringify({ error: 'Security check failed. Please refresh.' }), { status: 403, headers: corsHeaders });
            }
        } catch (e) {
            console.error('Turnstile fetch error', e);
            return new Response(JSON.stringify({ error: 'Could not verify security token' }), { status: 500, headers: corsHeaders });
        }
    }

    // 2. Validate Password
    if (password === envPassword) {
        const payload = { 
            sub: 'family_member', 
            // Set expiration to 100 years from now (effectively never)
            exp: Date.now() + (1000 * 60 * 60 * 24 * 365 * 100) 
        };
        const token = await signToken(payload, envPassword);
        return new Response(JSON.stringify({ token, success: true }), { 
            headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
    } else {
        return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401, headers: corsHeaders });
    }

  } catch (e: any) {
    return new Response(JSON.stringify({ error: `Server Error: ${e.message}` }), { status: 500, headers: corsHeaders });
  }
};
