import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Mirror the Pages project subpath, rather than testing only at the origin root.
export const prefix = "/play-the-suryavanshi/";
export function serve() {
  return http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/" || pathname === prefix.slice(0,-1)) { res.writeHead(302, {Location: prefix}); res.end(); return; }
    const name = pathname.slice(prefix.length) || "index.html";
    if (!pathname.startsWith(prefix) || !/^[\w-]+\.(?:html|css|js)$/.test(name)) {res.writeHead(404); res.end(); return;}
    try {
      const data = await readFile(fileURLToPath(new URL(`../site/${name}`, import.meta.url)));
      res.writeHead(200, {"Content-Type": {"css":"text/css","js":"text/javascript","html":"text/html; charset=utf-8"}[name.split(".").at(-1)]}); res.end(data);
    } catch (error) {
      if (error.code !== "ENOENT") process.stderr.write(`${error.message}\n`);
      res.writeHead(error.code === "ENOENT" ? 404 : 500); res.end();
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  serve().listen(port,"127.0.0.1",()=>process.stdout.write(`Walk out to bat: http://127.0.0.1:${port}${prefix}\n`));
}
