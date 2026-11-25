import { readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
async function main() {
  const bytes=await readFile('private-products/Pramesh_Sharma_PhD_Essays.zip');
  const blob=await put('products/phd-essays/v1.zip',bytes,{access:'private',addRandomSuffix:true,contentType:'application/zip'});
  console.log('Set ESSAY_BUNDLE_BLOB_URL to this private storage URL:');console.log(blob.url);
}
main().catch(()=>{console.error('Upload failed. Check private-store access and the local bundle file.');process.exitCode=1;});
