import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getAllPosts } from '../lib/posts';
import { getAllGuides } from '../lib/guides';
import { prepareArticle } from '../lib/article';
test('every published essay and guide has distinct metadata and an existing share image',()=>{
  const titles=new Set();
  for (const [kind,items] of [['posts',getAllPosts()],['guides',getAllGuides()]] as const) for (const item of items) {assert.ok(item.seoTitle);assert.ok(item.description.length>60);assert.ok(item.description.length<200);assert.ok(!titles.has(item.seoTitle));titles.add(item.seoTitle);assert.ok(fs.existsSync(`public/images/social/${kind}-${item.slug}.png`));}
});
test('article headings get stable unique anchors; fenced code is not included',async()=>{
  const result=await prepareArticle('# One\n\n## One\n\n### Detail\n\n```text\n## Not a heading\n```\n\n## Final');
  assert.deepEqual(result.headings,[{id:'one',label:'One'},{id:'one-1',label:'One'},{id:'final',label:'Final'}]);assert.equal(result.readingMinutes,1);
});
test('public tree contains no paid documents or full private essay text',()=>{
  function walk(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  const files=walk('public');assert.ok(!files.some(p=>/statement.of.purpose|personal.statement|PhD_Application_Essays|Pramesh_Sharma_PhD_Essays/.test(p)));
  const needle='I received a travel grant to attend St. Jude';
  for (const file of files) assert.ok(!fs.readFileSync(file).includes(Buffer.from(needle)),file);
  assert.ok(fs.readFileSync('.gitignore','utf8').includes('/private-products/'));
});
