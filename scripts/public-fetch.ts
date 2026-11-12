// Node has no page to fetch relative URLs from; serve them from public/ like the web server does.
import { readFileSync } from "node:fs";

const webFetch = globalThis.fetch;
globalThis.fetch = async (url, init) =>
  typeof url === "string" && !/^\w+:/.test(url) ? new Response(readFileSync(`public/${url}`)) : webFetch(url, init);
