const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

async function start(env, authenticate=true) {
  const child=spawn(process.execPath,['-e',"const server=require('./server').listen(0,'127.0.0.1',()=>console.log(server.address().port));"],{
    cwd:path.join(__dirname,'..'),env:{...process.env,DATABASE_URL:'',POSTGRES_URL:'',VERCEL:'',ADMIN_PASSWORD:'test-setup-admin',...env},stdio:['ignore','pipe','inherit']
  });
  const [data]=await once(child.stdout,'data');
  const base='http://127.0.0.1:'+String(data).trim();
  let cookie='';
  if(authenticate&&!env.VERCEL){
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+encodeURIComponent(env.ADMIN_PASSWORD||'test-setup-admin')};
    await fetch(base+'/api/admin/employees',{method:'POST',headers,body:JSON.stringify({name:'Test Staff',code:'000123456789'})});
    const login=await fetch(base+'/api/staff/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'000123456789'})});
    cookie=login.headers.get('set-cookie')?.split(';')[0]||'';
  }
  return {base,request:async (route,method='GET',body,password)=>fetch(base+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...(password?{Authorization:'Bearer '+encodeURIComponent(password)}:{})},body:body===undefined?undefined:JSON.stringify(body)}),stop:async()=>{const exited=once(child,'exit');child.kill();await exited;}};
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
    const history=await (await app.request('/api/admin/orders','GET',undefined,'test-setup-admin')).json();
    assert.equal(history.length,6);assert.equal(history.find(o=>o.id===id).paid,true);assert.ok(history.find(o=>o.id===id).paidAt);assert.ok(history.find(o=>o.id===id).paymentId);
    const persisted=JSON.parse(fs.readFileSync(file,'utf8')).orders;assert.equal(persisted.length,6);
    assert.equal(persisted.find(o=>o.id===id).paid,true);
  }finally{await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('quantity edits persist, preserve item snapshots and reject stale or paid changes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-quantity-')),file=path.join(dir,'orders.json');
 let app=await start({ORDER_DB:file});
 try{
  const order=await (await app.request('/api/orders','POST',{table:1,requestId:'quantity',items:[{id:'1',qty:1,note:'first'},{id:'1',qty:2,note:'second'}]})).json();
  const route='/api/orders/'+order.id+'/items/1';
  for(const qty of [0,100,1.5,'2'])assert.equal((await app.request(route,'PATCH',{qty,expectedItems:order.items})).status,400);
  const updated=await (await app.request(route,'PATCH',{qty:3,expectedItems:order.items})).json();
  assert.deepEqual(updated.items,[order.items[0],{...order.items[1],qty:3}]);
  assert.equal((await app.request(route,'PATCH',{qty:4,expectedItems:order.items})).status,409);
  await app.stop();app=await start({ORDER_DB:file});
  assert.deepEqual((await (await app.request('/api/orders')).json())[0].items,updated.items);
  const reduced=await (await app.request(route,'PATCH',{qty:1,expectedItems:updated.items})).json();
  assert.equal(reduced.items[1].qty,1);
  await app.request('/api/checkout','POST',{ids:[order.id]});
  assert.equal((await app.request(route,'PATCH',{qty:2,expectedItems:reduced.items})).status,409);
 }finally{await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('Vercel without a database never permits staff access or pretends to save orders',async()=>{
  const app=await start({VERCEL:'1'});
  try{
    assert.equal((await app.request('/')).status,200);
    assert.equal((await app.request('/api/menu')).status,503);
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

test('invoice deletion is atomic, scoped, persistent and preserves request deduplication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-invoice-')),file=path.join(dir,'orders.json');
 let app=await start({ORDER_DB:file});
 try{
  const body={table:2,requestId:'invoice-first',items:[{id:'1',qty:1,note:''}]};
  const first=await (await app.request('/api/orders','POST',body)).json();
  const second=await (await app.request('/api/orders','POST',{...body,requestId:'invoice-second'})).json();
  const other=await (await app.request('/api/orders','POST',{...body,table:1,requestId:'invoice-other'})).json();
  const remove=expectedOrders=>app.request('/api/invoices','DELETE',{key:'open:2',expectedOrders});
  assert.equal((await remove([])).status,400);
  assert.equal((await remove([first])).status,409);
  assert.equal((await (await app.request('/api/orders')).json()).length,3);
  assert.equal((await remove([first,second])).status,200);
  await app.stop();app=await start({ORDER_DB:file});
  assert.deepEqual(await (await app.request('/api/admin/orders','GET',undefined,'test-setup-admin')).json(),[other]);
  assert.equal((await app.request('/api/orders','POST',body)).status,200);
  assert.deepEqual(await (await app.request('/api/orders')).json(),[other]);
  await app.request('/api/checkout','POST',{ids:[other.id]});
  const paid=await (await app.request('/api/admin/orders','GET',undefined,'test-setup-admin')).json();
  assert.equal((await app.request('/api/invoices','DELETE',{key:'open:1',expectedOrders:[other]})).status,404);
  assert.deepEqual(await (await app.request('/api/orders?history=all')).json(),[]);
  assert.equal((await app.request('/api/admin/orders')).status,401);
  assert.equal((await app.request('/api/invoices','DELETE',{key:'paid:1:'+paid[0].paymentId,expectedOrders:paid})).status,403);
  assert.equal((await app.request('/api/admin/invoices','DELETE',{key:'paid:1:'+paid[0].paymentId,expectedOrders:paid})).status,401);
  const retry=await (await app.request('/api/orders','POST',{...body,table:1,requestId:'invoice-other'})).json();assert.equal(retry.alreadySubmitted,true);assert.equal(retry.items,undefined);
  assert.equal((await app.request('/api/admin/invoices','DELETE',{key:'paid:1:'+paid[0].paymentId,expectedOrders:[]},'test-setup-admin')).status,400);
  assert.equal((await app.request('/api/admin/invoices','DELETE',{key:'paid:1:'+paid[0].paymentId,expectedOrders:[other]},'test-setup-admin')).status,409);
  assert.equal((await app.request('/api/admin/invoices','DELETE',{key:'paid:1:'+paid[0].paymentId,expectedOrders:paid},'test-setup-admin')).status,200);
  assert.deepEqual(await (await app.request('/api/admin/orders','GET',undefined,'test-setup-admin')).json(),[]);
  const report=require('../reports').report(JSON.parse(fs.readFileSync(file,'utf8')).orders);
  assert.equal(report.revenue,0);assert.equal(report.payments,0);assert.deepEqual(report.bestsellers,[]);
 }finally{await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('legacy local order arrays remain readable after catalog edits',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-legacy-')),file=path.join(dir,'orders.json');
 const legacy=[{id:'old',table:1,items:[{id:'1',qty:1,price:179000,name:'Combo Lẩu 1'}],paid:true,paidAt:'2026-09-10T01:00:00Z'}];
 fs.writeFileSync(file,JSON.stringify(legacy));const password='test-admin-only-12345',app=await start({ORDER_DB:file,ADMIN_PASSWORD:password});
 try{assert.equal((await app.request('/api/admin/tables','POST',{number:20},password)).status,201);assert.deepEqual(JSON.parse(fs.readFileSync(file)).orders,legacy);assert.equal(JSON.parse(fs.readFileSync(file)).catalog.tables.at(-1),20);}
 finally{await app.stop();fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('remove confirmed items, reject stale edits and paid edits, preserve empty request deduplication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-remove-')),file=path.join(dir,'orders.json');
 let app=await start({ORDER_DB:file});
 try{
  const body={table:1,requestId:'remove-items',items:[{id:'1',qty:2,note:'first'},{id:'1',qty:1,note:'second'}]};
  const order=await (await app.request('/api/orders','POST',body)).json();
  const route='/api/orders/'+order.id+'/items/0';
  assert.equal((await app.request(route,'DELETE',{expectedItems:order.items})).status,200);
  assert.equal((await app.request(route,'DELETE',{expectedItems:order.items})).status,409);
  await app.stop();app=await start({ORDER_DB:file});
  let remaining=await (await app.request('/api/orders')).json();
  assert.equal(remaining[0].items.length,1);assert.equal(remaining[0].items[0].note,'second');
  assert.equal((await app.request(route,'DELETE',{expectedItems:remaining[0].items})).status,200);
  assert.deepEqual(await (await app.request('/api/admin/orders','GET',undefined,'test-setup-admin')).json(),[]);
  assert.equal((await app.request('/api/checkout','POST',{ids:[order.id]})).status,400);
  assert.equal((await app.request('/api/orders','POST',body)).status,200);
  assert.deepEqual(await (await app.request('/api/orders')).json(),[]);
  const paid=await (await app.request('/api/orders','POST',{...body,requestId:'paid-items'})).json();
  await app.request('/api/checkout','POST',{ids:[paid.id]});
  assert.equal((await app.request('/api/orders/'+paid.id+'/items/0','DELETE',{expectedItems:paid.items})).status,409);
  remaining=await (await app.request('/api/admin/orders','GET',undefined,'test-setup-admin')).json();
  assert.equal(remaining[0].items.length,2);
 }finally{await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});

test('employee codes, protected routes, fixed eight-hour sessions, revocation and restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-auth-')),file=path.join(dir,'orders.json');
 const password='auth-test-admin';let app=await start({ORDER_DB:file,ADMIN_PASSWORD:password},false);
 const admin=(route,method='GET',body)=>app.request('/api/admin/employees'+route,method,body,password);
 const login=code=>app.request('/api/staff/session','POST',{code});
 const authorized=(route,cookie,method='GET',body)=>fetch(app.base+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 try{
  for(const route of ['/api/menu','/api/catalog','/api/orders','/api/orders?history=all'])assert.equal((await app.request(route)).status,401);
  for(const [route,method] of [['/api/orders','POST'],['/api/checkout','POST'],['/api/invoices','DELETE'],['/api/orders/x/items/0','PATCH'],['/api/orders/x/items/0','DELETE']])assert.equal((await app.request(route,method,{})).status,401);
  assert.equal((await app.request('/api/admin/employees')).status,401);
  for(const code of ['',123,'12a','12 3','-1'])assert.equal((await admin('','POST',{name:'An',code})).status,400);
  const code='00'+'1234567890'.repeat(100);
  const created=await admin('','POST',{name:'Nguyễn Văn An',code});assert.equal(created.status,201);const employee=await created.json();
  assert.equal((await admin('','POST',{name:'B?nh',code})).status,409);
  assert.equal((await login(code.slice(2))).status,401);
  const before=Date.now(),response=await login(code);assert.equal(response.status,200);
  const session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  assert.ok(session.expiresAt>=before+8*3600000&&session.expiresAt<=Date.now()+8*3600000);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal(session.employee.name,'Nguyễn Văn An');assert.equal(JSON.stringify(await (await admin('')).json()).includes('codeHash'),false);
  assert.equal(fs.readFileSync(file,'utf8').includes(code),false);
  assert.equal((await authorized('/api/menu',cookie)).status,200);
  assert.equal((await authorized('/api/admin/employees',cookie)).status,401);
  const order=await (await authorized('/api/orders',cookie,'POST',{table:1,requestId:'employee-order',items:[{id:'1',qty:1,note:''}]})).json();assert.equal(order.employee.id,employee.id);
  await app.stop();app=await start({ORDER_DB:file,ADMIN_PASSWORD:password},false);
  assert.equal((await (await authorized('/api/staff/session',cookie)).json()).expiresAt,session.expiresAt);
  const state=JSON.parse(fs.readFileSync(file));state.auth.sessions[0].expiresAt=Date.now()-1;fs.writeFileSync(file,JSON.stringify(state));
  assert.equal((await authorized('/api/orders',cookie)).status,401);
  const renewed=await login(code),cookie2=renewed.headers.get('set-cookie').split(';')[0];
  assert.equal((await admin('/'+employee.id,'PUT',{name:'An',code:'0007'})).status,200);
  assert.equal((await authorized('/api/orders',cookie2)).status,401);assert.equal((await login(code)).status,401);
  const next=await login('0007'),cookie3=next.headers.get('set-cookie').split(';')[0];
  assert.equal((await authorized('/api/staff/session',cookie3,'DELETE')).status,200);
  assert.equal((await authorized('/api/orders',cookie3)).status,401);
  const last=await login('0007'),cookie4=last.headers.get('set-cookie').split(';')[0];
  assert.equal((await admin('/'+employee.id,'DELETE')).status,200);
  assert.equal((await authorized('/api/orders',cookie4)).status,401);assert.equal((await login('0007')).status,401);
 }finally{await app.stop();if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);}
});
