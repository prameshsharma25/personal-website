// Run locally after connecting Robinhood in SnapTrade's own dashboard.
// This script prints account IDs for configuration; it never prints credentials.
import { portfolioAccounts, snapTradeRead } from '../lib/portfolio-server';

async function main() {
  const accounts = portfolioAccounts(
    await snapTradeRead('/accounts', process.env)
  );
  if (!accounts.length) {
    console.log(
      'No investment accounts found. Finish the Robinhood connection in SnapTrade first.'
    );
    return;
  }
  console.log(
    'Select your Robinhood investment account. Keep these IDs private.'
  );
  for (const account of accounts)
    console.log(`${account.label}: SNAPTRADE_ACCOUNT_ID=${account.id}`);
}
main().catch(() => {
  console.error(
    'Could not list accounts. Check your Personal API credentials and connection in SnapTrade. No credentials or provider response have been printed.'
  );
  process.exitCode = 1;
});
