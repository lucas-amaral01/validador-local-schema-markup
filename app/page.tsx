"use client";

import {
  ArrowDownRight, ArrowLeft, ArrowRight, Braces, Check, ChevronDown, CircleAlert, CircleCheck,
  CodeXml, Copy, FileCode2, FlaskConical, GitBranch, Globe2, ListTree, Play, TriangleAlert,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import type { Issue, PageResult, ScanResult } from "../lib/types";
import { EntityDetails } from "./entity-details";

const preview = `{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Acme Pagamentos",
  "url": "https://example.com"
}`;
const tokens = /("(?:\\.|[^"\\])*")|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?)/g;
const hosted = process.env.NEXT_PUBLIC_GITHUB_PAGES === "1";
const localOrigin = "http://127.0.0.1:3100";

function Code({ source }: { source: string }) {
  return <pre className="code" tabIndex={0} aria-label="Código JSON-LD"><code>
    {source.split("\n").map((line, i) => {
      const parts = [];
      let start = 0;
      for (const match of line.matchAll(tokens)) {
        const index = match.index;
        parts.push(line.slice(start, index));
        start = index + match[0].length;
        const style = match[1] ? /^\s*:/.test(line.slice(start)) ? "key" : "string" : "literal";
        parts.push(<span className={style} key={index}>{match[0]}</span>);
      }
      return <span className="line" key={i}><span aria-hidden className="line-number">{i + 1}</span><span>{parts}{line.slice(start)}</span></span>;
    })}
  </code></pre>;
}

function pageName(url: string) {
  const value = new URL(url);
  try { return decodeURI(value.pathname) + value.search; }
  catch { return value.pathname + value.search; }
}

function PageStatus({ page }: { page: PageResult }) {
  if (page.failure || page.issues.some((issue) => issue.level === "error")) return <><CircleAlert size={15} className="error" aria-hidden /><span className="sr-only">{page.failure ? "Falha de acesso" : "Com erros"}</span></>;
  if (page.issues.length) return <><TriangleAlert size={15} className="warning" aria-hidden /><span className="sr-only">Com avisos</span></>;
  if (page.entities.length) return <><CircleCheck size={15} className="success" aria-hidden /><span className="sr-only">Sem ocorrências</span></>;
  return <><span className="empty-dot" aria-hidden /><span className="sr-only">Sem entidades Schema.org</span></>;
}

function DiagnosticIssue({ issue }: { issue: Issue }) {
  return <div className="issue">
    {issue.level === "error" ? <CircleAlert size={17} className="error" aria-hidden /> : <TriangleAlert size={17} className="warning" aria-hidden />}
    <div><span className="sr-only">{issue.level === "error" ? "Erro. " : "Aviso. "}</span><strong>{issue.message}</strong><p>{issue.path}</p></div>
  </div>;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [children, setChildren] = useState(false);
  const [report, setReport] = useState<ScanResult>();
  const [selected, setSelected] = useState(0);
  const [block, setBlock] = useState(0);
  const [entityIndex, setEntityIndex] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const resultsTitle = useRef<HTMLHeadingElement>(null);
  const page = report?.pages[selected];
  const entity = entityIndex === undefined ? undefined : page?.entities[entityIndex];
  const issues = page?.issues.filter((issue) => issue.entity === (entity ? entityIndex : undefined)) ?? [];
  const source = page ? page.source[block] : preview;
  const countedIssues = entity ? issues : page?.issues ?? [];
  const errors = countedIssues.filter((issue) => issue.level === "error").length;
  const warnings = countedIssues.length - errors;

  async function run(target: string, crawlChildren: boolean, fromDemo = false) {
    if (busy) return;
    if (!target.trim()) {
      setError("Informe o endereço da página local.");
      document.getElementById("target-url")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setCopyStatus("");
    setReport(undefined);
    setEntityIndex(undefined);
    try {
      const response = await fetch(hosted ? `${localOrigin}/api/scan` : "/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target, children: crawlChildren }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "A análise não pôde ser iniciada.");
        return;
      }
      setSelected(0);
      setBlock(0);
      setReport(data);
      if (fromDemo) requestAnimationFrame(() => resultsTitle.current?.focus());
    } catch {
      setError(hosted
        ? "Inicie o validador local na porta 3100 e permita o acesso à rede local no navegador. Depois, tente novamente."
        : "O validador perdeu a conexão. Tente analisar novamente.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(url, children);
  }

  function demo() {
    const target = (hosted ? localOrigin : window.location.origin) + "/exemplo";
    setUrl(target);
    setChildren(true);
    void run(target, true, true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(source ?? "");
      setCopyStatus("Copiado");
    } catch {
      setCopyStatus("Selecione o código para copiar");
    }
  }

  function openEntity(index: number, sourceBlock: number) {
    setEntityIndex(index);
    setBlock(sourceBlock);
    setCopyStatus("");
    requestAnimationFrame(() => document.getElementById("entity-title")?.focus());
  }

  function closeEntity() {
    setEntityIndex(undefined);
    requestAnimationFrame(() => document.getElementById(`entity-${entityIndex}`)?.focus());
  }

  return <>
    <header className="topbar">
      <div className="shell flex min-h-[65px] items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="brand"><Braces size={20} strokeWidth={2.3} /></span><span className="brand-name">Schema Local</span></div>
        <span className="local-tag"><span /> Ambiente local</span>
      </div>
    </header>
    <main className="shell">
      <section className="intro" aria-labelledby="title">
        <h1 id="title">Validador de Schema Markup</h1>
        <p>Confira os dados estruturados do seu site antes de publicar.</p>
        {hosted && <p>Inicie o validador na porta 3100 para acessar as páginas da sua máquina. <a className="underline underline-offset-2" href="https://github.com/lucas-amaral01/validador-local-schema-markup#como-usar">Como conectar</a></p>}
      </section>

      <form className="scan-form" onSubmit={submit} noValidate>
        <div className="input-area">
          <label htmlFor="target-url">URL da página</label>
          <div className="input-wrap"><Globe2 size={18} aria-hidden />
            <input id="target-url" inputMode="url" autoComplete="off" spellCheck={false}
              value={url} onChange={(event) => { setUrl(event.target.value); setError(""); }}
              placeholder="http://localhost:3000/99pay" aria-invalid={Boolean(error)}
              aria-describedby={error ? "scan-error" : undefined} />
          </div>
        </div>
        <div className="options">
          <label className="toggle">
            <input type="checkbox" checked={children} onChange={(event) => setChildren(event.target.checked)} aria-describedby="children-help" />
            <span className="track" aria-hidden /><span>Incluir subpáginas</span>
          </label>
          <span id="children-help">Busca em links internos e no sitemap, dentro do caminho informado.</span>
        </div>
        <button className="primary" type="submit" disabled={busy}><Play size={16} aria-hidden />{busy ? "Analisando…" : "Validar página"}</button>
        {error && <p id="scan-error" className="form-error" role="alert"><CircleAlert size={16} />{error}</p>}
      </form>

      <section className="workspace" aria-label="Bancada de validação" aria-busy={busy}>
        <div className="workspace-bar">
          <div className="flex min-w-0 items-center gap-2.5"><ListTree size={17} aria-hidden /><h2 ref={resultsTitle} tabIndex={-1}>Inspeção</h2>
            <span className="mode-tag">JSON-LD</span>
          </div>
          {report ? <span className="scan-meta">{report.pages.length} {report.pages.length === 1 ? "página" : "páginas"} · {(report.elapsedMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s</span> :
            <button className="quiet" type="button" onClick={demo} disabled={busy}><FlaskConical size={16} />Testar exemplo<ArrowRight size={14} className="example-arrow" /></button>}
        </div>
        {busy && <div className="progress" aria-hidden><span /></div>}
        {report?.notices.map((notice) => <p key={notice} className="notice"><TriangleAlert size={15} />{notice}</p>)}
        <div className="panes">
          <aside className="routes" aria-label="Rotas encontradas">
            <h3><GitBranch size={15} /> Rotas</h3>
            {report ? <ul className="route-list">{report.pages.map((item, index) => (
              <li key={item.url}><button type="button" aria-pressed={index === selected}
                title={item.url} onClick={() => { setSelected(index); setBlock(0); setEntityIndex(undefined); setCopyStatus(""); }}>
                {index === 0 ? <FileCode2 size={15} /> : <ArrowDownRight size={15} />}
                <span>{pageName(item.url)}</span><PageStatus page={item} />
              </button></li>
            ))}</ul> : <div className="route-empty"><div><FileCode2 size={16} /> <span>/99pay</span></div><div><ArrowDownRight size={14} /> <span>/99pay/ajuda</span></div><div><ArrowDownRight size={14} /> <span>/99pay/taxas</span></div><small>Rotas ilustrativas</small></div>}
          </aside>
          <section className="source pane" aria-labelledby="source-title">
            <div className="pane-title"><h3 id="source-title"><CodeXml size={17} /> Código-fonte</h3>
              {source && <button className="copy quiet" onClick={copy} type="button" aria-label="Copiar bloco JSON-LD">{copyStatus === "Copiado" ? <Check size={15} /> : <Copy size={15} />}<span>{copyStatus || "Copiar"}</span></button>}
            </div>
            <div className="code-toolbar">
              {page && page.source.length > 1 ? <label className="block-select"><select aria-label="Bloco JSON-LD" value={block} onChange={(event) => { setBlock(Number(event.target.value)); setEntityIndex(undefined); setCopyStatus(""); }}>
                {page.source.map((_, i) => <option key={i} value={i}>Bloco {i + 1} de {page.source.length}</option>)}
              </select><ChevronDown size={14} aria-hidden /></label> : <span>{page ? page.source.length ? "Bloco 1" : "Nenhum bloco" : "Exemplo de JSON-LD"}</span>}
            </div>
            {source ? <Code source={source} /> : <p className="code-empty">{page?.source.length ? "Bloco vazio ou fora do limite de exibição." : "Nenhum código JSON-LD disponível."}</p>}
            <span role="status" className="sr-only">{copyStatus}</span>
          </section>
          <section className="diagnostics pane" aria-labelledby="diagnostics-title">
            <div className="pane-title"><h3 id="diagnostics-title"><CircleCheck size={17} /> Diagnóstico</h3>
              {entity && <button className="quiet" type="button" onClick={closeEntity}><ArrowLeft size={15} aria-hidden /> Voltar aos itens</button>}
            </div>
            {page ? <>
              <div className="counts">{page.failure ? "Análise indisponível" : <><span><i className="error-dot" />{errors} {errors === 1 ? "erro" : "erros"}</span><span><i className="warning-dot" />{warnings} {warnings === 1 ? "aviso" : "avisos"}</span><span>{entity ? `Bloco ${entity.block + 1}` : `${page.entities.length} ${page.entities.length === 1 ? "item" : "itens"} na página`}</span></>}</div>
              <div className="diagnostic-body" key={entityIndex ?? "overview"}>
                {page.failure && <div className="issue"><CircleAlert size={17} className="error" /><div><strong>Falha de acesso</strong><p>{page.failure}</p></div></div>}
                {entity && <h4 id="entity-title" className="entity-heading" tabIndex={-1}>{entity.types.join(", ")}</h4>}
                {issues.map((issue, i) => <DiagnosticIssue key={i} issue={issue} />)}
                {!page.failure && !page.entities.length && <p className="muted px-4 py-3">Nenhuma entidade Schema.org identificada nesta página.</p>}
                {entity ? <EntityDetails entity={entity} source={source} /> : page.entities.map((item, index) => {
                  const itemIssues = page.issues.filter((issue) => issue.entity === index);
                  return <button type="button" className="entity" id={`entity-${index}`} key={index} onClick={() => openEntity(index, item.block)} title={item.path}>
                    <Braces size={16} aria-hidden /><span><strong>{item.types.join(", ")}</strong>{item.name && <small>{item.name}</small>}</span>
                    {itemIssues.length > 0 && <span className={`entity-count ${itemIssues.some((issue) => issue.level === "error") ? "error" : "warning"}`}>{itemIssues.length} {itemIssues.length === 1 ? "ocorrência" : "ocorrências"}</span>}
                    <ArrowRight size={14} aria-hidden />
                  </button>;
                })}
              </div>
            </> : <div className="diagnostic-empty">
              <span className="empty-mark"><Braces size={27} /></span>
              <h4>{busy ? "Lendo a página" : "Aguardando análise"}</h4>
              <p>{busy ? "Os resultados aparecem quando a busca terminar." : "Valide uma URL para ver os itens, erros e avisos de cada rota."}</p>
            </div>}
          </section>
        </div>
      </section>
      <p className="sr-only" role="status">{busy ? "Análise em andamento." : report ? `Análise concluída. ${report.pages.length} páginas no resultado.` : ""}</p>
      <footer><span>Verificação local do JSON-LD presente no HTML.</span><a href="https://schema.org/docs/developers.html" target="_blank" rel="noreferrer">Vocabulário Schema.org <ArrowRight size={13} /></a></footer>
    </main>
  </>;
}
