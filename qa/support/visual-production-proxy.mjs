import { createServer } from "node:https";
import { request } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REF !== "refs/heads/visual-polish/premium" ||
    !process.env.LOCALAPPDATA || process.env.LOCALAPPDATA !== process.env.RUNNER_TEMP) {
  throw new Error("HTTPS proxy requires the disposable visual fixture runner.");
}
const dir = join(process.env.LOCALAPPDATA, "MadrastyBuild/qa-supabase/visual-tls");
const host = "127.0.0.1:4443";
const server = createServer({
  key: readFileSync(join(dir, "web.key")),
  cert: readFileSync(join(dir, "web.crt")),
}, (incoming, outgoing) => {
  if (incoming.headers.host !== host || !incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
    outgoing.writeHead(400).end(); return;
  }
  const headers = { ...incoming.headers, host, "x-forwarded-host": host, "x-forwarded-proto": "https", "x-forwarded-port": "4443" };
  const upstream = request({ hostname: "127.0.0.1", port: 4300, path: incoming.url,
    method: incoming.method, headers }, response => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
});
server.on("clientError", (_, socket) => socket.destroy());
server.listen(4443, "127.0.0.1");
