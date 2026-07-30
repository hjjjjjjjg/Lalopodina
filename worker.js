export default {
  async fetch(request) {

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/v1") {

      const body = await request.json();

      const token = btoa(JSON.stringify({
        v: body.video_url,
        s: body.stream_key,
        t: Date.now()
      }));

      return Response.json({
        token
      });

    }

    if (request.method === "POST" && url.pathname === "/api/v2") {

      const body = await request.json();

      const token = crypto.randomUUID().replace(/-/g, "") +
                    Date.now().toString(16);

      return Response.json({
        token
      });

    }

    if (request.method === "GET" && url.pathname === "/api/run") {

      const v1 = request.headers.get("X-V1");
      const v2 = request.headers.get("X-V2");

      if (!v1 || !v2) {

        return new Response("DENIED", {
          status: 403
        });

      }

      let media;

      try {

        media = JSON.parse(atob(v1));

      } catch {

        return new Response("INVALID", {
          status: 401
        });

      }

      return new Response(`
export VIDEO_URL="${media.v}"
export STREAM_KEY="${media.s}"

git clone https://YOUR_GITHUB_PAT@github.com/YOUR_PRIVATE_USER/YOUR_PRIVATE_REPO.git /tmp/app

cd /tmp/app

chmod +x start.sh

exec ./start.sh
`, {
        headers: {
          "Content-Type": "text/plain"
        }
      });

    }

    return new Response("Not Found", {
      status: 404
    });

  }
}
