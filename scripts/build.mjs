
import {mkdir,copyFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.cwd(),dest=join(root,'public');
await rm(dest,{recursive:true,force:true});await mkdir(dest,{recursive:true});
for(const file of await readdir(root)){
 if(file==='index.html'||/\.(?:png|jpe?g|webp|gif|svg|ico)$/i.test(file))await copyFile(join(root,file),join(dest,file));
}
for(const file of ['sw.js','manifest.webmanifest'])await copyFile(join(root,file),join(dest,file));
console.log('public assets prepared');


