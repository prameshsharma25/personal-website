# Your newsletter, sent through personal Gmail

Readers sign up on prameshsharma.com, confirm by email, and receive newsletters
from your personal Google account. You write and send at `/newsletter/admin`.
A private Google Sheet stores the list and sending history. Google Apps Script
runs the mail sender. No Kit subscription or Gmail app password is needed for
this newsletter.

The code is implemented locally. **Google account setup and deployment are still
required.** No subscribers have been imported and no real email was sent during
automated testing. Publishing a website article does not send a newsletter.

## 1. Create the private Google project

1. Sign into the personal Gmail account you want readers to receive mail from.
   Create a Google Sheet named **Website newsletter**. Keep sharing restricted
   to you; only trusted administrators should have access to the sheet or script.
2. Open **Extensions → Apps Script**. Replace `Code.gs` with the contents of
   `integrations/google-newsletter/Code.gs` in this repository.
3. In Apps Script **Project Settings**, enable **Show appsscript.json manifest
   file in editor**. Replace its contents with
   `integrations/google-newsletter/appsscript.json`.
4. Generate two different random secrets locally. Run the following command
   twice from the website directory. Save the first as your shared secret and
   the second as your admin access key in your password manager. Do not paste
   either into chat or commit them to Git.

   ```sh
   ./.local/node/bin/node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Under **Project Settings → Script Properties**, set:

   | Property | Value |
   | --- | --- |
   | `SHARED_SECRET` | The first generated secret |
   | `PUBLIC_SITE_URL` | `https://prameshsharma.com` (no trailing slash) |
   | `SENDER_POSTAL_ADDRESS` | The real mailing address you want in every newsletter footer; line breaks are supported |

6. Save, select `setupNewsletter` in the editor, and click **Run**. Review and
   authorize your own script's spreadsheet and email-sending permissions. Setup
   creates five tabs and the `SPREADSHEET_ID` and `TOKEN_SECRET` properties. It
   does not send email. Keep `TOKEN_SECRET` unchanged: existing unsubscribe
   links depend on it. The sender is the account that owns the web-app deployment.
7. Select **Deploy → New deployment → Web app**. Choose **Execute as: Me** and
   **Who has access: Anyone**, then deploy. Copy the URL ending in `/exec`.
   Website visitors do not sign into Google. The shared secret authenticates
   requests from your website; the public script URL alone cannot read the list
   or send messages. Opening the URL in a browser returns a method error normally.

The manifest requests permission to send mail, access spreadsheets, and identify
the owner. It does not request access to read your Gmail inbox. The spreadsheet
scope can access the owner's spreadsheets; keep this script and its editors
private. Review the supplied code before authorizing it.

## 2. Connect the website

Add these **server-side** values to the website hosting project's environment
settings. For local development, put them in the ignored `.env.local` file.
Never prefix these with `NEXT_PUBLIC_`.

```dotenv
NEWSLETTER_ENABLED=true
NEWSLETTER_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
NEWSLETTER_SHARED_SECRET=YOUR_FIRST_SECRET
NEWSLETTER_ADMIN_KEY=YOUR_SECOND_DIFFERENT_SECRET
NEWSLETTER_ORIGIN=https://prameshsharma.com
```

Redeploy the website or restart the local server. The signup form appears on the
homepage and resource pages, with signup invitations on the NIH and cold-email
articles. `/newsletter` becomes indexable and enters the sitemap. When settings
are missing or disabled, invitations stay hidden and signup requests are refused.

The Google `PUBLIC_SITE_URL` and website `NEWSLETTER_ORIGIN` must match the origin
used in your browser exactly. For local testing, use a **separate test script and
sheet**, with both set to `http://127.0.0.1:3000` (or your chosen port). Confirmation
links will only work on the computer running that local server. Prefer a separate
HTTPS preview origin for testing from a phone. Keep production links on the final
domain; changing origins breaks links already emailed.

The IP-based signup limit assumes direct Vercel hosting, or a directly connected
local server. If you move behind another proxy, adapt `requestFingerprint` to its
trusted client-IP header before opening signup; otherwise visitors can share one
limit. Never trust arbitrary client-supplied forwarding headers.

## 3. Verify with your own address

1. Subscribe using an email address you control. Check that the Sheet says
   `pending` and that the confirmation arrives. Inspect spam if necessary.
2. Open the confirmation link and click **Confirm subscription**. The status
   should become `confirmed`. Just opening the link does not change the list.
3. Open `/newsletter/admin` and enter your admin access key. Save a draft and
   use **Email me a preview**. This sends only to the Google deployment owner.
4. With only your own address subscribed, review the saved draft, check the
   approval box, and choose **Approve and send newsletter**.
5. Verify the received message and its unsubscribe link. Unsubscribe and verify
   that later newsletters skip that address. Check mobile signup too.

These steps send real email and consume quota; do them deliberately after account
setup. Automated tests use an isolated mock Google service and cannot establish
Google authorization, inbox delivery, or sender reputation.

## Writing and sending

Go to `/newsletter/admin`, unlock, write, and save. The optional post link must
point to your own website. The saved preview includes the configured footer.
Previews go to you; actual newsletters require the separate approval action.
Each recipient gets an individual message. Addresses are never put in CC or BCC.

Approval freezes the audience to the readers who are confirmed at that moment.
The sender checks their subscription again before sending. Readers who unsubscribe
are skipped, and a later signup does not add them to an old newsletter.

Keep the page open while sending. Each request handles up to five recipients.
**Pause after this batch** or leaving the page stops subsequent batches; an
already-running request may finish. Reopen the saved newsletter and resume later.
Quota exhaustion pauses sending until you resume it after quota becomes available.
There is no background timer, scheduled send, or email triggered by a Git push.

The dashboard records accepted, queued, skipped, and uncertain results. “Sent”
means Google accepted the message, not that it reached an inbox. An interrupted
request can have delivered some emails. Refresh the status before resuming; rows
marked `sending` or `uncertain` are never retried automatically. Do not duplicate
a whole newsletter merely because a response timed out. A `preparing` campaign
with incomplete audience storage can be cancelled and recreated; no messages are
sent while preparing. The dashboard shows the latest 15 newsletters.

Use **Stop emails to an address** for bounces or direct unsubscribe requests.
This does not send a message. The script does not read your inbox, so bounce
handling is manual. Readers may sign up again only through fresh confirmation.
Use **Log out** when finished; the admin key is held only in the open page's memory.

## Personal Gmail limits

Google currently limits consumer Apps Script email to **100 recipients per day**,
with account quotas resetting 24 hours after the first request. This is stricter
than ordinary Gmail's separate sending limits. Other scripts on your account
share the Google allowance; Google may change quotas or restrict an account.

This implementation uses a rolling 24-hour cap of 90 send attempts and checks
`MailApp.getRemainingDailyQuota()` before sending. Newsletters leave five sends
within that cap available for confirmations/previews, so the initial dashboard
allowance is at most **85**, reduced by recent confirmation emails and previews.
Signup confirmation attempts also have a separate cap of 25 per day, a one-hour
cooldown per address, and at most three attempts per address per day. Signup
requests have per-network and global limits. Confirmation links expire in 48 hours.

There is a 500-record subscriber ceiling, including pending and unsubscribed
records. This is a small-list starting point: a list larger than the daily
allowance takes multiple days and manual resumes. Move to a dedicated sender
when that becomes inconvenient. Do not raise caps to work around Google's limits.

## Data and maintenance

- The private Sheet contains email addresses, subscription status and dates,
  hashed access tokens, drafts, and delivery records. `Record` JSON is authoritative;
  editing only a visible Status cell will not change a subscription. Use the dashboard.
- Do not publish the Sheet, install a public Sheets feed, or copy its records into
  the website repository. Export a private backup from Google Sheets when needed.
- Signup IPs are hashed using a server secret. Request-limit records older than
  two days and attempt records older than seven days are pruned on subsequent
  signup activity; subscriber and campaign records remain until removed.
- To honor a deletion request, stop sending first, then remove that subscriber's
  whole row and their matching subscriber-ID rows in Deliveries and Activity
  while no sending is underway. Do not run scripts or sends concurrently with
  manual maintenance. Retained private backups need separate handling.
- Keep `TOKEN_SECRET`, the Sheet ID, and the Sheet intact when updating code.
  After editing Apps Script, use **Manage deployments → Edit → New version** to
  update the existing `/exec` deployment. Saving editor code alone does not update it.
- Keep the shared secret and admin key different. Rotate a compromised admin key
  in the website environment, or rotate the shared secret in both places. Never
  put either in a URL, screenshot, support message, or public JavaScript.
- Newsletter token/admin pages are excluded from analytics and indexing. Emails
  have visible unsubscribe links and no open-tracking pixel. MailApp does not
  provide custom headers for Gmail's native one-click unsubscribe control.
- The existing contact form and Stripe download emails still use their existing
  Gmail SMTP configuration. This newsletter does not change those flows or
  automatically subscribe purchasers. Existing Substack readers are not imported.

## Checks

```sh
sh scripts/local.sh test
sh scripts/local.sh run typecheck
sh scripts/local.sh run build
```

The Google script is tested directly in an isolated runtime with mocked Google
services, including lost responses, confirmation expiry, suppression, quota pauses,
and duplicate prevention. Browser tests exercise signup, token pages, draft review,
and the existing website; they mock newsletter requests and send no real email.

## Google documentation

- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [MailApp: sending mail and reading remaining quota](https://developers.google.com/apps-script/reference/mail/mail-app)
- [Deploying Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [Content Service redirects](https://developers.google.com/apps-script/guides/content)
