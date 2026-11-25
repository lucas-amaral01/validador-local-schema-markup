const examples: Record<string, unknown[]> = {
  "": [
    { "@type": "Organization", name: "Acme Pagamentos", url: "https://example.com" },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: "https://example.com" },
      { "@type": "ListItem", position: 2, name: "Pagamentos", item: "https://example.com/pagamentos" },
    ] },
    { "@type": "FinancialProduct", name: "Conta digital Acme", provider: { "@type": "Organization", name: "Acme Pagamentos" } },
  ],
  ajuda: [{ "@type": "FAQPage", mainEntity: [{
    "@type": "Question", name: "Onde encontro meu saldo?",
    acceptedAnswer: { "@type": "Answer", text: "Abra a aba Carteira." },
  }] }],
  taxas: [{ "@type": "FinancialProdut", name: "Tabela de taxas", curreny: "BRL" }],
  "ajuda/seguranca": [{ "@type": "WebPage", name: "Segurança da conta" }],
};

export async function GET(_: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const key = (await params).slug?.join("/") ?? "";
  if (!Object.hasOwn(examples, key)) return new Response("Página não encontrada", { status: 404 });
  const markup = JSON.stringify({ "@context": "https://schema.org", "@graph": examples[key] }, null, 2);
  const links = key === "" ? '<a href="/exemplo/ajuda">Ajuda</a> <a href="/exemplo/taxas">Taxas</a>' :
    key === "ajuda" ? '<a href="/exemplo/ajuda/seguranca">Segurança</a>' : "";
  return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Exemplo sintético</title><h1>Exemplo sintético</h1>${links}<script type="application/ld+json">${markup}</script></html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
