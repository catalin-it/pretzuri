-- DEV ONLY: three test merchants with sample feeds bundled in the worker image (WORKER_ALLOW_FIXTURES=1).
-- Re-runnable:  bash infra/nas/psql.sh dev < infra/nas/seed/dev-feeds.sql
-- Then trigger imports:  see the end of this file (commented) or infra/nas/README.md "Feed worker".
-- `https://fixtures.invalid/<name>` URLs never resolve on the internet; the worker serves them from worker/fixtures.

begin;

insert into public.merchants (slug, name, website, description, shipping_info, has_affiliate, affiliate_network) values
  ('megashop-test', 'Megashop (test)', 'https://megashop-test.example.ro', 'Magazin de test DEV (feed 2Performant).',
   'Livrare prin curier in 1-3 zile lucratoare.', true, '2performant'),
  ('electroplus-test', 'ElectroPlus (test)', 'https://electroplus-test.example.ro', 'Magazin de test DEV (feed Profitshare).',
   'Livrare gratuita pentru unele produse.', true, 'profitshare'),
  ('casadigitala-test', 'Casa Digitala (test)', 'https://casadigitala-test.example.ro', 'Magazin de test DEV (feed direct, fara afiliere).',
   'Livrare 1-4 zile; ridicare personala din Bucuresti.', false, null)
on conflict (slug) do update set
  name = excluded.name, website = excluded.website, description = excluded.description,
  shipping_info = excluded.shipping_info, has_affiliate = excluded.has_affiliate,
  affiliate_network = excluded.affiliate_network, is_active = true;

-- Feed sources (one per merchant + a CSV source for the direct merchant). Matched by (merchant, name).
with v(slug, name, type, url, options) as (values
  ('megashop-test', 'Megashop 2Performant CSV', '2performant', 'https://fixtures.invalid/2performant-sample.csv', '{}'),
  ('electroplus-test', 'ElectroPlus Profitshare XML', 'profitshare', 'https://fixtures.invalid/profitshare-sample.xml', '{}'),
  ('casadigitala-test', 'Casa Digitala XML', 'direct_xml', 'https://fixtures.invalid/direct-sample.xml', '{}'),
  ('casadigitala-test', 'Casa Digitala CSV parfumuri', 'direct_csv', 'https://fixtures.invalid/direct-sample.csv', '{"delimiter":";"}')
), upd as (
  update public.feed_sources fs set type = v.type, url = v.url, options = v.options::jsonb, is_active = true,
    etag = null, last_modified = null
  from v join public.merchants m on m.slug = v.slug
  where fs.merchant_id = m.id and fs.name = v.name
  returning fs.id
)
insert into public.feed_sources (merchant_id, name, type, url, options, schedule_minutes)
select m.id, v.name, v.type, v.url, v.options::jsonb, 360
from v join public.merchants m on m.slug = v.slug
where not exists (select 1 from public.feed_sources fs where fs.merchant_id = m.id and fs.name = v.name);

-- Shop category paths -> our categories (0007). "Componente PC > SSD" stays unmapped on purpose (admin demo).
with v(slug, source_path, cat) as (values
  ('megashop-test', 'Telefoane & Tablete > Telefoane mobile', 'telefoane-tablete/telefoane-mobile'),
  ('megashop-test', 'Laptopuri & IT > Laptopuri', 'it-electronice/laptopuri'),
  ('megashop-test', 'TV & Audio > Televizoare', 'tv-audio-foto/televizoare'),
  ('megashop-test', 'Electrocasnice mari > Masini de spalat rufe', 'electrocasnice/masini-de-spalat'),
  ('megashop-test', 'Parfumuri > Parfumuri dama', 'parfumuri/parfumuri-femei'),
  ('megashop-test', 'Parfumuri > Parfumuri barbati', 'parfumuri/parfumuri-barbati'),
  ('electroplus-test', 'Telefoane mobile', 'telefoane-tablete/telefoane-mobile'),
  ('electroplus-test', 'Laptopuri si accesorii > Laptopuri', 'it-electronice/laptopuri'),
  ('electroplus-test', 'Televizoare', 'tv-audio-foto/televizoare'),
  ('electroplus-test', 'Electrocasnice > Masini de spalat', 'electrocasnice/masini-de-spalat'),
  ('electroplus-test', 'Parfumuri > Femei', 'parfumuri/parfumuri-femei'),
  ('casadigitala-test', 'Telefoane > Smartphone', 'telefoane-tablete/telefoane-mobile'),
  ('casadigitala-test', 'IT > Laptopuri', 'it-electronice/laptopuri'),
  ('casadigitala-test', 'TV > Televizoare', 'tv-audio-foto/televizoare'),
  ('casadigitala-test', 'Electrocasnice > Spalare', 'electrocasnice/masini-de-spalat'),
  ('casadigitala-test', 'Parfumuri > Dama', 'parfumuri/parfumuri-femei'),
  ('casadigitala-test', 'Parfumuri > Barbati', 'parfumuri/parfumuri-barbati')
)
insert into public.category_mappings (merchant_id, source_path, category_id)
select m.id, v.source_path, c.id
from v join public.merchants m on m.slug = v.slug join public.categories c on c.path = v.cat
on conflict (merchant_id, source_path) do update set category_id = excluded.category_id;

-- Brand aliases seen in the samples ("Christian Dior" -> Dior, "YSL" -> Yves Saint Laurent).
insert into public.brands (name, slug) values ('Dior', 'dior'), ('Yves Saint Laurent', 'yves-saint-laurent')
on conflict do nothing;
insert into public.brand_aliases (alias_norm, brand_id)
select public.norm_text(a.alias), b.id
from (values ('Christian Dior', 'Dior'), ('YSL', 'Yves Saint Laurent')) a(alias, brand)
join public.brands b on b.name_norm = public.norm_text(a.brand)
on conflict (alias_norm) do nothing;

commit;

-- Trigger imports in this order (the worker runs one at a time, oldest request first):
-- insert into public.import_requests (feed_source_id, requested_at)
-- select fs.id, now() + (row_number() over (order by fs.id)) * interval '1 millisecond'
-- from public.feed_sources fs join public.merchants m on m.id = fs.merchant_id
-- where m.slug in ('megashop-test', 'electroplus-test', 'casadigitala-test')
-- on conflict do nothing;
