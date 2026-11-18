# TastesLikeHome

A homemade bakery storefront and private management area, in French, English, and Arabic. The design uses chocolate brown (#3B2418), cream (#F2E8DA), and baby blue (#8EC5FF). Arabic uses a right-to-left layout.

## Manage your shop

Open `/admin` and sign in. You can:

- Add, edit, publish, archive, and restore baked goods.
- Upload up to six photos for an entry and choose its cover.
- Set prices, pieces per box, collections, ingredients, and allergen information.
- Write kitchen posts with photos. Published posts appear on the storefront.
- Keep entries as private drafts until you publish them.
- Write in any of the three languages and add translations later. Missing translations fall back to an available language.
- Add Instagram and order-email contacts, pickup details, and open or close order enquiries.
- Hide the sample collection when your actual menu is ready.

Content and photos are saved on the server, not in browser storage. Published changes appear on a fresh page immediately. Open storefront tabs check for updates every 30 seconds and when focused; tabs in the same browser also receive a publish notification. There is no deployment step when publishing content.

The initial menu, prices, and photographs are examples. The initial photographs were AI-generated. Replace them with actual product details and your own photos before opening for orders. Payments are arranged directly; the site does not process payments or submit confirmed orders. The customer basket and language preference are stored only in that customer's browser.

## Deploy on Vercel

1. Import this repository into Vercel. The included `vercel.json` selects Next.js and the correct build command. Keep the repository root as the project root; do not set `dist` as the output directory.
2. In the Vercel project's Storage tab, create or connect a **private Vercel Blob store**. Make its `BLOB_READ_WRITE_TOKEN` available to the deployment. The SDK also supports a connected `BLOB_STORE_ID` with Vercel OIDC authentication.
3. Add an `ADMIN_PASSWORD` environment variable containing a unique password of at least 16 characters. Keep it in Vercel's environment settings, never in the repository.
4. Deploy or redeploy after setting the environment variables. Visit `/admin` and sign in with that password.
5. Add your actual menu and photos, configure contact and pickup information, and enable enquiries when ready.

The Vercel backend stores the catalog and photos in private Blob storage. Public routes expose only published entries and their photos. Drafts and archived entries require an admin session. Overwrites use ETags to prevent lost updates, and catalog reads bypass the Blob cache so new posts are visible immediately.

Vercel documentation: [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [environment variables](https://vercel.com/docs/environment-variables).

The existing Sites preview and a Vercel deployment use separate storage. Content entered in one does not automatically copy to the other. Transfer existing managed content and photos before moving a shop that already has real entries; new deployments start from the six sample entries in `server/seed.json`.

## Existing Sites preview

The Sites deployment uses Cloudflare D1 for the catalog and R2 for uploaded photos. Sites supplies the signed-in identity; the server restricts management to the `ADMIN_EMAIL` runtime setting. That value is configured outside the source. The current Site audience remains private.

Run the supported Sites build and publishing helpers for the existing Site. `.openai/hosting.json` preserves its Site identity, `DB`, and `BUCKET` bindings. The schema-only migration in `drizzle/` creates the catalog table. Initial sample content is an application fallback, not migration data.

## Development

Requires Node.js 22.13 or later.

```sh
npm ci
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_busy_madame_hydra.sql
npm run dev
```

Apply each local migration once, in order. Add `ADMIN_EMAIL=seedy@sites.test` to an ignored `.dev.vars` file to use the supplied loopback-only Sites sign-in during development. Local and hosted storage are separate.

For a Vercel-compatible production build:

```sh
npm run build:vercel
```

The page-preparation script selects the hosting adapter. Run build commands sequentially if switching targets in the same checkout.

## Source map

- `site/storefront.html` and `site/admin.html`: page templates.
- `public/`: storefront, admin scripts, translations, styles, and bundled assets.
- `server/cms.mjs`: validation, authorization, sessions, publishing, and media access.
- `server/runtime-sites.ts`: D1/R2 adapter.
- `server/runtime-vercel.ts`: private Vercel Blob adapter.
- `server/seed.json`: initial sample products.
- `app/`: server-rendered page and API route handlers.
- `db/` and `drizzle/`: schema and migrations for Sites.
- `checks/`: translation, access-control, publishing, and upload checks.

The storefront supports `?lang=fr`, `?lang=en`, and `?lang=ar`. A shared-link language takes priority over the saved preference and browser language. Currency is configurable and is formatted for the selected language; changing language does not convert prices.

## Verification

```sh
npm test
```

Checks cover anonymous access, private drafts and photos, session cookies, origin checks, validation, upload limits, revision conflicts, publishing, archiving, sample visibility, and translation completeness. Both hosting targets have been built. Browser checks cover photo upload, cover selection, saving drafts, publishing, automatic storefront updates, multilingual posts, and the phone layout.

Font and icon licenses are included with their assets. Original image-generation briefs are in `ASSETS.md`.
