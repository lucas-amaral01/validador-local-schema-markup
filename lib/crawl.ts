import { load } from "cheerio";
import { inspectMarkup } from "./schema";
import type { PageResult, ScanResult } from "./types";

export const PAGE_LIMIT = 50;
const SITEMAP_LIMIT = 10;
const BODY_LIMIT = 3 * 1024 * 1024;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function localUrl(input: string) {
  const text = input.trim();
  if (!text || text.length > 2048) throw new Error("Informe uma URL local válida.");
  const url = new URL(/^https?:\/\//i.test(text) ? text : `http://${text}`);
  if (!["http:", "https:"].includes(url.protocol) || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error("Use um endereço local, como http://localhost:3000/99pay.");
  }
  if (/%(?:2f|5c|25)/i.test(url.pathname)) throw new Error("O caminho contém uma barra codificada.");
  url.hash = "";
  return url;
}

function pathKey(url: URL) {
  return url.pathname.replace(/\/+$/, "") || "/";
}

async function readLocal(
  url: URL, accept: (url: URL) => boolean, signal: AbortSignal, kind: "html" | "xml",
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(6500)]);
  for (let hops = 0; hops < 6; hops++) {
    if (!accept(url)) throw new Error("O redirecionamento saiu do escopo da análise.");
    const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: deadline });
    const location = response.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      await response.body?.cancel();
      url = localUrl(new URL(location, url).href);
      continue;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const supported = kind === "html" ? /text\/html|application\/xhtml\+xml/i : /xml|text\/plain/i;
    if (!response.ok || !supported.test(contentType) || !response.body) {
      await response.body?.cancel();
      if (!response.ok) throw new Error(`A página retornou HTTP ${response.status}.`);
      throw new Error(kind === "html" ? "O endereço não retornou uma página HTML." : "O endereço não retornou XML.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > BODY_LIMIT) throw new Error("A resposta excedeu 3 MB.");
        body += decoder.decode(value, { stream: true });
      }
      return { url, body: body + decoder.decode() };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  throw new Error("O endereço fez redirecionamentos demais.");
}

function asLocal(value: string, base: URL) {
  try {
    return localUrl(new URL(value.trim(), base).href);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (["TimeoutError", "AbortError"].includes(error.name)) return "A página demorou para responder.";
    if (error.message !== "fetch failed") return error.message;
  }
  return "Não foi possível acessar a página. Confira se o servidor local está rodando e se a porta está correta.";
}

export async function scan(start: URL, children: boolean, requestSignal: AbortSignal): Promise<ScanResult> {
  const began = Date.now();
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(35_000)]);
  const sameOrigin = (url: URL) => url.origin === start.origin && !url.username && !url.password;
  const scope = pathKey(start);
  const inScope = (url: URL) => sameOrigin(url) && (scope === "/" || pathKey(url) === scope || url.pathname.startsWith(scope + "/"));
  const notices: string[] = [];
  const pages: PageResult[] = [];
  const seen = new Set([pathKey(start)]);
  const reported = new Set<string>();
  const pending: URL[] = [];
  let limited = false;

  function enqueue(url: URL | null) {
    if (!url || !inScope(url) || pathKey(url) === scope || seen.has(pathKey(url))) return;
    if (seen.size >= PAGE_LIMIT) {
      limited = true;
      return;
    }
    seen.add(pathKey(url));
    url.search = "";
    pending.push(url);
  }

  async function page(url: URL, root = false) {
    try {
      const result = await readLocal(url, root && !children ? sameOrigin : inScope, signal, "html");
      const $ = load(result.body);
      const baseHref = $("base[href]").first().attr("href");
      let base = result.url;
      if (baseHref) {
        try { base = new URL(baseHref, base); } catch { /* use the document URL */ }
      }
      if (children) $("a[href]").each((_, anchor) => {
        const href = $(anchor).attr("href");
        if (href && !$(anchor).is("[download]")) enqueue(asLocal(href, base));
      });
      seen.add(pathKey(result.url));
      return inspectMarkup($, result.url.href);
    } catch (error) {
      return { url: url.href, entities: [], issues: [], source: [], failure: errorMessage(error) };
    }
  }

  async function readSitemaps() {
    const maps = [new URL("/sitemap.xml", start)];
    const visited = new Set(maps.map((map) => map.href));
    let failed = 0;
    let found = 0;
    let capped = false;
    while (maps.length && !signal.aborted) {
      const batch = maps.splice(0, 4);
      const results = await Promise.allSettled(batch.map((map) => readLocal(map, sameOrigin, signal, "xml")));
      for (const result of results) {
        if (result.status === "rejected") {
          if (result.reason?.message !== "A página retornou HTTP 404.") failed++;
          continue;
        }
        const $ = load(result.value.body, { xml: true });
        found++;
        $("sitemap > loc, url > loc").each((_, loc) => {
          const url = asLocal($(loc).text(), result.value.url);
          if (!url || !sameOrigin(url)) return;
          if ($(loc).parent().is("url")) {
            enqueue(url);
          } else if (!visited.has(url.href)) {
            if (visited.size >= SITEMAP_LIMIT) {
              capped = true;
              return;
            }
            visited.add(url.href);
            maps.push(url);
          }
        });
      }
    }
    if (failed) notices.push(found ? "Parte do sitemap não pôde ser lida." : "Não foi possível ler o sitemap. A descoberta usou os links das páginas.");
    if (capped) notices.push(`A leitura foi limitada a ${SITEMAP_LIMIT} arquivos de sitemap.`);
  }

  const [parent] = await Promise.all([page(start, true), children ? readSitemaps() : undefined]);
  pages.push(parent);
  reported.add(parent.url);
  while (pending.length && !signal.aborted) {
    const batch = pending.splice(0, 5);
    for (const result of await Promise.all(batch.map((url) => page(url)))) {
      if (reported.has(result.url)) continue;
      pages.push(result);
      reported.add(result.url);
    }
  }
  if (limited) notices.push(`A análise foi limitada a ${PAGE_LIMIT} páginas.`);
  if (signal.aborted) notices.push("O tempo máximo de análise foi atingido. Os resultados podem estar incompletos.");
  return { pages, notices, elapsedMs: Date.now() - began };
}
