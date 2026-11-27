// Run locally after connecting Robinhood in SnapTrade's own dashboard.
// This script prints account IDs for configuration; it never prints credentials.
import { snapTradeRead } from '../lib/portfolio-server';

async function main() {
  const data = (await snapTradeRead('/accounts', process.env)) as {
    results?: {
      id: string;
      kind: string;
      is_paper?: boolean;
      display_name?: string;
    }[];
  };
  if (!Array.isArray(data.results)) throw new Error('No account list');
  const accounts = data.results.filter(
    (account) => account.kind === 'investment' && account.is_paper === false
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
    console.log(
      `${account.display_name || 'Investment Account'}: SNAPTRADE_ACCOUNT_ID=${account.id}`
    );
}
main().catch(() => {
  console.error(
    'Could not list accounts. Check your Personal API credentials and connection in SnapTrade. No credentials or provider response have been printed.'
  );
  process.exitCode = 1;
});
