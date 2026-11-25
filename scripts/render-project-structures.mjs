// Reproduce the checked-in posters from local PDB files; no AI-generated geometry.
// node scripts/render-project-structures.mjs (requires Playwright Chromium or CHROME_PATH).
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const structures = JSON.parse(
  await readFile(path.join(root, 'data/project-structures.json'), 'utf8')
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });
  await page.setContent(
    '<html><body style="margin:0;background:transparent"><div id="model" style="position:relative;width:600px;height:600px"></div></body></html>'
  );
  await page.addScriptTag({
    path: path.join(root, 'public/vendor/3dmol/3Dmol-3.0.0.min.js'),
  });
  for (const structure of Object.values(structures)) {
    const pdb = await readFile(
      path.join(root, 'public', structure.file),
      'utf8'
    );
    const uri = await page.evaluate(
      ({ structure, pdb }) => {
        const element = document.getElementById('model');
        const scene = window.$3Dmol.createViewer(element, {
          backgroundColor: '#06100c',
          backgroundAlpha: 0,
          antialias: true,
          cartoonQuality: 8,
          disableFog: true,
          nomouse: true,
        });
        scene.setProjection('orthographic');
        scene.addModel(pdb, 'pdb', { keepH: false });
        const chains = [
          ...new Set(
            pdb
              .split('\n')
              .filter((line) => line.startsWith('ATOM'))
              .map((line) => line[21])
          ),
        ];
        chains.forEach((chain, i) =>
          scene.setStyle(
            { chain },
            {
              cartoon: {
                color: structure.colors[i % structure.colors.length],
                thickness: 0.5,
                arrows: true,
              },
            }
          )
        );
        scene.zoomTo();
        scene.rotate(structure.rotateY, 'y');
        scene.rotate(structure.rotateX, 'x');
        scene.zoom(structure.zoom);
        scene.render();
        const uri = element
          .querySelector('canvas')
          .toDataURL('image/webp', 0.94);
        scene.destroy();
        element.replaceChildren();
        return uri;
      },
      { structure, pdb }
    );
    const output = path.join(root, 'public', structure.poster);
    await mkdir(path.dirname(output), { recursive: true });
    const bytes = Buffer.from(uri.split(',')[1], 'base64');
    await writeFile(output, bytes);
    console.log(
      `${structure.pdb}: ${bytes.length} bytes → ${structure.poster}`
    );
  }
} finally {
  await browser.close();
}
