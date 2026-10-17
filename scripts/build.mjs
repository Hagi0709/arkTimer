
import {mkdir,copyFile,readdir,unlink,lstat,readFile,writeFile} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(process.cwd()),dest=resolve(root,'public');
if(dirname(dest)!==root||basename(dest)!=='public')throw Error('Invalid asset directory');
const existing=await lstat(dest).catch(e=>{if(e.code!=='ENOENT')throw e});
if(existing?.isSymbolicLink())throw Error('Asset directory must not be a link');
// Keep the directory itself: Windows cannot remove it while wrangler dev watches it.
await mkdir(dest,{recursive:true});
const files=(await readdir(root)).filter(file=>file==='index.html'||/\.(?:png|jpe?g|webp|gif|svg|ico)$/i.test(file));
// index.html is the app entry point. app.js/style.css are legacy copies, not deployed.
files.push('sw.js','manifest.webmanifest','push-client.js','data-transfer.js');
for(const file of files)await copyFile(join(root,file),join(dest,file));
const digest=async file=>createHash('sha256').update(await readFile(join(root,file))).digest('hex');
let revision='unknown';
try{revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{}
const hashes={};
for(const file of ['index.html','push-client.js','data-transfer.js','sw.js','worker.js'])hashes[file]=await digest(file);
await writeFile(join(dest,'build-info.json'),JSON.stringify({revision,hashes},null,2)+'\n');
files.push('build-info.json');
for(const file of await readdir(dest)){
 if(files.includes(file))continue;
 const stale=join(dest,file),info=await lstat(stale);
 if(!info.isFile()||info.isSymbolicLink())throw Error('Unexpected entry in generated assets: '+file);
 await unlink(stale);
}
console.log('public assets prepared');


