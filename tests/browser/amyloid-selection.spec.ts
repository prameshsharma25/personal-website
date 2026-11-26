import { test, expect } from '@playwright/test';

for (const mode of ['device', 'server']) {
  for (const latest of ['example', 'clear']) {
    test(`${mode} preview cannot replace a later ${latest} selection`, async ({
      page,
    }) => {
      await page.route('**/api/amyloid-config', (route) =>
        route.fulfill({
          json: { enabled: true, url: 'http://127.0.0.1:18001' },
        })
      );
      await page.route('**/health', (route) =>
        route.fulfill({
          json: {
            max_files: 125,
            max_file_bytes: 26214400,
            max_total_bytes: 104857600,
            retention_hours: 24,
          },
        })
      );
      await page.goto('/tools/amyloid-inspector');
      if (mode === 'server') {
        await page
          .getByRole('button', { name: 'Server Analysis', exact: true })
          .click();
      }
      const panel = page.getByRole('region', {
        name:
          mode === 'device'
            ? 'On-Device Analysis'
            : 'Analyze Uploaded Structures',
        exact: true,
      });
      await expect(
        panel.getByLabel('Choose Structures', { exact: true })
      ).toBeEnabled();
      // Hold the original upload's integrity check while the reader chooses
      // something else. Real hashing and report verification still run.
      await page.evaluate(() => {
        const original = crypto.subtle.digest.bind(crypto.subtle);
        let held = false;
        crypto.subtle.digest = async (...args) => {
          const result = await original(...args);
          if (!held) {
            held = true;
            await new Promise<void>((resolve) => {
              (window as any).__releasePreview = resolve;
            });
            (window as any).__previewReleased = true;
          }
          return result;
        };
      });
      await panel
        .getByLabel('Choose Structures', { exact: true })
        .setInputFiles('public/tools/amyloid-example/2beg.pdb');
      await page.waitForFunction(
        () => typeof (window as any).__releasePreview === 'function'
      );
      await page
        .getByRole('button', { name: '6QJH / Geometry Warning ↗', exact: true })
        .click();
      const example = page.getByText(
        '6qjh-Boltz2-pdb-coord-balanced25-rank-001',
        { exact: true }
      );
      await expect(example).toBeVisible();
      if (latest === 'clear')
        await page
          .getByRole('button', { name: 'Clear Files', exact: true })
          .click();
      await page.evaluate(() => (window as any).__releasePreview());
      await page.waitForFunction(() => (window as any).__previewReleased);
      // Allow the queued React update from the resolved digest to commit.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
      );
      await expect(
        page.getByText('Structure Only', { exact: true })
      ).toHaveCount(0);
      if (latest === 'example') await expect(example).toBeVisible();
      else
        await expect(
          page.getByRole('region', {
            name: 'Structure Inspection',
            exact: true,
          })
        ).toHaveCount(0);
    });
  }
}
