# Schema Local

Validador em Next.js e Tailwind CSS para testar dados estruturados de páginas rodando na sua máquina.

## Como usar

1. Inicie o site a testar na porta dele, por exemplo a 3000.
2. Nesta pasta, com Node.js 22 ou superior, execute `npm ci` e `npm run dev`.
3. Abra [Schema Local](http://127.0.0.1:3100), informe `localhost:3000/99pay` e selecione **Validar página**.
4. Ative **Incluir subpáginas** para seguir os links internos de cada página e consultar `/sitemap.xml`, incluindo índices de sitemap. Selecione uma rota para ver seu código e diagnóstico.

**Testar exemplo** executa uma análise real sobre quatro rotas sintéticas servidas pelo próprio app.

## O que é verificado

- Sintaxe JSON, estruturas comuns de JSON-LD, tipos e nomes de propriedades do Schema.org.
- Entidades aninhadas, listas, `@graph`, contexto Schema.org e aliases simples declarados localmente.
- Falhas de acesso por rota, com código e diagnóstico lado a lado.

A análise lê o HTML entregue pelo servidor. JSON-LD inserido apenas após a execução de JavaScript, Microdata e RDFa ficam fora da validação. A checagem de vocabulário não aplica regras de resultados enriquecidos do Google nem todas as regras da especificação JSON-LD.

A descoberta fica na mesma origem e dentro da árvore do caminho inicial. Por exemplo, `/99pay/ajuda` entra na análise de `/99pay`, enquanto `/99pay-extra` fica fora. As subpáginas são deduplicadas por caminho, sem query string. A busca cobre até 50 páginas e 10 sitemaps. Rotas sem links e ausentes do sitemap não são descobertas.

O vocabulário incluído foi extraído da [distribuição oficial do Schema.org](https://schema.org/docs/developers.html), a partir de `schemaorg-current-https.jsonld`. A validação roda sem enviar o HTML a serviços externos.

`npm run check` verifica os tipos e `npm run build` gera a versão de produção local.
