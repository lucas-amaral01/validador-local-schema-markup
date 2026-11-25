import { localUrl, scan } from "../../../lib/crawl";

export const runtime = "nodejs";

const pagesOrigin = "https://lucas-amaral01.github.io";

function allowsPages(request: Request) {
  return request.headers.get("origin") === pagesOrigin;
}

export function OPTIONS(request: Request) {
  if (!allowsPages(request)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": pagesOrigin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    },
  });
}

export async function POST(request: Request) {
  const pages = allowsPages(request);
  const origin = request.headers.get("origin");
  if (!pages && (request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin))) {
    return Response.json({ error: "Abra o validador para executar uma análise." }, { status: 403 });
  }
  const headers = pages ? { "Access-Control-Allow-Origin": pagesOrigin, Vary: "Origin" } : undefined;
  function reply(data: unknown, status = 200) {
    return Response.json(data, { status, headers });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ error: "Envie os parâmetros em JSON." }, 415);
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return reply({ error: "Dados da análise inválidos." }, 400);
  }
  if (!input || typeof input !== "object" || !("url" in input) || typeof input.url !== "string") {
    return reply({ error: "Informe uma URL local." }, 400);
  }
  let url: URL;
  try {
    url = localUrl(input.url);
  } catch (error) {
    const message = error instanceof TypeError ? "Informe uma URL local válida." : (error as Error).message;
    return reply({ error: message }, 400);
  }
  const result = await scan(url, "children" in input && input.children === true, request.signal);
  return reply(result);
}
