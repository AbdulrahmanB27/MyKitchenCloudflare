type D1Database = any;
type PagesFunction<T = any> = (context: { request: Request; env: T; [key: string]: any }) => Promise<Response>;

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const checkAuth = async (request: Request, secret: string) => {
    const auth = request.headers.get('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) return null;
    
    const token = auth.split(' ')[1];
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) return null;

    try {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
        
        if (!valid) return null;

        const payload = JSON.parse(atob(payloadB64));
        if (payload.exp < Date.now()) return null;

        return payload;
    } catch (e) {
        return null;
    }
};

async function hashPassword(password: string, salt: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
    const jwtSecret = (context.env.JWT_SECRET || '').trim();
    const payload = await checkAuth(context.request, jwtSecret);
    
    if (!payload) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });

    try {
        const body: any = await context.request.json();
        const { action, adminPassword } = body; 

        // Verify Admin Password
        const family = await context.env.DB.prepare("SELECT * FROM families WHERE id = ?").bind(payload.familyId).first();
        if (!family) return new Response(JSON.stringify({ error: "Family not found" }), { status: 404, headers: { "Content-Type": "application/json" } });

        const adminHashCheck = await hashPassword(adminPassword, family.salt);
        if (adminHashCheck !== family.admin_password_hash) {
            return new Response(JSON.stringify({ error: "Invalid Admin Password" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }

        if (action === 'delete_family') {
            await context.env.DB.batch([
                context.env.DB.prepare("DELETE FROM families WHERE id = ?").bind(payload.familyId),
                context.env.DB.prepare("DELETE FROM recipes WHERE family_id = ? OR tenant_id = ?").bind(payload.familyId, payload.familyId),
                context.env.DB.prepare("DELETE FROM meal_plans WHERE family_id = ?").bind(payload.familyId),
                context.env.DB.prepare("DELETE FROM restaurants WHERE family_id = ?").bind(payload.familyId)
            ]);
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (action === 'rename_family') {
            const { newFamilyName } = body;
            if (!newFamilyName) return new Response(JSON.stringify({ error: "No new name provided" }), { status: 400, headers: { "Content-Type": "application/json" } });
            await context.env.DB.prepare("UPDATE families SET name = ? WHERE id = ?").bind(newFamilyName, payload.familyId).run();
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        if (action === 'update_passwords') {
            const { newFamilyPassword, newAdminPassword } = body;
            if (!newFamilyPassword && !newAdminPassword) return new Response(JSON.stringify({ error: "No changes requested" }), { status: 400, headers: { "Content-Type": "application/json" } });

            let newPwHash = family.password_hash;
            let newAdminHash = family.admin_password_hash;

            if (newFamilyPassword) newPwHash = await hashPassword(newFamilyPassword, family.salt);
            if (newAdminPassword) newAdminHash = await hashPassword(newAdminPassword, family.salt);

            await context.env.DB.prepare("UPDATE families SET password_hash = ?, admin_password_hash = ? WHERE id = ?")
                .bind(newPwHash, newAdminHash, payload.familyId).run();
            
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { "Content-Type": "application/json" } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
};
