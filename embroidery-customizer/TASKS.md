# Embroidery customizer — implementation checklist

Legend: `[x]` done and verified locally · `[~]` implemented, needs a real Shopify store to verify

## Phase 1 — inspect / setup
- [x] Host repo inspected (existing OS 2.0 theme; project isolated in `embroidery-customizer/`)
- [x] New GLB inspected: mesh, packed UVs, PBR textures, bounds, facing (+Z), units (m)
- [x] GLB optimized 2.11 MB → 224 KB (WebP textures, meshopt), textures preserved
- [x] npm workspaces + TypeScript + Vite + Preact + ESLint + Prettier + Vitest + Playwright

## Phase 2 — working 3D MVP
- [x] Three.js viewer: GLTFLoader + MeshoptDecoder, OrbitControls, render-on-demand, cleanup
- [x] Original materials kept; garment colour via texture-preserving tint; cotton roughness calibration
- [x] Surface-conforming decals (front + back) reusing the fabric normal map
- [x] Text: 4 fonts with fallbacks, 10 thread colours, size, spacing, alignment, validation
- [x] Image: PNG/JPEG/WebP, signature + size checks, preview, replace/remove, scale
- [x] Placement: 5 calibrated positions, offsets/scale/rotation, drag on garment, safe bounds
- [x] 4-step responsive UI, review + caveat, reset, keyboard, reduced motion, mobile
- [x] Demo cart: add / edit / remove, distinct lines

## Phase 3 — persistence + Shopify bridge
- [x] Ajax cart adapter (`/{locale}/cart/add.js`, `cart/change.js`, property merge, stale keys)
- [x] Theme app extension: product app block + cart edit app embed (Theme Check: 0 offenses)
- [x] Lazy loader (1.7 KB gz) + configurator bundle
- [x] Local Shopify simulator + e2e for the Shopify code path
- [x] App backend: app proxy routes, Prisma models, local + S3/R2 storage, rate limits (builds, unit-tested)
- [~] Install on a dev store, real app proxy + webhook delivery

## Phase 4 — fulfilment + QA
- [x] Packing slip snippet (rendered in tests with LiquidJS)
- [x] orders/create linking + retention cleanup (unit-tested)
- [~] Real packing slip + order on a dev store
- [x] Homepage section in the host theme (on request); header/footer placeholders switched to Default

## Phase 5 — client feature round (2026-10-14)
- [~] 1. Mockup image on the order: stored per line (`_Embroidery Mockup`), shown in the app; email snippet in `notifications/` (needs pasting into the Order confirmation template)
- [x] 3. Ready-made design templates (6 templates, fill-in fields, editable after)
- [x] 5. Team jerseys: name + number per row, auto-numbering, per-person mockups
- [~] 6. Logo approval queue in the app + order tags (verify on the dev store with a real order)
- [~] 8. Bulk discount tiers shown live; create matching Shopify automatic discounts to charge them

## Backlog — noted for later (not started)
- [x] 2. More garments: crew tee, sport tee, polo, long-sleeve (calibrated, switchable, design carries over); next: hoodie, cap, tote
- 4. Sleeve and back-neck placement (needs sleeve calibration on the current model)
- 7. "See it on a person": model photo / AR quick look on phones
- 9. Gift options: gift wrap, gift message, hide prices on the packing slip
- 10. Save designs to the customer account and one-click reorder
