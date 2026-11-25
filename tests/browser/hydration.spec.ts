import { test, expect } from '@playwright/test';

test('RfaH fallback hydrates cleanly and keeps an accessible title for both folds', async ({ page }) => {
  const hydrationErrors: string[] = [];
  const capture = (message: string) => {
    if (/hydrat|server rendered HTML|Minified React error #(418|422|423|425)/i.test(message)) {
      hydrationErrors.push(message);
    }
  };
  page.on('pageerror', error => capture(error.message));
  page.on('console', message => { if (message.type() === 'error') capture(message.text()); });
  // Keep the server-rendered SVG visible after hydration, including when WebGL is unavailable.
  await page.route('**/vendor/3dmol/**', route => route.abort());
  await page.goto('/');
  const figure = page.locator('figure[data-fold]');
  await expect(figure).toHaveAttribute('data-viewer', 'fallback');
  expect(hydrationErrors).toEqual([]);
  const preview = figure.locator('svg');
  await expect(preview).toHaveAccessibleName('RfaH α-helical hairpin: backbone trace from 2OUG');
  await page.getByRole('button', { name: /β-Barrel State/ }).click();
  await expect(preview).toHaveAccessibleName('RfaH β-barrel: backbone trace from 2LCL');
  await page.getByRole('button', { name: /α-Helical State/ }).click();
  await expect(preview).toHaveAccessibleName('RfaH α-helical hairpin: backbone trace from 2OUG');
  await page.reload();
  await expect(figure).toHaveAttribute('data-viewer', 'fallback');
  await expect(preview).toHaveAccessibleName('RfaH α-helical hairpin: backbone trace from 2OUG');
  expect(hydrationErrors).toEqual([]);
});
