import type pg from "pg";

// Test-only stand-in for the slice of the supabase-js query builder that workstream 06 uses,
// executed as SQL against the throwaway Postgres database. Results go through row_to_json, so
// timestamps and numerics come back in the same JSON shapes PostgREST returns.
// RLS is not enforced (tests connect as the database owner); auth.uid() is set when a userId is given,
// otherwise the call carries the service-role claim like a Supabase service-key client.

type Result = { data: unknown; error: { message: string } | null; count?: number | null };
type Filter = { sql: string; values: unknown[] };

const EMBED_FK: Record<string, string> = { businesses: "business_id" };
const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsupported identifier: ${name}`);
  return `"${name}"`;
};

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function selectList(columns: string, alias: string): string {
  if (columns.trim() === "*") return `${alias}.*`;
  return splitTopLevel(columns)
    .map((token) => {
      const embed = /^(\w+)(!inner)?\((.*)\)$/.exec(token);
      if (!embed) return `${alias}.${ident(token)}`;
      const [, table, , inner] = embed;
      const fk = EMBED_FK[table!];
      if (!fk) throw new Error(`No FK mapping for embed ${table}`);
      return `(select row_to_json(e) from (select ${selectList(inner!, "e2")} from ${ident(table!)} e2 where e2.id = ${alias}.${ident(fk)}) e) as ${ident(table!)}`;
    })
    .join(", ");
}

function parseOr(expr: string): Filter {
  const clauses = expr.split(",").map((c) => {
    const [col, op, ...rest] = c.split(".");
    if (op !== "eq") throw new Error(`Unsupported or() operator: ${op}`);
    return { sql: `t.${ident(col!)} = ?`, value: rest.join(".") };
  });
  return { sql: `(${clauses.map((c) => c.sql).join(" or ")})`, values: clauses.map((c) => c.value) };
}

function numberPlaceholders(sql: string, start = 0): string {
  let n = start;
  return sql.replace(/\?/g, () => `$${++n}`);
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private columns = "*";
  private returning: string | null = null;
  private countExact = false;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private single: "maybe" | "one" | null = null;
  private rows: Array<Record<string, unknown>> = [];
  private values: Record<string, unknown> = {};
  private onConflict: string | undefined;
  private ignoreDuplicates = false;

  constructor(private run: Runner, private table: string) {}

  select(columns = "*", opts?: { count?: "exact" }) {
    if (this.op === "select") this.columns = columns;
    else this.returning = columns;
    this.countExact = opts?.count === "exact";
    return this;
  }
  insert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Record<string, unknown> | Array<Record<string, unknown>>, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.insert(rows);
    this.op = "upsert";
    this.onConflict = opts.onConflict;
    this.ignoreDuplicates = opts.ignoreDuplicates ?? false;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private where(sql: string, ...values: unknown[]) {
    this.filters.push({ sql, values });
    return this;
  }
  eq(col: string, v: unknown) { return this.where(`t.${ident(col)} = ?`, v); }
  neq(col: string, v: unknown) { return this.where(`t.${ident(col)} <> ?`, v); }
  gte(col: string, v: unknown) { return this.where(`t.${ident(col)} >= ?`, v); }
  lte(col: string, v: unknown) { return this.where(`t.${ident(col)} <= ?`, v); }
  in(col: string, v: readonly unknown[]) { return this.where(`t.${ident(col)} = any(?)`, [...v]); }
  or(expr: string) {
    this.filters.push(parseOr(expr));
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push(`t.${ident(col)} ${opts.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.single = "maybe";
    return this;
  }
  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.execute().then(ok, err);
  }

  private whereSql(): { sql: string; values: unknown[] } {
    if (this.filters.length === 0) return { sql: "", values: [] };
    return { sql: ` where ${this.filters.map((f) => f.sql).join(" and ")}`, values: this.filters.flatMap((f) => f.values) };
  }

  private async conflictTarget(): Promise<string> {
    if (this.onConflict) return this.onConflict.split(",").map((c) => ident(c.trim())).join(", ");
    const { rows } = await this.run(
      `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = $1::regclass and i.indisprimary`, [this.table]);
    return rows.map((r) => ident(r.attname as string)).join(", ");
  }

  private async writeSql(): Promise<{ sql: string; values: unknown[] }> {
    const table = ident(this.table);
    const ret = `select row_to_json(x) as j from (select ${selectList(this.returning ?? "*", "w")} from w) x`;
    if (this.op === "update" || this.op === "delete") {
      const where = this.whereSql();
      const sets = Object.keys(this.values).map((k) => `${ident(k)} = ?`);
      const head = this.op === "update" ? `update ${table} as t set ${sets.join(", ")}` : `delete from ${table} as t`;
      const sql = `with w as (${head}${where.sql} returning t.*) ${ret}`;
      return { sql: numberPlaceholders(sql), values: [...Object.values(this.values), ...where.values] };
    }
    const cols = [...new Set(this.rows.flatMap((r) => Object.keys(r)))];
    const values: unknown[] = [];
    const tuples = this.rows.map((r) => `(${cols.map((c) => (c in r ? (values.push(r[c]), "?") : "default")).join(", ")})`);
    let conflict = "";
    if (this.op === "upsert") {
      const target = await this.conflictTarget();
      const updates = cols.filter((c) => !target.includes(`"${c}"`)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      conflict = this.ignoreDuplicates || updates.length === 0
        ? ` on conflict (${target}) do nothing`
        : ` on conflict (${target}) do update set ${updates.join(", ")}`;
    }
    const sql = `with w as (insert into ${table} (${cols.map(ident).join(", ")}) values ${tuples.join(", ")}${conflict} returning *) ${ret}`;
    return { sql: numberPlaceholders(sql), values };
  }

  private async execute(): Promise<Result> {
    try {
      if (this.op !== "select") {
        const { sql, values } = await this.writeSql();
        const { rows } = await this.run(sql, values);
        return { data: this.returning ? rows.map((r) => r.j) : null, error: null };
      }
      const where = this.whereSql();
      const order = this.orders.length ? ` order by ${this.orders.join(", ")}` : "";
      const page = `${this.limitN === null ? "" : ` limit ${this.limitN}`}${this.offsetN ? ` offset ${this.offsetN}` : ""}`;
      const inner = `select ${selectList(this.columns, "t")} from ${ident(this.table)} t${where.sql}${order}${page}`;
      const { rows } = await this.run(numberPlaceholders(`select row_to_json(x) as j from (${inner}) x`), where.values);
      const data = rows.map((r) => r.j);
      const count = this.countExact
        ? Number((await this.run(numberPlaceholders(`select count(*) as n from ${ident(this.table)} t${where.sql}`), where.values)).rows[0]!.n)
        : null;
      if (this.single === "maybe") {
        if (data.length > 1) return { data: null, error: { message: "multiple rows returned" } };
        return { data: data[0] ?? null, error: null };
      }
      return { data, error: null, count };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  }
}

type Runner = (sql: string, values: unknown[]) => Promise<pg.QueryResult<Record<string, unknown>>>;

async function rpc(run: Runner, fn: string, args: Record<string, unknown>): Promise<Result> {
  try {
    const { rows: meta } = await run(
      "select p.proretset as retset, p.prorettype::regtype::text as rettype from pg_proc p where p.proname = $1", [fn]);
    if (meta.length === 0) throw new Error(`function ${fn} does not exist`);
    const named = Object.keys(args).map((k, i) => `${ident(k)} => $${i + 1}`).join(", ");
    const call = `${ident(fn)}(${named})`;
    const values = Object.values(args);
    if (meta[0]!.retset) {
      const { rows } = await run(`select row_to_json(r) as j from ${call} r`, values);
      return { data: rows.map((r) => r.j), error: null };
    }
    const { rows } = await run(`select ${call} as v`, values);
    return { data: meta[0]!.rettype === "void" ? null : rows[0]!.v, error: null };
  } catch (err) {
    return { data: null, error: { message: (err as Error).message } };
  }
}

/** A client bound to the test pool; with `userId`, every statement runs with auth.uid() = userId. */
export function fakeSupabase(pool: pg.Pool, userId?: string) {
  const run: Runner = async (sql, values) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (userId) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      else await client.query("select set_config('request.jwt.claim.role', 'service_role', true)");
      const result = await client.query(sql, values);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  };
  return {
    from: (table: string) => new Query(run, table),
    rpc: (fn: string, args: Record<string, unknown> = {}) => rpc(run, fn, args),
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
  };
}
