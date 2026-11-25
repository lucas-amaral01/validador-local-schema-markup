import { load } from "cheerio";
import vocabulary from "./vocabulary.json";
import type { PageResult } from "./types";

const classes = new Set(vocabulary.types);
const properties = new Set(vocabulary.properties);
const schemaPrefix = /^https?:\/\/schema\.org\//i;
const schemaContext = /^https?:\/\/schema\.org\/?$/i;

type Context = { vocab: string; terms: Record<string, string>; external: boolean };
const emptyContext: Context = { vocab: "", terms: {}, external: false };
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readContext(raw: unknown, inherited: Context): Context {
  if (raw === undefined) return inherited;
  if (raw === null) return emptyContext;
  if (Array.isArray(raw)) return raw.reduce<Context>((ctx, part) => readContext(part, ctx), inherited);
  if (typeof raw === "string") {
    return schemaContext.test(raw)
      ? { ...inherited, vocab: "https://schema.org/" }
      : { ...inherited, external: true };
  }
  if (!isObject(raw)) return inherited;
  const terms = { ...inherited.terms };
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("@")) continue;
    if (value === null) delete terms[key];
    else if (typeof value === "string") terms[key] = value;
    else if (isObject(value) && typeof value["@id"] === "string") terms[key] = value["@id"];
  }
  const vocab = raw["@vocab"];
  return { ...inherited, terms, vocab: typeof vocab === "string" ? vocab : vocab === null ? "" : inherited.vocab };
}

function expand(term: string, context: Context) {
  const value = Object.hasOwn(context.terms, term) ? context.terms[term] : term;
  if (value.startsWith("@")) return value;
  const colon = value.indexOf(":");
  if (colon !== -1) {
    const prefix = value.slice(0, colon);
    if (Object.hasOwn(context.terms, prefix)) return context.terms[prefix] + value.slice(colon + 1);
    return value;
  }
  return context.vocab + value;
}

export function inspectMarkup($: ReturnType<typeof load>, url: string): PageResult {
  const page: PageResult = { url, source: [], entities: [], issues: [] };
  const add = (level: "error" | "warning", path: string, message: string) => {
    if (page.issues.length < 200) page.issues.push({ level, path, message });
  };
  const scripts = $("script").filter((_, el) =>
    ($(el).attr("type") ?? "").split(";")[0].trim().toLowerCase() === "application/ld+json",
  ).toArray();
  const maxSource = 120_000;
  let remainingSource = maxSource;

  for (const [block, script] of scripts.entries()) {
    const raw = $(script).html()?.trim() ?? "";
    page.source.push(raw.slice(0, remainingSource));
    const path = `Bloco ${block + 1}`;
    if (raw.length > remainingSource) add("warning", path, "A exibição do código foi limitada.");
    remainingSource = Math.max(0, remainingSource - raw.length);

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      const offset = error instanceof Error ? /position (\d+)/.exec(error.message)?.[1] : undefined;
      const line = offset ? raw.slice(0, Number(offset)).split("\n").length : undefined;
      add("error", path, line ? `JSON inválido perto da linha ${line}.` : "JSON inválido. Confira a sintaxe do bloco.");
      continue;
    }
    if (!isObject(data) && (!Array.isArray(data) || data.some((item) => !isObject(item)))) {
      add("error", path, "O bloco deve conter um objeto ou uma lista de objetos JSON-LD.");
      continue;
    }

    const seenWarnings = new Set<string>();
    function warnOnce(key: string, location: string, message: string) {
      if (seenWarnings.has(key)) return;
      seenWarnings.add(key);
      add("warning", location, message);
    }

    function visit(value: unknown, location: string, inherited: Context, depth: number, pointer?: (string | number)[]) {
      if (depth > 60) {
        warnOnce("depth", location, "Parte do bloco excede a profundidade de análise.");
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => visit(entry, `${location}[${index}]`, inherited, depth + 1, pointer && [...pointer, index]));
        return;
      }
      if (!isObject(value)) return;
      const firstIssue = page.issues.length;
      let entityIndex: number | undefined;
      const context = readContext(value["@context"], inherited);
      if (context.external) warnOnce("context", location, "Contextos externos não são carregados. Só termos Schema.org identificáveis são conferidos.");
      const entries = Object.entries(value).filter(([key]) => key !== "@context");
      const typeEntry = entries.find(([key]) => expand(key, context) === "@type");
      const valueObject = entries.some(([key]) => expand(key, context) === "@value");
      if (typeEntry && !valueObject) {
        const rawTypes = typeEntry[1];
        const list = Array.isArray(rawTypes) ? rawTypes : [rawTypes];
        const found: string[] = [];
        if (list.length === 0 || list.some((type) => typeof type !== "string" || !type.trim())) {
          add("error", `${location}.@type`, "Use um tipo ou uma lista de tipos não vazios.");
        }
        for (const type of list) {
          if (typeof type !== "string" || !type.trim()) continue;
          const expanded = expand(type, context);
          if (schemaPrefix.test(expanded)) {
            const name = expanded.replace(schemaPrefix, "");
            found.push(name);
            if (!classes.has(name)) add("error", `${location}.@type`, `Tipo desconhecido no Schema.org: ${name}.`);
          } else if (!expanded.includes(":") && !context.external && !context.vocab) {
            warnOnce("missing", location, "Declare @context como https://schema.org para validar os termos abreviados.");
          }
        }
        if (pointer && found.length && page.entities.length < 300) {
          const label = entries.find(([key]) => schemaPrefix.test(expand(key, context)) && expand(key, context).replace(schemaPrefix, "") === "name")?.[1];
          entityIndex = page.entities.length;
          page.entities.push({ types: found, block, path: location, pointer, name: typeof label === "string" ? label.slice(0, 240) : undefined });
        }
      }
      for (const [key, child] of entries) {
        const term = expand(key, context);
        const childPath = `${location}.${key}`;
        if (term === "@id" && typeof child !== "string") add("error", childPath, "@id deve ser um texto.");
        if (term === "@graph" && !isObject(child) && (!Array.isArray(child) || child.some((node) => !isObject(node)))) {
          add("error", childPath, "@graph deve conter um objeto ou uma lista de objetos.");
        }
        if (schemaPrefix.test(term) && !properties.has(term.replace(schemaPrefix, ""))) {
          add("warning", childPath, `Propriedade desconhecida no Schema.org: ${key}.`);
        }
        if (!["@type", "@id", "@value", "@language", "@direction", "@index"].includes(term)) {
          const graphPointer = pointer && !typeEntry && term === "@graph" ? [...pointer, key] : undefined;
          visit(child, childPath, context, depth + 1, graphPointer);
        }
      }
      if (entityIndex !== undefined) {
        for (let index = firstIssue; index < page.issues.length; index++) page.issues[index].entity = entityIndex;
      }
    }

    visit(data, path, emptyContext, 0, []);
  }

  if ($("[itemscope], [typeof]").length) {
    add("warning", "HTML", "A página contém Microdata ou RDFa. Esta análise cobre os blocos JSON-LD.");
  }
  return page;
}
