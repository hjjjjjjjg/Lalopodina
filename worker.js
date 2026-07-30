/**
 * Cloudflare Worker API for V1 & V2 Verification
 * KV Namespace Binding Name: TOKEN_DB
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Headers (Testing UI-র জন্য)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-V1, X-V2',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. POST /api/v1 (ভিডিও ইউআরএল ও স্ট্রিম কি দিয়ে V1 তৈরি - No Expiry)
      if (path === '/api/v1' && method === 'POST') {
        const { video_url, stream_key } = await request.json();
        if (!video_url || !stream_key) {
          return jsonResponse({ error: "Missing video_url or stream_key" }, 400, corsHeaders);
        }

        // V1 স্থায়ীভাবে ডেটা হোল্ড করবে (কখনোই এক্সপায়ার হবে না)
        const v1 = btoa(JSON.stringify({ video_url, stream_key }));
        return jsonResponse({ success: true, v1: v1 }, 200, corsHeaders);
      }

      // 2. POST /api/v2 (এক ক্লিকে V2 তৈরি - One-Time & 5 Min Validity)
      if (path === '/api/v2' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const project_id = body.project_id || "default_project";

        const timestamp = Date.now();
        const salt = crypto.randomUUID();
        
        // V2 Hash জেনারেট
        const rawText = `${project_id}:${timestamp}:${salt}`;
        const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawText));
        const v2 = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Cloudflare KV-তে V2 তথ্য সেভ (300 সেকেন্ড বা 5 মিনিট পর অটোমেটিক ডিলিট)
        const v2Data = { project_id, timestamp, used: false, active: true };
        await env.TOKEN_DB.put(`v2:${v2}`, JSON.stringify(v2Data), { expirationTtl: 300 });

        return jsonResponse({ success: true, v2: v2 }, 200, corsHeaders);
      }

      // 3. GET /api/run (Docker/Railway থেকে যাচাই করার এন্ডপয়েন্ট)
      if (path === '/api/run' && method === 'GET') {
        const v1 = request.headers.get('X-V1');
        const v2 = request.headers.get('X-V2');

        if (!v1 || !v2) return textResponse("exit 1", 403);

        // V1 Decode
        let decodedV1;
        try {
          decodedV1 = JSON.parse(atob(v1));
        } catch (e) {
          return textResponse("exit 1", 403);
        }

        // V2 Check in Cloudflare KV
        const v2RecordRaw = await env.TOKEN_DB.get(`v2:${v2}`);
        if (!v2RecordRaw) {
          // V2 পাওয়া যায়নি অথবা ৫ মিনিট পার হয়ে Expire হয়ে গেছে
          return textResponse("exit 1", 403);
        }

        const v2Data = JSON.parse(v2RecordRaw);

        // V2 কি আগে একবার ব্যবহার হয়ে গেছে? (Single Use Protection)
        if (v2Data.used || !v2Data.active) {
          return textResponse("exit 1", 403);
        }

        // V2 ব্যবহার করে ফেলা হলো, তাই Instant 'used = true' মার্ক করা হচ্ছে
        v2Data.used = true;
        await env.TOKEN_DB.put(`v2:${v2}`, JSON.stringify(v2Data), { expirationTtl: 300 });

        // সব ঠিক থাকলে ডকারের জন্য কমান্ড রিটার্ন করবে
        const runCommand = `export VIDEO_URL="${decodedV1.video_url}" STREAM_KEY="${decodedV1.stream_key}" && bash start.sh`;
        return textResponse(runCommand, 200);
      }

      return textResponse("exit 1", 404);

    } catch (err) {
      return textResponse("exit 1", 500);
    }
  }
};

// Helper Functions
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain' }
  });
}
