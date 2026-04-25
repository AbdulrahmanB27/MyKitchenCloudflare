
type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
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

async function hashPassword(password: string, salt: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

    const familyName = (body.familyName || '').trim();
    const password = (body.password || '').trim();
    const adminPassword = (body.adminPassword || '').trim();
    const turnstileToken = body.turnstileToken;
    const jwtSecret = (context.env.JWT_SECRET || '').trim();

    if (!jwtSecret) {
        return new Response(JSON.stringify({ error: 'Server misconfigured: JWT_SECRET missing' }), { status: 500, headers: corsHeaders });
    }

    if (!familyName || !password || !adminPassword) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
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

    // 2. Check if family exists
    const existing = await context.env.DB.prepare("SELECT id FROM families WHERE name = ?").bind(familyName).first();
    if (existing) {
        return new Response(JSON.stringify({ error: 'Family name already taken' }), { status: 409, headers: corsHeaders });
    }

    // 3. Create Family
    const familyId = crypto.randomUUID();
    const salt = crypto.randomUUID();
    const passwordHash = await hashPassword(password, salt);
    const adminPasswordHash = await hashPassword(adminPassword, salt);
    const now = Date.now();

    await context.env.DB.prepare(
        "INSERT INTO families (id, name, password_hash, admin_password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(familyId, familyName, passwordHash, adminPasswordHash, salt, now).run();

    // 4. Sign Token
    const payload = { 
        sub: 'family_member',
        familyId: familyId,
        familyName: familyName,
        isAdmin: true,
        // Set expiration to 100 years from now (effectively never)
        exp: Date.now() + (1000 * 60 * 60 * 24 * 365 * 100) 
    };
    const token = await signToken(payload, jwtSecret);
    
    return new Response(JSON.stringify({ token, success: true, familyId: familyId, name: familyName, isAdmin: true }), { 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: `Server Error: ${e.message}` }), { status: 500, headers: corsHeaders });
  }
};
