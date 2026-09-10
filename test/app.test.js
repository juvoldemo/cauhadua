const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {once} = require('node:events');

async function start(env) {
  const child=spawn(process.execPath,['-e',"const server=require('./server').listen(0,'127.0.0.1',()=>console.log(server.address().port));"],{
    cwd:path.join(__dirname,'..'),env:{...process.env,DATABASE_URL:'',POSTGRES_URL:'',VERCEL:'',...env},stdio:['ignore','pipe','inherit']
  });
  const [data]=await once(child.stdout,'data');
  const base='http://127.0.0.1:'+String(data).trim();
  return {request:async (route,method='GET',body)=>fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),stop:async()=>{const exited=once(child,'exit');child.kill();await exited;}};
}

test('local routes, concurrent orders, persistence and kitchen/checkout',async()=>{
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
    assert.equal((await app.request('/api/orders/'+id,'PATCH',{status:'ready'})).status,400);
    assert.equal((await app.request('/api/orders/'+id,'PATCH',{status:'cooking'})).status,200);
    assert.equal((await app.request('/api/orders/'+id,'PATCH',{status:'ready'})).status,200);
    assert.equal((await app.request('/api/orders/'+id,'PATCH',{})).status,400);
    assert.equal((await app.request('/api/checkout','POST',{ids:[id]})).status,200);
    assert.equal((await app.request('/api/orders','POST',{...body,items:[null]})).status,400);
    await app.stop();app=await start({ORDER_DB:file});
    const response=await app.request('/api/orders');assert.equal(response.headers.get('cache-control'),'no-store');
    const persisted=await response.json();assert.equal(persisted.length,6);
    assert.equal(persisted.find(o=>o.id===id).paid,true);
    assert.equal(persisted.find(o=>o.id===id).status,'ready');
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
