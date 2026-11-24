# Third-party notices

Policy: only MIT, BSD-2/3, Apache-2.0, ISC, CC0 or Unlicense code may be used. Never GPL, LGPL, AGPL, SSPL,
CC-BY-NC or unlicensed code. Every third-party package or snippet that is copied or bundled specially is
recorded here with its license text. Ordinary npm dependencies keep their own LICENSE files in `node_modules`;
this file lists the ones whose attribution we reproduce on purpose.

Each entry: `## <name>` · Package/version · License (and how it was verified) · Copyright · URL · Use · license text.

## Supabase self-hosted Docker setup

- Source: `supabase/supabase`, tag `self-hosted/v0.8.4`, folder `docker/` (vendored in `infra/supabase/`,
  local changes listed in `infra/supabase/PRETZURI.md`)
- License: Apache-2.0 (repository LICENSE)
- URL: https://github.com/supabase/supabase
- Use: self-hosted Supabase stack for DEV/PROD.

## sharp and libvips (feed worker image cache)

- Package: `sharp` ^0.35 (`worker/package.json`), with the prebuilt `@img/sharp-*` and `@img/sharp-libvips-*` binary
  packages npm selects for the platform
- License: sharp is Apache-2.0 (verified in `node_modules/sharp/package.json`). **libvips is LGPL-3.0-or-later**: it is
  not our code and is not modified; it ships as a prebuilt shared library inside `@img/sharp-libvips-*` and is loaded
  dynamically by sharp, so it can be replaced by the user (LGPL section 4). This is a recorded exception to the
  "no LGPL" policy above (DECISIONS "Product image cache"); the source and license of libvips remain in those
  packages in `node_modules` (and in the worker image) and at https://github.com/libvips/libvips
- URL: https://github.com/lovell/sharp
- Use: resize/convert product images to WebP thumbnails in `worker/src/images/`.
