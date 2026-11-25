import type { Entity, JsonValue } from "../lib/types";

type Row = { name: string; depth: number; value?: string };
const ROW_LIMIT = 1000;

function readRows(source: string | undefined, entity: Entity) {
  if (!source || !entity.pointer) return;
  let node: JsonValue;
  try {
    node = JSON.parse(source);
    for (const key of entity.pointer) {
      if (!node || typeof node !== "object" || !Object.hasOwn(node, key)) return;
      node = (node as Record<string | number, JsonValue>)[key];
    }
  } catch {
    return;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) return;

  const rows: Row[] = [];
  let limited = false;
  function append(name: string, value: JsonValue, depth: number) {
    if (rows.length >= ROW_LIMIT || depth > 60) {
      limited = true;
      return;
    }
    if (Array.isArray(value) && value.length) {
      for (const item of value) {
        if (rows.length >= ROW_LIMIT) {
          limited = true;
          break;
        }
        if (Array.isArray(item)) rows.push({ name, depth, value: JSON.stringify(item) });
        else append(name, item, depth);
      }
      return;
    }
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) {
      rows.push({ name, depth });
      for (const [key, child] of Object.entries(value)) append(key, child, depth + 1);
      return;
    }
    rows.push({ name, depth, value: typeof value === "string" && value ? value : JSON.stringify(value) });
  }
  for (const [name, value] of Object.entries(node)) append(name, value, 0);
  return { rows, limited };
}

export function EntityDetails({ entity, source }: { entity: Entity; source: string | undefined }) {
  const data = readRows(source, entity);
  if (!data) return <p className="muted px-4 py-3">As propriedades deste bloco estão fora do limite de exibição.</p>;
  return <>
    <table className="entity-properties" aria-label="Propriedades do item">
      <thead><tr><th scope="col">Propriedade</th><th scope="col">Valor</th></tr></thead>
      <tbody>{data.rows.map(({ name, depth, value }, index) => <tr key={index}>
        <th scope="row" style={{ paddingInlineStart: 15 + Math.min(depth, 5) * 9 }}>{name || '""'}</th>
        <td>{value}</td>
      </tr>)}</tbody>
    </table>
    {data.limited && <p className="muted px-4 py-3">Parte das propriedades está fora do limite de exibição. Consulte o painel de código.</p>}
  </>;
}
