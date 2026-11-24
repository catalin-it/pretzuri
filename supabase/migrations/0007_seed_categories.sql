-- 0007: initial category tree (DECISIONS "Catalog & categories"): all domains, the four launch domains in more
-- detail. Editable later in admin. Format per line: parent path | slug | name ro | name en.
do $$
declare
  rec record;
  pid bigint;
  n int := 0;
begin
  for rec in
    select split_part(l, '|', 1) as parent, split_part(l, '|', 2) as slug,
           split_part(l, '|', 3) as name_ro, split_part(l, '|', 4) as name_en
    from unnest(array[
      -- Roots
      '|it-electronice|IT & Electronice|IT & Electronics',
      '|telefoane-tablete|Telefoane & Tablete|Phones & Tablets',
      '|tv-audio-foto|TV, Audio & Foto|TV, Audio & Photo',
      '|electrocasnice|Electrocasnice|Home Appliances',
      '|casa-gradina|Casă & Grădină|Home & Garden',
      '|bricolaj|Bricolaj & Unelte|DIY & Tools',
      '|sanatate-frumusete|Sănătate & Frumusețe|Health & Beauty',
      '|parfumuri|Parfumuri|Perfumes',
      '|moda|Modă & Accesorii|Fashion & Accessories',
      '|copii-jucarii|Copii & Jucării|Kids & Toys',
      '|sport-timp-liber|Sport & Timp liber|Sports & Leisure',
      '|auto-moto|Auto & Moto|Car & Moto',
      '|carti-birou|Cărți, Birou & Papetărie|Books, Office & Stationery',
      '|gaming|Gaming|Gaming',
      '|supermarket-animale|Supermarket & Animale|Grocery & Pets',
      -- IT & Electronics
      'it-electronice|laptopuri|Laptopuri|Laptops',
      'it-electronice|desktop-pc|Desktop PC|Desktop PCs',
      'it-electronice|monitoare|Monitoare|Monitors',
      'it-electronice|componente-pc|Componente PC|PC Components',
      'it-electronice/componente-pc|procesoare|Procesoare|Processors',
      'it-electronice/componente-pc|placi-video|Plăci video|Graphics Cards',
      'it-electronice/componente-pc|memorii-ram|Memorii RAM|RAM',
      'it-electronice/componente-pc|ssd|SSD|SSDs',
      'it-electronice/componente-pc|hdd|Hard disk|Hard Drives',
      'it-electronice/componente-pc|placi-de-baza|Plăci de bază|Motherboards',
      'it-electronice/componente-pc|surse|Surse|Power Supplies',
      'it-electronice|periferice|Periferice|Peripherals',
      'it-electronice/periferice|tastaturi|Tastaturi|Keyboards',
      'it-electronice/periferice|mouse|Mouse|Mice',
      'it-electronice/periferice|imprimante|Imprimante|Printers',
      'it-electronice|retelistica|Rețelistică|Networking',
      'it-electronice|stocare-externa|Stocare externă|External Storage',
      'it-electronice|software|Software|Software',
      -- Phones & Tablets
      'telefoane-tablete|telefoane-mobile|Telefoane mobile|Mobile Phones',
      'telefoane-tablete|tablete|Tablete|Tablets',
      'telefoane-tablete|smartwatch|Smartwatch & Brățări|Smartwatches & Bands',
      'telefoane-tablete|accesorii-telefoane|Accesorii telefoane|Phone Accessories',
      -- TV, Audio & Photo
      'tv-audio-foto|televizoare|Televizoare|TVs',
      'tv-audio-foto|casti|Căști|Headphones',
      'tv-audio-foto|boxe|Boxe & Soundbar|Speakers & Soundbars',
      'tv-audio-foto|aparate-foto|Aparate foto|Cameras',
      'tv-audio-foto|proiectoare|Proiectoare|Projectors',
      -- Home appliances
      'electrocasnice|frigidere|Frigidere & Congelatoare|Fridges & Freezers',
      'electrocasnice|masini-de-spalat|Mașini de spălat rufe|Washing Machines',
      'electrocasnice|uscatoare|Uscătoare de rufe|Tumble Dryers',
      'electrocasnice|masini-spalat-vase|Mașini de spălat vase|Dishwashers',
      'electrocasnice|aragazuri-cuptoare|Aragazuri, cuptoare & plite|Cookers, Ovens & Hobs',
      'electrocasnice|aer-conditionat|Aer condiționat|Air Conditioners',
      'electrocasnice|aspiratoare|Aspiratoare|Vacuum Cleaners',
      'electrocasnice|electrocasnice-bucatarie|Electrocasnice mici bucătărie|Small Kitchen Appliances',
      'electrocasnice/electrocasnice-bucatarie|espressoare|Espressoare & cafetiere|Coffee Machines',
      'electrocasnice/electrocasnice-bucatarie|friteuze|Friteuze|Fryers',
      'electrocasnice/electrocasnice-bucatarie|blendere-mixere|Blendere & mixere|Blenders & Mixers',
      'electrocasnice/electrocasnice-bucatarie|cuptoare-microunde|Cuptoare cu microunde|Microwave Ovens',
      'electrocasnice|ingrijire-personala|Îngrijire personală|Personal Care Appliances',
      -- Home & Garden
      'casa-gradina|mobila|Mobilă|Furniture',
      'casa-gradina|decoratiuni|Decorațiuni|Home Decor',
      'casa-gradina|iluminat|Iluminat|Lighting',
      'casa-gradina|bucatarie|Articole de bucătărie|Kitchenware',
      'casa-gradina|textile|Textile de casă|Home Textiles',
      'casa-gradina|gradina|Grădină|Garden',
      'casa-gradina/gradina|mobilier-gradina|Mobilier de grădină|Garden Furniture',
      'casa-gradina/gradina|unelte-gradina|Unelte de grădină|Garden Tools',
      'casa-gradina/gradina|gratare|Grătare|Barbecues',
      'casa-gradina|incalzire|Încălzire & climatizare|Heating & Climate',
      -- DIY & Tools
      'bricolaj|scule-electrice|Scule electrice|Power Tools',
      'bricolaj|scule-manuale|Scule manuale|Hand Tools',
      'bricolaj|instalatii-sanitare|Instalații sanitare|Plumbing',
      'bricolaj|materiale-constructii|Materiale de construcții|Building Materials',
      'bricolaj|electrice|Materiale electrice|Electrical Supplies',
      -- Health & Beauty
      'sanatate-frumusete|ingrijire-ten|Îngrijirea tenului|Skin Care',
      'sanatate-frumusete|machiaj|Machiaj|Make-up',
      'sanatate-frumusete|ingrijire-par|Îngrijirea părului|Hair Care',
      'sanatate-frumusete|suplimente|Suplimente alimentare|Food Supplements',
      'sanatate-frumusete|dispozitive-medicale|Dispozitive medicale|Medical Devices',
      'sanatate-frumusete|igiena-orala|Igienă orală|Oral Care',
      -- Perfumes
      'parfumuri|parfumuri-femei|Parfumuri femei|Women''s Perfumes',
      'parfumuri|parfumuri-barbati|Parfumuri bărbați|Men''s Perfumes',
      'parfumuri|parfumuri-unisex|Parfumuri unisex|Unisex Perfumes',
      'parfumuri|seturi-cadou|Seturi cadou|Gift Sets',
      -- Others (first level only for now)
      'moda|imbracaminte|Îmbrăcăminte|Clothing',
      'moda|incaltaminte|Încălțăminte|Footwear',
      'moda|ceasuri-bijuterii|Ceasuri & bijuterii|Watches & Jewellery',
      'copii-jucarii|jucarii|Jucării|Toys',
      'copii-jucarii|articole-bebelusi|Articole bebeluși|Baby Products',
      'sport-timp-liber|fitness|Fitness|Fitness',
      'sport-timp-liber|biciclete-trotinete|Biciclete & trotinete|Bikes & Scooters',
      'sport-timp-liber|camping|Camping & drumeții|Camping & Hiking',
      'auto-moto|anvelope|Anvelope|Tyres',
      'auto-moto|accesorii-auto|Accesorii auto|Car Accessories',
      'auto-moto|electronice-auto|Electronice auto|Car Electronics',
      'carti-birou|carti|Cărți|Books',
      'carti-birou|papetarie|Papetărie & birou|Stationery & Office',
      'gaming|console|Console|Consoles',
      'gaming|jocuri|Jocuri|Games',
      'gaming|accesorii-gaming|Accesorii gaming|Gaming Accessories',
      'supermarket-animale|alimente-bauturi|Alimente & băuturi|Food & Drinks',
      'supermarket-animale|animale-companie|Animale de companie|Pets'
    ]) with ordinality as t(l, ord)
    order by ord
  loop
    if rec.parent = '' then
      pid := null;
    else
      select id into pid from public.categories where path = rec.parent;
      if pid is null then raise exception 'seed: parent % not found', rec.parent; end if;
    end if;
    n := n + 1;
    insert into public.categories (parent_id, slug, name_ro, name_en, sort_order)
    values (pid, rec.slug, rec.name_ro, rec.name_en, n)
    on conflict (path) do nothing;
  end loop;
end $$;

-- Filterable specs for a few launch categories (keys as they come from feeds; extended in admin).
update public.categories set spec_filters = '[{"key":"Procesor"},{"key":"Memorie RAM"},{"key":"Capacitate SSD"},{"key":"Diagonala display"}]'
  where path = 'it-electronice/laptopuri';
update public.categories set spec_filters = '[{"key":"Memorie interna"},{"key":"Memorie RAM"},{"key":"Diagonala display"},{"key":"Conectivitate"}]'
  where path = 'telefoane-tablete/telefoane-mobile';
update public.categories set spec_filters = '[{"key":"Diagonala"},{"key":"Rezolutie"},{"key":"Tehnologie display"}]'
  where path = 'tv-audio-foto/televizoare';
update public.categories set spec_filters = '[{"key":"Capacitate spalare"},{"key":"Clasa energetica"},{"key":"Viteza centrifugare"}]'
  where path = 'electrocasnice/masini-de-spalat';
update public.categories set spec_filters = '[{"key":"Concentratie"},{"key":"Volum"}]'
  where path like 'parfumuri/%';
