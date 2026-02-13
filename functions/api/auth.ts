
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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    let body;
    try {
        body = await context.request.json() as any;
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), { status: 400 });
    }

    // We still trim to remove accidental leading/trailing spaces from copy-pasting
    const password = (body.password || '').trim();
    const turnstileToken = body.turnstileToken;

    const envPassword = (context.env.FAMILY_PASSWORD || '').trim();

    if (!envPassword) {
        return new Response(JSON.stringify({ error: 'Server misconfigured: FAMILY_PASSWORD missing' }), { status: 500 });
    }
    
    // 1. Validate Turnstile
    // If TURNSTILE_SECRET is set, we ENFORCE it. 
    if (context.env.TURNSTILE_SECRET) {
        if (!turnstileToken) {
            return new Response(JSON.stringify({ error: 'Verification token missing' }), { status: 400 });
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
               return new Response(JSON.stringify({ error: 'Security check failed. Please refresh.' }), { status: 403 });
            }
        } catch (e) {
            console.error('Turnstile fetch error', e);
            // Fail open or closed? Safest to fail closed if we can't verify.
            return new Response(JSON.stringify({ error: 'Could not verify security token' }), { status: 500 });
        }
    }

    // 2. Validate Password (Case-Sensitive Strict Match)
    if (password === envPassword) {
        // Token expires in 30 days
        const payload = { 
            sub: 'family_member', 
            exp: Date.now() + (1000 * 60 * 60 * 24 * 30) 
        };
        const token = await signToken(payload, envPassword);
        return new Response(JSON.stringify({ token, success: true }));
    } else {
        return new Response(JSON.stringify({ error: 'Incorrect password' }), { status: 401 });
    }

  } catch (e: any) {
    return new Response(JSON.stringify({ error: `Server Error: ${e.message}` }), { status: 500 });
  }
};
