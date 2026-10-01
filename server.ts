import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { getPlatformProxy } from "wrangler";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Wrangler Cloudflare bindings (D1 Database, R2, etc.)
  let proxyEnv: any = null;
  try {
    const proxy = await getPlatformProxy();
    proxyEnv = proxy.env;
  } catch (err) {
    console.warn("Failed to initialize Wrangler platform proxy:", err);
  }

  let workerModule: any;
  try {
    workerModule = await import("./worker");
  } catch (err) {
    console.error("Failed to import worker module:", err);
  }
  const worker = workerModule ? (workerModule.default || workerModule) : null;

  // Handle API routes via worker.ts
  app.use("/api", async (req, res) => {
    if (!worker) {
      res.status(500).json({ error: "Worker backend non-functional" });
      return;
    }

    try {
      const protocol = req.protocol || "http";
      const host = req.get("host") || `localhost:${PORT}`;
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;

      let bodyBuffer: Buffer | undefined = undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        if (chunks.length > 0) {
          bodyBuffer = Buffer.concat(chunks);
        }
      }

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val) {
          if (Array.isArray(val)) {
            val.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, val);
          }
        }
      }

      const webReq = new Request(fullUrl, {
        method: req.method,
        headers,
        body: bodyBuffer && bodyBuffer.length > 0 ? (bodyBuffer as any) : undefined,
        // @ts-ignore
        duplex: 'half'
      });

      const webRes = await worker.fetch(webReq, proxyEnv || {});

      res.status(webRes.status);
      webRes.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "transfer-encoding") {
          res.setHeader(key, value);
        }
      });

      const arrayBuffer = await webRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error("API Error in Express bridge:", err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
