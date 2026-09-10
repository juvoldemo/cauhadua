const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chd-browser-'));
 const child=spawn(process.execPath,['-e',"const s=require('./server').listen(0,'127.0.0.1',()=>console.log(s.address().port));"],{cwd:path.join(__dirname,'..'),env:{...process.env,ORDER_DB:path.join(dir,'orders.json'),DATABASE_URL:'',POSTGRES_URL:'',VERCEL:'',ADMIN_PASSWORD:'browser-test-only-123'},stdio:['ignore','pipe','inherit']});
 const [data]=await once(child.stdout,'data');const base='http://127.0.0.1:'+String(data).trim();
 let browser;
 try{
   browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const admin=await context.newPage(),errors=[];admin.on('pageerror',e=>errors.push(e.message));
   await admin.goto(base+'/admin');
   await admin.locator('[name=password]').fill('browser-test-only-123');
   await admin.locator('#login button').click();await admin.locator('.revenue-card').waitFor();
   assert.equal(await admin.locator('.revenue-card h2').textContent(),'0đ');
   await admin.locator('[data-view=tables]').click();await admin.locator('#new-table').click();
   await admin.locator('[name=number]').fill('13');await admin.locator('#table-form .primary').click();await admin.locator('[data-remove-table="13"]').waitFor();
   await admin.locator('[data-view=menu]').click();await admin.locator('#new-dish').click();
   await admin.locator('[name=name]').fill('Món thử trình duyệt');await admin.locator('[name=category]').fill('MÓN MỚI');await admin.locator('[name=price]').fill('45000');
   // Generate a valid raster fixture inside the browser, then exercise the actual upload flow.
   const png=await admin.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;const x=c.getContext('2d');x.fillStyle='#e47b47';x.fillRect(0,0,100,100);return c.toDataURL('image/png').split(',')[1];});
   await admin.locator('#photo-file').setInputFiles({name:'dish.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await admin.locator('#photo-preview img').waitFor();
   await admin.locator('#dish-form .primary').click();await admin.locator('#editor .sheet').waitFor({state:'detached'});
   await admin.locator('#menu-search').fill('Món thử');assert.equal(await admin.locator('.admin-dish').count(),1);
   const staff=await context.newPage();staff.on('pageerror',e=>errors.push(e.message));await staff.goto(base);
   await staff.locator('#table option[value="13"]').waitFor({state:'attached'});await staff.locator('#table').selectOption('13');
   await staff.locator('#search').fill('Món thử');await staff.locator('.dish img').waitFor();await staff.locator('[data-plus]').click();await staff.locator('#opencart').click();await staff.locator('#send').click();await staff.locator('#overlay .sheet').waitFor({state:'detached'});
   await staff.locator('[data-view=bills]').click();await staff.locator('[data-bill="open:13"]').click();await staff.locator('#checkout').waitFor();
   staff.once('dialog',d=>d.accept());await staff.locator('#checkout').click();await staff.locator('#checkout').waitFor({state:'detached'});
   await staff.locator('[data-bill^="paid:13:"]').click();assert.match(await staff.locator('.panel').textContent(),/45.000đ/);assert.equal(await staff.locator('#checkout').count(),0);await staff.reload();await staff.locator('[data-view=bills]').click();await staff.locator('[data-bill^="paid:13:"]').waitFor();
   await admin.locator('[data-view=reports]').click();await admin.locator('.revenue-card h2').filter({hasText:'45.000đ'}).waitFor();
   await admin.locator('[data-period=week]').click();await admin.locator('.revenue-card').waitFor();await admin.locator('[data-period=month]').click();await admin.locator('.revenue-card').waitFor();
   for(const width of [320,390]){await admin.setViewportSize({width,height:844});assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await admin.screenshot({path:path.join(os.tmpdir(),'chd-admin-preview.png'),fullPage:true});
   await admin.locator('[data-view=menu]').click();await admin.locator('[data-edit]').first().click();await admin.locator('[name=price]').fill('55000');await admin.locator('#dish-form .primary').click();await admin.locator('#editor .sheet').waitFor({state:'detached'});
   await admin.locator('[data-view=reports]').click();await admin.locator('.revenue-card h2').filter({hasText:'45.000đ'}).waitFor();
   const menu=await (await context.request.get(base+'/api/menu')).json();
   const create=async(table,id)=> (await context.request.post(base+'/api/orders',{data:{table,requestId:id,items:[{id:menu[0].id,qty:1,note:'history-test'}]}})).json();
   const first=await create(13,'history-first'),second=await create(13,'history-second'),other=await create(1,'history-other');
   await context.request.post(base+'/api/checkout',{data:{ids:[first.id,second.id]}});
   await context.request.post(base+'/api/checkout',{data:{ids:[other.id]}});
   await staff.reload();await staff.locator('[data-view=bills]').click();
   await staff.locator('[data-bill^="paid:1:"]').waitFor();
   assert.equal(await staff.locator('[data-bill^="paid:13:"]').count(),2);
   assert.equal(await staff.locator('.invoice-card').count(),3);
   const history=await (await context.request.get(base+'/api/orders?history=all')).json();
   const payment=history.find(o=>o.id===first.id).paymentId;
   await staff.locator('[data-bill="paid:13:'+payment+'"]').click();
   assert.equal(await staff.locator('.orderline').count(),2);
   assert.match(await staff.locator('.panel').textContent(),/history-test/);
   for(const width of [320,390]){await staff.setViewportSize({width,height:844});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await create(2,'remove-browser');await create(2,'remove-browser-second');
   await staff.reload();await staff.locator('[data-view=bills]').click();await staff.locator('[data-bill="open:2"]').click();
   assert.equal(await staff.locator('[data-delta="-1"]').first().isDisabled(),true);
   const initialTotal=await staff.locator('.totals').innerText();
   await staff.locator('[data-delta="1"]').first().click();
   await staff.waitForFunction(()=>document.querySelector('.bill-quantity>span')?.textContent==='2');
   assert.notEqual(await staff.locator('.totals').innerText(),initialTotal);
   for(const width of [320,390]){await staff.setViewportSize({width,height:844});assert.ok(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await staff.reload();await staff.locator('[data-view=bills]').click();await staff.locator('[data-bill="open:2"]').click();
   assert.equal(await staff.locator('.bill-quantity>span').first().innerText(),'2');
   await staff.locator('[data-delta="-1"]').first().click();
   await staff.waitForFunction(()=>document.querySelector('.bill-quantity>span')?.textContent==='1');
   assert.equal(await staff.locator('.totals').innerText(),initialTotal);
   staff.once('dialog',d=>d.dismiss());await staff.locator('[data-remove-order]').first().click();assert.equal(await staff.locator('.orderline').count(),2);
   staff.once('dialog',d=>d.accept());await staff.locator('[data-remove-order]').first().click();
   await staff.waitForFunction(()=>document.querySelectorAll('.orderline').length===1);
   staff.once('dialog',d=>d.accept());await staff.locator('[data-remove-order]').click();
   await staff.locator('.history-head').waitFor();assert.equal(await staff.locator('[data-bill="open:2"]').count(),0);
   await staff.reload();await staff.locator('[data-view=bills]').click();await staff.locator('[data-bill^="paid:1:"]').click();assert.equal(await staff.locator('[data-remove-order]').count(),0);
   assert.equal(await staff.locator('[data-quantity-order]').count(),0);
   assert.deepEqual(errors,[]);console.log('PASS: mobile login, add table, upload photo, create/edit dish, staff order/checkout, quantity changes, revenue and responsive layout.');console.log('Screenshot: '+path.join(os.tmpdir(),'chd-admin-preview.png'));
 }finally{
   if(browser)await browser.close();const exited=once(child,'exit');child.kill();await exited;
   const file=path.join(dir,'orders.json');if(fs.existsSync(file))fs.unlinkSync(file);const images=path.join(dir,'images');if(fs.existsSync(images)){for(const name of fs.readdirSync(images))fs.unlinkSync(path.join(images,name));fs.rmdirSync(images);}fs.rmdirSync(dir);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
