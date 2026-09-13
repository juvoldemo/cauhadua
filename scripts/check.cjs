const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
for(const file of ['staff-auth.js','server.js','order-store.js','catalog.js','admin-api.js','reports.js','public/app.js','public/admin.js','public/receipt.js','public/usb-printer.js']){
 const result=spawnSync(process.execPath,['--input-type='+ (file.startsWith('public/')?'module':'commonjs'),'--check'],{input:fs.readFileSync(file),encoding:'utf8'});
 if(result.status!==0){console.error(file+'\n'+result.stderr);process.exit(1);}
}
console.log('JavaScript syntax: OK');
