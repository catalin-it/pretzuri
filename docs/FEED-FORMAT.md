# Pretzuri direct feed format (v1)

For partner shops that send us their products directly (no affiliate network). Draft; fixtures in
`worker/fixtures/direct-sample.{xml,csv}`.

## Delivery
- A stable HTTPS URL we download periodically (default every 6 hours), optionally with HTTP Basic auth or a token
  in the URL. Gzip (`.gz`) is accepted. Max size 2 GB uncompressed.
- Please support `ETag` or `Last-Modified` so unchanged feeds are skipped.
- Encoding UTF-8. CSV: header row, delimiter `,` or `;`, fields quoted with `"`.
- Products missing from a feed are considered no longer offered and disappear from Pretzuri after the run.

## Fields
| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable unique product id in your shop (max 100 chars) |
| `title` | yes | Product name as shown on your site |
| `gtin` (alias `ean`) | strongly recommended | EAN-13 / GTIN-8/12/14, digits only |
| `brand` | recommended | Manufacturer brand |
| `mpn` | recommended | Manufacturer part number / model code |
| `category` | yes | Your category path, e.g. `Electronice > Telefoane > Smartphone` |
| `price` | yes | Final price incl. VAT, e.g. `2499.99` (dot or comma decimal) |
| `old_price` | no | Previous price, only if the product is on sale (Omnibus rules apply on your side) |
| `currency` | no | ISO code, default `RON` |
| `availability` | yes | `in_stock`, `limited`, `out_of_stock`, `preorder` |
| `shipping_cost` | recommended | Delivery cost in the same currency; `0` = free. Empty = unknown |
| `shipping_days` | no | Typical delivery time in working days, e.g. `1-3` |
| `url` | yes | Product page URL on your site (HTTPS) |
| `image_url` | recommended | Main image, HTTPS, min 400×400 |
| `description` | no | Plain text, max 5000 chars |
| `specs` | no | XML: `<spec name="RAM">8 GB</spec>`; CSV: `RAM=8 GB|Stocare=256 GB` |

## XML example
```xml
<?xml version="1.0" encoding="UTF-8"?>
<products version="1">
  <product>
    <id>SKU-123</id>
    <title>Samsung Galaxy S24 5G 256GB Onyx Black</title>
    <gtin>8806095299911</gtin>
    <brand>Samsung</brand>
    <mpn>SM-S921BZKGEUE</mpn>
    <category>Telefoane &gt; Smartphone</category>
    <price>3499.99</price>
    <old_price>3999.99</old_price>
    <currency>RON</currency>
    <availability>in_stock</availability>
    <shipping_cost>0</shipping_cost>
    <shipping_days>1-2</shipping_days>
    <url>https://shop.example.ro/p/sku-123</url>
    <image_url>https://shop.example.ro/img/sku-123.jpg</image_url>
    <specs><spec name="Stocare">256 GB</spec><spec name="RAM">8 GB</spec></specs>
  </product>
</products>
```

Affiliate networks (2Performant, Profitshare) use their own feed formats; their field maps live in
`worker/src/adapters/`.
