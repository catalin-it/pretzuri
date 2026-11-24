import type { Queryable } from "../db/pool.js";
import { normKey, slugify, slugSuffix } from "./text.js";

const NO_BRAND = new Set(["-", "n/a", "na", "none", "generic", "generica", "fara brand", "no brand", "diverse", "nespecificat", "altele", "other"]);

/** Canonical brand ids via brands.name_norm / brand_aliases.alias_norm; unknown brands are created. Cached per run. */
export class BrandResolver {
  private cache = new Map<string, number | null>();
  public created = 0;
  constructor(private db: Queryable) {}

  async resolve(raw: string | null): Promise<number | null> {
    if (!raw) return null;
    const key = normKey(raw);
    if (!key || NO_BRAND.has(key)) return null;
    if (this.cache.has(key)) return this.cache.get(key)!;
    let id = await this.lookup(raw);
    if (id === null) {
      const base = slugify(raw, 60);
      for (let i = 0; i < 5 && id === null; i++) {
        const slug = i === 0 ? base : `${base}-${slugSuffix(4)}`;
        const r = await this.db.query<{ id: number }>(
          "insert into public.brands (name, slug) values ($1, $2) on conflict do nothing returning id",
          [raw, slug],
        );
        id = r.rows[0]?.id ?? (await this.lookup(raw));
        if (r.rows[0]) this.created++;
      }
    }
    this.cache.set(key, id);
    return id;
  }

  private async lookup(raw: string): Promise<number | null> {
    const r = await this.db.query<{ id: number }>(
      `select id from public.brands where name_norm = public.norm_text($1)
       union all
       select brand_id from public.brand_aliases where alias_norm = public.norm_text($1)
       limit 1`,
      [raw],
    );
    return r.rows[0]?.id ?? null;
  }
}

/**
 * Shop category path -> our category via category_mappings (per merchant). Unknown paths are inserted with
 * category_id null (admin maps them later) and counted as unmapped. Also tracks per-path row counts.
 */
export class CategoryResolver {
  private map = new Map<string, number | null>();
  private counts = new Map<string, number>();
  public unmappedPaths = new Set<string>();
  /** our category id -> top-level slug (first path segment) */
  public topSlug = new Map<number, string>();

  constructor(private db: Queryable, private merchantId: number) {}

  async load(): Promise<void> {
    const m = await this.db.query<{ source_path: string; category_id: number | null }>(
      "select source_path, category_id from public.category_mappings where merchant_id = $1",
      [this.merchantId],
    );
    for (const r of m.rows) this.map.set(r.source_path, r.category_id);
    const c = await this.db.query<{ id: number; path: string }>("select id, path from public.categories");
    for (const r of c.rows) this.topSlug.set(r.id, r.path.split("/")[0]!);
  }

  async resolve(path: string | null): Promise<number | null> {
    if (!path) return null;
    this.counts.set(path, (this.counts.get(path) ?? 0) + 1);
    if (!this.map.has(path)) {
      await this.db.query(
        "insert into public.category_mappings (merchant_id, source_path) values ($1, $2) on conflict (merchant_id, source_path) do nothing",
        [this.merchantId, path],
      );
      this.map.set(path, null);
    }
    const id = this.map.get(path) ?? null;
    if (id === null) this.unmappedPaths.add(path);
    return id;
  }

  /** Writes offer_count per path seen in this run. */
  async flushCounts(): Promise<void> {
    if (!this.counts.size) return;
    const rows = [...this.counts].map(([source_path, n]) => ({ source_path, n }));
    await this.db.query(
      `update public.category_mappings cm set offer_count = r.n
       from jsonb_to_recordset($2::jsonb) as r(source_path text, n int)
       where cm.merchant_id = $1 and cm.source_path = r.source_path and cm.offer_count is distinct from r.n`,
      [this.merchantId, JSON.stringify(rows)],
    );
  }
}
