const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

async function start(env) {
  const child=spawn(process.execPath,['-e',"const server=require('./server').listen(0,'127.0.0.1',()=>console.log(server.address().port));"],{
    cwd:path.join(__dirname,'..'),env:{...process.env,DATABASE_URL:'',POSTGRES_URL:'',VERCEL:'',ADMIN_PASSWORD:'',...env},stdio:['ignore','pipe','inherit']
  });
  const [data]=await once(child.stdout,'data');
  const base='http://127.0.0.1:'+String(data).trim();
  return {request:async (route,method='GET',body,password)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',...(password?{Authorization:'Bearer '+encodeURIComponent(password)}:{})},body:body===undefined?undefined:JSON.stringify(body)}),stop:async()=>{const exited=once(child,'exit');child.kill();await exited;}};
}

test('local routes, concurrent orders, persistence and checkout',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-test-'));
  const file=path.join(dir,'orders.json');
  let app=await start({ORDER_DB:file});
  try {
    assert.equal((await app.request('/')).status,200);
    assert.match(await (await app.request('/app.js')).text(),/syncOrders/);
    assert.equal((await (await app.request('/api/menu')).json()).length,55);
    const body={table:1,requestId:'same-request',items:[{id:'1',qty:2,note:'Ít cay'}]};
    const repeated=await Promise.all(Array.from({length:8},()=>app.request('/api/orders','POST',body).then(r=>r.json())));
    assert.equal(new Set(repeated.map(o=>o.id)).size,1);
    const id=repeated[0].id;
    assert.equal(repeated[0].items[0].price,179000);
    await Promise.all(Array.from({length:5},(_,i)=>app.request('/api/orders','POST',{...body,requestId:'unique-'+i})));
    assert.equal((await (await app.request('/api/orders')).json()).length,6);
    assert.equal((await app.request('/api/checkout','POST',{ids:[id]})).status,200);
    assert.equal((await app.request('/api/orders','POST',{...body,requestId:'invalid',items:[null]})).status,400);
    await app.stop();app=await start({ORDER_DB:file});
    const response=await app.request('/api/orders');assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await response.json()).length,5);
    const persisted=JSON.parse(fs.readFileSync(file,'utf8')).orders;assert.equal(persisted.length,6);
    assert.equal(persisted.find(o=>o.id===id).paid,true);
  }finally{await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('Vercel without a database serves menu but never pretends to save orders',async()=>{
  const app=await start({VERCEL:'1'});
  try{
    assert.equal((await app.request('/')).status,200);
    assert.equal((await (await app.request('/api/menu')).json()).length,55);
    const response=await app.request('/api/orders');assert.equal(response.status,503);
    assert.match((await response.json()).error,/DATABASE_URL/);
    assert.equal((await app.request('/api/orders','POST',{table:1,requestId:'cloud',items:[{id:'1',qty:1,note:''}]})).status,503);
  }finally{await app.stop();}
});

test('admin authorization, catalog, photos, table management and price snapshots',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-admin-')),file=path.join(dir,'orders.json');
 const password='test-admin-only-12345';let app=await start({ORDER_DB:file,ADMIN_PASSWORD:password});
 const admin=(route,method='GET',body)=>app.request('/api/admin'+route,method,body,password);
 try{
   assert.equal((await app.request('/admin')).status,200);
   assert.equal((await app.request('/admin/')).status,200);
   for(const route of ['/catalog','/reports'])assert.equal((await app.request('/api/admin'+route)).status,401);
   assert.equal((await app.request('/api/admin/tables','POST',{number:13})).status,401);
   assert.equal((await admin('/session','POST')).status,200);
   assert.equal((await admin('/tables','POST',{number:13})).status,201);
   assert.equal((await admin('/tables','POST',{number:13})).status,409);
   assert.equal((await admin('/tables','POST',{number:0})).status,400);
   assert.equal((await admin('/images','POST',{data:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
   const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
   const image=await (await admin('/images','POST',{data:png})).json();
   assert.equal((await app.request(image.url)).headers.get('content-type'),'image/png');
   const dish={name:'Món thử',category:'MÓN MỚI',price:45000,unit:'/ phần',details:['Ghi chú thử'],image:image.url};
   const created=await (await admin('/menu','POST',dish)).json();assert.ok(created.id);
   assert.equal((await admin('/menu','POST',{...dish,price:-1})).status,400);
   const orderBody={table:13,requestId:'snapshot',items:[{id:created.id,qty:2,note:'',price:45000}]};
   const order=await (await app.request('/api/orders','POST',orderBody)).json();
   assert.equal((await admin('/tables/13','DELETE')).status,409);
   assert.equal((await admin('/menu/'+created.id,'PUT',{...dish,price:55000})).status,200);
   const stale=await app.request('/api/orders','POST',{...orderBody,requestId:'stale'});assert.equal(stale.status,409);
   assert.equal((await app.request('/api/checkout','POST',{ids:[order.id]})).status,200);
   assert.deepEqual(await (await app.request('/api/orders')).json(),[]);
   const before=JSON.parse(fs.readFileSync(file,'utf8')).orders;assert.equal(before[0].items[0].price,45000);
   const report=await (await admin('/reports?period=day')).json();assert.equal(report.revenue,90000);assert.equal(report.payments,1);
   assert.equal((await admin('/menu/'+created.id,'DELETE')).status,200);
   assert.equal((await app.request('/api/orders','POST',{...orderBody,requestId:'removed'})).status,400);
   assert.equal((await app.request('/api/orders','POST',orderBody)).status,200); // Retry still returns the accepted original.
   assert.equal((await admin('/tables/13','DELETE')).status,200);
   await app.stop();app=await start({ORDER_DB:file,ADMIN_PASSWORD:password});
   const catalog=await (await app.request('/api/catalog')).json();assert.ok(!catalog.menu.some(d=>d.id===created.id));assert.ok(!catalog.tables.includes(13));
   assert.equal((await app.request(image.url)).status,200);
   assert.equal((await (await admin('/reports?period=day')).json()).revenue,90000);
 }finally{
   await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);
   const images=path.join(dir,'images');if(fs.existsSync(images)){for(const name of fs.readdirSync(images))fs.unlinkSync(path.join(images,name));fs.rmdirSync(images);}fs.rmdirSync(dir);
 }
});

test('legacy local order arrays remain readable after catalog edits',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-legacy-')),file=path.join(dir,'orders.json');
 const legacy=[{id:'old',table:1,items:[{id:'1',qty:1,price:179000,name:'Combo Lẩu 1'}],paid:true,paidAt:'2026-09-10T01:00:00Z'}];
 fs.writeFileSync(file,JSON.stringify(legacy));const password='test-admin-only-12345',app=await start({ORDER_DB:file,ADMIN_PASSWORD:password});
 try{assert.equal((await app.request('/api/admin/tables','POST',{number:20},password)).status,201);assert.deepEqual(JSON.parse(fs.readFileSync(file)).orders,legacy);assert.equal(JSON.parse(fs.readFileSync(file)).catalog.tables.at(-1),20);}
 finally{await app.stop();fs.unlinkSync(file);fs.rmdirSync(dir);}
});
