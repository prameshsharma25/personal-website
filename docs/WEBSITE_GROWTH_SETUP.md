# Website resources, checkout, and search setup

The implementation adds a free lab-search tracker, email signup invitations, a resources hub, the $5 essay bundle, article navigation, social cards, and an RSS feed. Existing article URLs are preserved.

## Files and pages

- `/resources` — guides and downloads.
- `/resources/lab-search-tracker` — free XLSX and ZIP download; optional email signup.
- `/resources/phd-essay-bundle` — $5 product page and short preview.
- `/resources/phd-essay-bundle/thanks` — private purchase reference handled in a URL fragment and browser session storage, never in analytics.
- `private-products/Pramesh_Sharma_PhD_Essays.zip` — buyer bundle. This folder is gitignored and must never be copied into `public/`.
- `public/downloads/` — only the free tracker, CSV templates, and quick-start PDF.

The paid bundle preserves the supplied essay wording. The SOP is tailored to UMD's CBBG concentration. The sales page makes no admissions-outcome claim. Original source text and editable documents are in `private-products/` for the owner to review.

## Connect Stripe and private delivery

1. Copy `.env.example` to `.env.local` for local testing, or add its variables in the existing Vercel project's environment settings. Keep secrets server-side; never use a `NEXT_PUBLIC_` prefix for credentials.
2. Create a **private** Vercel Blob store. Connect it to the project. Use either its `BLOB_READ_WRITE_TOKEN` or the supported connected-store OIDC configuration. A public Blob store is intentionally rejected.
3. Upload `private-products/Pramesh_Sharma_PhD_Essays.zip` to that private store. Use the dashboard or `npm run upload:essays` (loads `.env.local`). Set `ESSAY_BUNDLE_BLOB_URL` to the exact private URL returned. Do not run the upload script against a public store.
4. Add a Stripe **test** secret key as `STRIPE_SECRET_KEY`. The integration creates a Checkout Session with a server-controlled price of **500 USD cents**, one item, one-time payment, and the `phd-essays-v1` marker. No price supplied by the browser is accepted. Card payments must be enabled in the account. The installed Stripe SDK uses its pinned API version and `allowed_payment_method_types`.
5. Register a **snapshot** webhook endpoint at `https://prameshsharma.com/api/stripe-webhook`, using the API version exported by the installed Stripe SDK. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Set `STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret. Use Stripe CLI forwarding and its separate signing secret for local testing.
6. Configure `USER_EMAIL` and `GMAIL_APP_PASSWORD` for the existing Gmail transport. These also send buyer download emails. `RECIPIENT_EMAIL` remains the destination for the site's contact form. Confirm that the sender account permits the intended transactional email volume.
7. Set `COMMERCE_ORIGIN` to the exact site origin, normally `https://prameshsharma.com`. Local HTTP origins are accepted only with a Stripe test key. Set `ESSAY_SALES_ENABLED=true` only when the other settings are ready.
8. Complete a real **Stripe test-mode** purchase. Verify the download on the return page, the webhook-delivered email when the return page is never visited, duplicate webhook retries, and rejection after a refund. Then configure live-mode keys and the live webhook separately before launching sales.

Until the required settings are present, the product page displays a preparation message and the API refuses checkout. A private-file read is checked before a Checkout Session is created. Automated tests do not substitute for the account-connected test purchase.

Downloads verify Stripe's current payment state, product marker, line item, currency, amount, and charge refund/dispute status on every request. Full files are fetched from private Blob storage through the server; their storage URL is not sent to the browser. A purchase reference acts as a bearer credential, so buyers should keep their email link private. Completed email delivery is recorded in Stripe metadata. A rare concurrent webhook or an SMTP success followed by a metadata-write failure can repeat a notification; it cannot create a second charge or grant a different purchase access.

This version charges a fixed $5 and does not calculate sales tax, discounts, or multi-item orders. Configure the appropriate business/tax treatment in consultation with your payment-account setup before live sales. Refunds are managed in Stripe; refunded or disputed purchases lose download access. Do not promise a refund policy on the site that you have not chosen.

## Email signup without Substack

The site uses a public HTTPS link to a hosted signup form. It works with Kit,
MailerLite, or another provider that supplies a signup URL. No email API key,
subscriber database, or embedded third-party script is needed on the website.

1. Create a signup form with your chosen provider. For Kit, choose the **Free**
   plan, then **Audience growth → Landing Pages & Forms → New → Form → Inline**.
2. Save and publish the form. Under **Embed → Share**, copy its public URL and
   open it to check the form. Configure the sender identity and confirmation
   email in your provider account.
3. Add the URL as `NEXT_PUBLIC_NEWSLETTER_URL` in `.env.local` and your hosting
   environment. This is a public form URL, never an API key.
4. Restart local development or rebuild the deployment. The Subscribe button
   and article email invitations will use the new destination.
5. Subscribe with an email address you own and verify confirmation,
   delivery, and unsubscribe behavior before announcing the list.

When the setting is empty or invalid, email invitations are hidden. There is no
fallback to Substack or a form that pretends to collect addresses. The tracker
remains freely downloadable. Existing Substack article links and publishing
workflows remain in place; no subscribers have been migrated or contacted.

As checked on November 24, 2026, Kit's Free plan includes up to 10,000 subscribers,
forms, and email broadcasts. Email sequences and RSS campaigns require a paid
plan. With the free setup, publish your website post and send a broadcast from
Kit yourself; publishing an MDX file does not automatically email subscribers.
Kit branding remains on the free plan. Verify current terms when choosing a plan.

Analytics events record tracker downloads, signup-link clicks, and successful
opening of checkout. A link click is not a confirmed subscription. There is no
automatic enrollment on purchase, and no email address or purchase reference is
included in custom analytics events. Stripe handles purchase totals.

## Future advertisement placement

`public/ads.txt` serves the existing publisher identifier at `/ads.txt`. A labeled ad position is available after article content. It stays off unless both `NEXT_PUBLIC_ADSENSE_ENABLED=true` and a real `NEXT_PUBLIC_ADSENSE_ARTICLE_SLOT` are configured. Rebuild after changing these public settings. The former unconditional global ad script has been removed, so ads do not run on checkout, downloads, or the homepage by default.

Before enabling ads, verify site approval and the ad unit in AdSense, configure the account's required privacy/consent messaging, and test placement on mobile. The integration does not claim approval or install a consent-management platform. Reserved space reduces layout movement when a configured ad loads.

## Search and content

The shared SEO component supplies canonical URLs, descriptions, social images, article metadata, and breadcrumb structured data. All 15 posts and four guides have topic-specific search titles and descriptions. New share cards are generated from that metadata. Personal essays keep their original visible titles and body text; descriptions identify them as personal accounts rather than authoritative program instructions.

The book list is server rendered. Long articles have stable heading links and a table of contents. The homepage and resources hub link to the strongest practical guides. Empty lab-directory data is excluded from the sitemap and receives `noindex`; once listings exist in the deployed dataset it can be indexed. No opportunities were fabricated or refreshed as part of this change.

In Search Console, verify the domain, submit `/sitemap.xml`, inspect the tracker, product, NIH article, and cold-email guide, and review actual query/page performance. Having metadata does not guarantee indexing, rankings, traffic, ad approval, or sales. Search Console ownership and results have not been verified here.

## Local checks and regeneration

Use your installed Node.js, or the repository's existing `.local/node/bin` runtime:

```sh
export PATH="$PWD/.local/node/bin:$PATH"
npm ci
npm run typecheck
npm test
npm run build
npm run start -- -p 3817
```

In another terminal, run `npm run test:browser`. Install a Playwright browser first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to your installed Chrome executable. The browser suite assumes checkout, email signup, and ads are unconfigured and uses `http://127.0.0.1:3817` unless `TEST_BASE_URL` is set. Screenshots are written under ignored `.local/`. If testing with a configured signup URL, set `TEST_NEWSLETTER_URL` to the same URL used for `NEXT_PUBLIC_NEWSLETTER_URL` at build time.

To regenerate downloads and social cards, install Python dependencies `XlsxWriter reportlab Pillow openpyxl formulas`, then run:

```sh
python3 scripts/build_downloads.py
python3 scripts/build_downloads.py --paid
python3 scripts/verify_downloads.py
```

The `--paid` option requires the ignored source files. Font rendering uses Arial on macOS or DejaVu Sans on Linux. Review the resulting PDFs before replacing the private delivery asset.

## Primary documentation

- [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks)
- [Vercel private Blob storage](https://vercel.com/docs/vercel-blob/private-storage)
- [Kit Free plan](https://help.kit.com/en/articles/16627071-the-kit-free-plan)
- [Kit pricing](https://kit.com/pricing)
- [Kit form embedding and share links](https://help.kit.com/en/articles/4009572-form-embedding-basics)
- [Google ads.txt guidance](https://support.google.com/adsense/answer/12171612)
- [Google Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start)
