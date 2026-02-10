
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
    const { password, turnstileToken } = await context.request.json() as any;

    if (!context.env.FAMILY_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Server misconfigured: FAMILY_PASSWORD missing' }), { status: 500 });
    }
    
    // 1. Validate Turnstile (Production only)
    if (context.env.TURNSTILE_SECRET && turnstileToken) {
        const ip = context.request.headers.get('CF-Connecting-IP');
        const formData = new FormData();
        formData.append('secret', context.env.TURNSTILE_SECRET);
        formData.append('response', turnstileToken);
        formData.append('remoteip', ip || '');
    
        const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const result = await fetch(url, { body: formData, method: 'POST' });
        const outcome = await result.json() as any;
        
        if (!outcome.success) {
           return new Response(JSON.stringify({ error: 'Turnstile verification failed' }), { status: 403 });
        }
    }

    // 2. Validate Password & Generate Signed Token
    if (password === context.env.FAMILY_PASSWORD) {
        // Token expires in 30 days
        const payload = { 
            sub: 'family_member', 
            exp: Date.now() + (1000 * 60 * 60 * 24 * 30) 
        };
        const token = await signToken(payload, context.env.FAMILY_PASSWORD);
        return new Response(JSON.stringify({ token, success: true }));
    } else {
        return new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 });
    }

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
