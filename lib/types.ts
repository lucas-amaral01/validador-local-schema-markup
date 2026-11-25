export type Issue = {
  level: "error" | "warning";
  path: string;
  message: string;
  entity?: number;
};

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type Entity = {
  types: string[];
  block: number;
  path: string;
  pointer: (string | number)[];
  name?: string;
};

export type PageResult = {
  url: string;
  source: string[];
  entities: Entity[];
  issues: Issue[];
  failure?: string;
};

export type ScanResult = {
  pages: PageResult[];
  notices: string[];
  elapsedMs: number;
};
