import { localUrl, scan } from "../../../lib/crawl";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Abra o validador para executar uma análise." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Envie os parâmetros em JSON." }, { status: 415 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Dados da análise inválidos." }, { status: 400 });
  }
  if (!input || typeof input !== "object" || !("url" in input) || typeof input.url !== "string") {
    return Response.json({ error: "Informe uma URL local." }, { status: 400 });
  }
  let url: URL;
  try {
    url = localUrl(input.url);
  } catch (error) {
    const message = error instanceof TypeError ? "Informe uma URL local válida." : (error as Error).message;
    return Response.json({ error: message }, { status: 400 });
  }
  const result = await scan(url, "children" in input && input.children === true, request.signal);
  return Response.json(result);
}
