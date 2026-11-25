/* Pramesh Sharma's small-list newsletter. Deploy as the owning Google account.
 * Run setupNewsletter once after setting SHARED_SECRET and PUBLIC_SITE_URL.
 * No function in setup sends email. See docs/GMAIL_NEWSLETTER_SETUP.md.
 */
var TABLES = ['Subscribers', 'Campaigns', 'Deliveries', 'Activity', 'RateLimits'];
var DAY = 24 * 60 * 60 * 1000;
var MAX_SUBSCRIBERS = 500;
var APP_DAILY_CAP = 90; // Personal Gmail Apps Script quota is currently 100 recipients/day.
var CONFIRMATION_DAILY_CAP = 25;
var BULK_RESERVE = 5;

function setupNewsletter() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN_SECRET')) props.setProperty('TOKEN_SECRET', uuid_() + uuid_() + uuid_());
  if (!props.getProperty('SPREADSHEET_ID')) {
    var book = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('Pramesh Sharma newsletter');
    props.setProperty('SPREADSHEET_ID', book.getId());
  }
  var config = settings_();
  var book = SpreadsheetApp.openById(config.spreadsheet);
  TABLES.forEach(function(name) {
    var sheet = book.getSheetByName(name) || book.insertSheet(name);
    if (!sheet.getLastRow()) {
      sheet.appendRow(['ID', 'Label', 'Status', 'Record (managed by the website)']);
      sheet.setFrozenRows(1);
    }
  });
  // Prompts for send permission, but does not send a message.
  MailApp.getRemainingDailyQuota();
  return 'Ready. Keep this spreadsheet private. Deploy the script as a web app next.';
}

function doGet() { return json_({ ok: false, error: 'method' }); }
function doPost(event) {
  var lock;
  try {
    var raw = event && event.postData && event.postData.contents;
    if (!raw || raw.length > 40000) fail_('invalid');
    var request = JSON.parse(raw), config = settings_();
    if (!equal_(String(request.secret || ''), config.secret) || request.origin !== config.origin) fail_('unauthorized');
    var actions = { subscribe: subscribe_, confirm: confirm_, unsubscribe: unsubscribe_, overview: overview_, saveDraft: saveDraft_, sendTest: sendTest_, approveCampaign: approveCampaign_, sendBatch: sendBatch_, cancelCampaign: cancelCampaign_, suppressSubscriber: suppressSubscriber_ };
    if (!Object.prototype.hasOwnProperty.call(actions, request.action)) fail_('invalid');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(4000)) fail_('busy');
    var result = actions[request.action](request.payload || {}, config);
    return json_({ ok: true, result: result });
  } catch (error) {
    return json_({ ok: false, error: error.newsletterCode || 'service' });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

function settings_() {
  var p = PropertiesService.getScriptProperties(), origin = p.getProperty('PUBLIC_SITE_URL') || '';
  if (!/^https:\/\/[^\s/?#@]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) fail_('config');
  var config = { origin: origin, secret: p.getProperty('SHARED_SECRET') || '', tokenSecret: p.getProperty('TOKEN_SECRET') || '', spreadsheet: p.getProperty('SPREADSHEET_ID') || '', address: p.getProperty('SENDER_POSTAL_ADDRESS') || '', sender: Session.getEffectiveUser().getEmail() };
  if (config.secret.length < 32 || config.tokenSecret.length < 32 || !config.spreadsheet || !email_(config.sender)) fail_('config');
  return config;
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code) { var error = new Error(code); error.newsletterCode = code; throw error; }
function uuid_() { return Utilities.getUuid().replace(/-/g, ''); }
function now_() { return new Date().toISOString(); }
function hash_(text) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)).replace(/=+$/, ''); }
function equal_(left, right) { var a = hash_(left), b = hash_(right), result = 0; for (var i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
function token_(id, config) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('unsubscribe:' + id, config.tokenSecret)).replace(/=+$/, ''); }
function email_(text) { return typeof text === 'string' && text.length <= 254 && /^[^\s@<>\x00-\x1f\x7f,;]+@[^\s@<>\x00-\x1f\x7f,;]+\.[^\s@<>\x00-\x1f\x7f,;]+$/.test(text); }
function validToken_(text) { return typeof text === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(text); }
function escape_(text) { return String(text).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sheet_(name) { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')).getSheetByName(name); }
function records_(name) {
  var sheet = sheet_(name), count = sheet.getLastRow() - 1;
  if (count <= 0) return [];
  return sheet.getRange(2, 1, count, 4).getValues().map(function(row, index) {
    var item = JSON.parse(row[3]); item._row = index + 2; return item;
  });
}
function cells_(item) {
  var data = Object.assign({}, item); delete data._row;
  var label = String(item.email || item.subject || item.kind || '');
  if (/^[=+\-@\t\r]/.test(label)) label = "'" + label;
  // JSON is authoritative. User text cannot become a spreadsheet formula.
  return [item.id, label, item.status || '', JSON.stringify(data)];
}
function save_(name, item) {
  var sheet = sheet_(name);
  if (item._row) sheet.getRange(item._row, 1, 1, 4).setValues([cells_(item)]);
  else { item._row = sheet.getLastRow() + 1; sheet.appendRow(cells_(item)); }
  return item;
}
function appendMany_(name, items) {
  if (!items.length) return;
  var sheet = sheet_(name); sheet.getRange(sheet.getLastRow() + 1, 1, items.length, 4).setValues(items.map(cells_));
}
function prune_(name, age) {
  var cutoff = Date.now() - age;
  records_(name).filter(function(item) { return Date.parse(item.at) < cutoff; }).reverse().forEach(function(item) { sheet_(name).deleteRow(item._row); });
}
function quota_(bulk) {
  var used = records_('Activity').filter(function(item) { return Date.parse(item.at) > Date.now() - DAY; }).length;
  return Math.max(0, Math.min(APP_DAILY_CAP - used - (bulk ? BULK_RESERVE : 0), MailApp.getRemainingDailyQuota() - (bulk ? BULK_RESERVE : 0)));
}
function send_(to, subject, text, html, kind, subscriberId) {
  if (quota_(kind === 'campaign') < 1) fail_('quota');
  var attempt = save_('Activity', { id: uuid_(), kind: kind, subscriberId: subscriberId || '', at: now_(), status: 'reserved' });
  SpreadsheetApp.flush();
  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html, name: 'Pramesh Sharma' });
    attempt.status = 'accepted'; save_('Activity', attempt);
  } catch (error) {
    attempt.status = 'uncertain'; save_('Activity', attempt);
    fail_('service'); // An ambiguous send is never retried automatically.
  }
}
function rate_(key, limit, windowMs) {
  var id = hash_(key), item = records_('RateLimits').find(function(row) { return row.id === id; });
  if (!item || Date.parse(item.at) <= Date.now() - windowMs) item = Object.assign(item || { id: id }, { at: now_(), count: 0 });
  if (item.count >= limit) fail_('rate');
  item.count++; save_('RateLimits', item);
}
function subscribe_(input, config) {
  if (!email_(input.email) || !/^[a-f0-9]{64}$/.test(input.ipHash || '')) fail_('invalid');
  prune_('RateLimits', 2 * DAY); prune_('Activity', 7 * DAY);
  rate_('signup-ip:' + input.ipHash, 5, 60 * 60 * 1000);
  rate_('signup-global', 200, DAY);
  var email = input.email.trim().toLowerCase(), subscribers = records_('Subscribers');
  var person = subscribers.find(function(row) { return row.email === email; });
  if (person && person.status === 'confirmed') return { accepted: true };
  if (person && Date.parse(person.lastConfirmationAt || '') > Date.now() - 60 * 60 * 1000) return { accepted: true };
  var confirmations = records_('Activity').filter(function(row) { return row.kind === 'confirmation' && Date.parse(row.at) > Date.now() - DAY; });
  if (person && confirmations.filter(function(row) { return row.subscriberId === person.id; }).length >= 3) return { accepted: true };
  if (confirmations.length >= CONFIRMATION_DAILY_CAP || quota_(false) < 1) fail_('quota');
  if (!person && subscribers.length >= MAX_SUBSCRIBERS) fail_('quota');
  var token = uuid_() + uuid_();
  person = person || { id: uuid_(), email: email, createdAt: now_() };
  person.status = 'pending'; person.confirmedAt = ''; person.lastConfirmationAt = now_();
  person.confirmationHash = hash_(token); person.confirmationExpiresAt = new Date(Date.now() + 2 * DAY).toISOString();
  person.unsubscribeHash = hash_(token_(person.id, config)); person.source = String(input.source || 'website').slice(0, 80);
  person.consentVersion = 'newsletter-v1'; save_('Subscribers', person); SpreadsheetApp.flush();
  var url = config.origin + '/newsletter/confirm#token=' + encodeURIComponent(token);
  var text = 'Confirm your subscription to Pramesh Sharma’s newsletter:\n\n' + url + '\n\nI share research updates and new posts from prameshsharma.com. This link expires in 48 hours. If you did not request it, ignore this email and you will not be subscribed.';
  send_(email, 'Confirm your subscription — Pramesh Sharma', text, '<p>Thanks for signing up.</p><p><a href="' + escape_(url) + '">Confirm your subscription</a></p><p>I share research updates and new posts from prameshsharma.com.</p><p>This link expires in 48 hours. If you did not request it, ignore this email. You will not be subscribed.</p>', 'confirmation', person.id);
  return { accepted: true };
}
function confirm_(input) {
  if (!validToken_(input.token)) fail_('token');
  var person = records_('Subscribers').find(function(row) { return row.confirmationHash === hash_(input.token); });
  if (!person || person.status === 'unsubscribed') fail_('token');
  if (person.status === 'confirmed') return { confirmed: true };
  if (Date.parse(person.confirmationExpiresAt) < Date.now()) fail_('token');
  person.status = 'confirmed'; person.confirmedAt = now_(); save_('Subscribers', person);
  return { confirmed: true };
}
function unsubscribe_(input) {
  if (!validToken_(input.token)) fail_('token');
  var person = records_('Subscribers').find(function(row) { return row.unsubscribeHash === hash_(input.token); });
  if (!person) fail_('token');
  person.status = 'unsubscribed'; person.unsubscribedAt = now_(); person.confirmationHash = '';
  save_('Subscribers', person); return { unsubscribed: true };
}
function suppressSubscriber_(input, config) {
  var email = String(input.email || '').trim().toLowerCase();
  if (!email_(email)) fail_('invalid');
  var person = records_('Subscribers').find(function(row) { return row.email === email; });
  if (person) {
    person.status = 'unsubscribed'; person.unsubscribedAt = now_(); person.confirmationHash = '';
    save_('Subscribers', person);
  }
  return overview_({}, config);
}
function campaign_(id) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) fail_('invalid');
  var item = records_('Campaigns').find(function(row) { return row.id === id; });
  if (!item) fail_('invalid'); return item;
}
function summary_(campaign, deliveries) {
  var rows = deliveries.filter(function(row) { return row.campaignId === campaign.id; });
  var count = function(status) { return rows.filter(function(row) { return row.status === status; }).length; };
  return { id: campaign.id, subject: campaign.subject, body: campaign.body, articleUrl: campaign.articleUrl, status: campaign.status, createdAt: campaign.createdAt, total: campaign.total || 0, queued: count('queued'), sent: count('sent'), skipped: count('skipped') + count('cancelled'), uncertain: count('sending') + count('uncertain') };
}
function overview_(input, config) {
  var people = records_('Subscribers'), deliveries = records_('Deliveries');
  return { sender: config.sender, senderAddress: config.address, footerReady: Boolean(config.address.trim()), confirmed: people.filter(function(p) { return p.status === 'confirmed'; }).length, pending: people.filter(function(p) { return p.status === 'pending'; }).length, unsubscribed: people.filter(function(p) { return p.status === 'unsubscribed'; }).length, available: quota_(true), campaigns: records_('Campaigns').reverse().slice(0, 15).map(function(c) { return summary_(c, deliveries); }) };
}
function saveDraft_(input, config) {
  if (typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.id) || typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 120 || /[\r\n]/.test(input.subject) || typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000) fail_('invalid');
  var url = String(input.articleUrl || '').trim();
  if (url && (!(url === config.origin || url.indexOf(config.origin + '/') === 0) || /[\s<>"']/.test(url) || url.length > 2000)) fail_('invalid');
  var campaign = records_('Campaigns').find(function(row) { return row.id === input.id; });
  if (campaign && campaign.status !== 'draft') fail_('state');
  campaign = campaign || { id: input.id, status: 'draft', createdAt: now_(), total: 0 };
  campaign.subject = input.subject.trim(); campaign.body = input.body.trim(); campaign.articleUrl = url;
  save_('Campaigns', campaign); return overview_({}, config);
}
function message_(campaign, unsubscribeUrl, config) {
  var footer = 'Pramesh Sharma\n' + config.address + '\nYou received this because you confirmed your subscription at ' + config.origin + '.\nUnsubscribe: ' + unsubscribeUrl;
  var text = campaign.body + (campaign.articleUrl ? '\n\nRead the post: ' + campaign.articleUrl : '') + '\n\n—\n' + footer;
  var html = '<div style="max-width:640px;margin:auto;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#20362b">' + campaign.body.split(/\n\s*\n/).map(function(p) { return '<p>' + escape_(p).replace(/\n/g, '<br>') + '</p>'; }).join('') + (campaign.articleUrl ? '<p><a href="' + escape_(campaign.articleUrl) + '">Read the post →</a></p>' : '') + '<hr><p style="font-size:12px">Pramesh Sharma<br>' + escape_(config.address).replace(/\n/g, '<br>') + '<br>You subscribed at ' + escape_(config.origin) + '.<br><a href="' + escape_(unsubscribeUrl) + '">Unsubscribe</a></p></div>';
  return { text: text, html: html };
}
function sendTest_(input, config) {
  var campaign = campaign_(input.id);
  if (campaign.status !== 'draft') fail_('state');
  if (!config.address.trim()) fail_('footer');
  if (Date.parse(campaign.lastTestAt || '') > Date.now() - 120000) fail_('rate');
  campaign.lastTestAt = now_(); save_('Campaigns', campaign); SpreadsheetApp.flush();
  var message = message_(campaign, config.origin + '/newsletter', config);
  send_(config.sender, '[Preview] ' + campaign.subject, 'This preview goes only to you. Its unsubscribe link opens the signup page.\n\n' + message.text, '<p><strong>Preview for you only. The unsubscribe link opens the signup page.</strong></p>' + message.html, 'test');
  return overview_({}, config);
}
function snapshotHash_(rows) { return hash_(rows.map(function(row) { return row.subscriberId + ':' + row.confirmedAt; }).sort().join('|')); }
function approveCampaign_(input, config) {
  var campaign = campaign_(input.id);
  if (!config.address.trim()) fail_('footer');
  if (['queued', 'complete', 'review'].indexOf(campaign.status) >= 0) return overview_({}, config);
  if (campaign.status === 'preparing') {
    var existing = records_('Deliveries').filter(function(row) { return row.campaignId === campaign.id; });
    if (existing.length !== campaign.total || snapshotHash_(existing) !== campaign.snapshotHash) fail_('state');
  } else {
    if (campaign.status !== 'draft') fail_('state');
    var audience = records_('Subscribers').filter(function(row) { return row.status === 'confirmed'; });
    if (!audience.length) fail_('invalid');
    var deliveries = audience.map(function(person) { return { id: campaign.id + ':' + person.id, campaignId: campaign.id, subscriberId: person.id, confirmedAt: person.confirmedAt, status: 'queued' }; });
    campaign.total = deliveries.length; campaign.status = 'preparing'; campaign.approvedAt = now_(); campaign.snapshotHash = snapshotHash_(deliveries);
    save_('Campaigns', campaign); SpreadsheetApp.flush();
    appendMany_('Deliveries', deliveries); SpreadsheetApp.flush();
  }
  campaign.status = 'queued'; save_('Campaigns', campaign); return overview_({}, config);
}
function sendBatch_(input, config) {
  var campaign = campaign_(input.id);
  if (['complete', 'review', 'cancelled'].indexOf(campaign.status) >= 0) return overview_({}, config);
  if (campaign.status !== 'queued') fail_('state');
  if (!config.address.trim()) fail_('footer');
  var people = records_('Subscribers'), started = Date.now();
  var deliveries = records_('Deliveries').filter(function(row) { return row.campaignId === campaign.id && row.status === 'queued'; }).slice(0, 5);
  for (var i = 0; i < deliveries.length; i++) {
    if (Date.now() - started > 20000 || quota_(true) < 1) break;
    var delivery = deliveries[i], person = people.find(function(row) { return row.id === delivery.subscriberId; });
    // Recheck consent at send time. A later re-subscription does not rejoin old campaigns.
    if (!person || person.status !== 'confirmed' || person.confirmedAt !== delivery.confirmedAt) { delivery.status = 'skipped'; save_('Deliveries', delivery); continue; }
    delivery.status = 'sending'; delivery.at = now_(); save_('Deliveries', delivery); SpreadsheetApp.flush();
    var message = message_(campaign, config.origin + '/newsletter/unsubscribe#token=' + encodeURIComponent(token_(person.id, config)), config);
    try { send_(person.email, campaign.subject, message.text, message.html, 'campaign', person.id); delivery.status = 'sent'; }
    catch (error) { delivery.status = 'uncertain'; save_('Deliveries', delivery); break; }
    save_('Deliveries', delivery);
  }
  var summary = summary_(campaign, records_('Deliveries'));
  if (!summary.queued) { campaign.status = summary.uncertain ? 'review' : 'complete'; save_('Campaigns', campaign); }
  return overview_({}, config);
}
function cancelCampaign_(input, config) {
  var campaign = campaign_(input.id);
  records_('Deliveries').filter(function(row) { return row.campaignId === campaign.id && row.status === 'queued'; }).forEach(function(row) { row.status = 'cancelled'; save_('Deliveries', row); });
  campaign.status = 'cancelled'; save_('Campaigns', campaign); return overview_({}, config);
}
