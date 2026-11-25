import { test, expect } from '@playwright/test';

test('UC essay is free and the paid edition has no public download or hidden commentary', async ({ page, request }) => {
  const response = await page.goto('/mentorship/college-essay');
  const html = await response!.text();
  await expect(page.getByRole('heading', { name: 'The Full Essay' })).toBeVisible();
  await expect(page.getByText('Computer Science became my new track', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why I Wrote It This Way' })).toBeAttached();
  await expect(page.getByText('Paid Edition Coming Soon', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Get The Annotations/ })).toHaveAttribute('href', 'https://pramesh6.gumroad.com/l/uc-essay-annotations');
  for (const section of ['What Worked', 'Structure & Themes', 'Writing Lessons & Takeaways']) {
    expect(html).not.toContain(section);
    expect(await page.locator('#__NEXT_DATA__').textContent()).not.toContain(section);
  }
  const buildId = await page.evaluate(() => JSON.parse(document.querySelector('#__NEXT_DATA__')!.textContent!).buildId);
  const data = await request.get(`/_next/data/${buildId}/mentorship/college-essay.json`);
  expect(data.status()).toBe(200);
  expect((await data.json()).pageProps.headings.map((heading: { label: string }) => heading.label)).toEqual(['The Full Essay']);
  for (const path of ['/private-products/uc-essay-annotations/UC_Essay_Annotated_Edition.pdf', '/downloads/UC_Essay_Annotated_Edition.pdf']) {
    expect((await request.get(path)).status()).toBe(404);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: 'Why I Wrote It This Way' }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.local/uc-annotations-mobile.png', fullPage: true, animations: 'disabled' });
});
