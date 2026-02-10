
type Env = {
  IMAGES: any; // R2Bucket
  FAMILY_PASSWORD: string;
}

const checkAuth = async (request: Request, secret: string) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return false;
    const token = auth.split(' ')[1];
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return false;
    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        if (!valid) return false;
        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) return false;
        return true;
    } catch (e) { return false; }
};

// GET: Serve images
// Usage: /api/images?key=filename.jpg
export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const key = url.searchParams.get('key');

  if (!key) return new Response('Missing key', { status: 400 });

  const object = await context.env.IMAGES.get(key);

  if (!object) {
    return new Response('Image not found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Cache for 1 year
  headers.set('Cache-Control', 'public, max-age=31536000');

  return new Response(object.body, {
    headers,
  });
};

// POST: Upload images
export const onRequestPost = async (context: any) => {
  const authorized = await checkAuth(context.request, context.env.FAMILY_PASSWORD);
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  try {
    const formData = await context.request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response("No file uploaded", { status: 400 });
    }

    // Generate unique ID
    const extension = file.name.split('.').pop();
    const uniqueKey = `${crypto.randomUUID()}.${extension}`;

    await context.env.IMAGES.put(uniqueKey, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      }
    });

    // Return the relative URL to our GET endpoint
    const imageUrl = `/api/images?key=${uniqueKey}`;

    return new Response(JSON.stringify({ url: imageUrl }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
