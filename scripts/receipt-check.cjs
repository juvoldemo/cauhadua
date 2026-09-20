const {chromium}=require('playwright');
const express=require('express');
const path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const app=express();app.use(express.static(path.join(__dirname,'../public')));
 app.get('/receipt-check',(_,res)=>res.send('<!doctype html><html><head><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/receipt.css"></head><body><div id="app">Giao diện không được in</div><div id="print"></div></body></html>'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});await page.goto('http://127.0.0.1:'+server.address().port+'/receipt-check');
  const names=['Ốc hương sốt phô mai','Ốc hương sốt bơ tỏi','Hàu nướng phô mai','Nghêu hấp Thái','Ốc móng tay sốt me','Trà đào','Tàu hũ đá trân châu','Gỏi xoài cá cơm','Bánh tráng trộn','Trà tắc'];
  const prices=[59000,49000,39000,27000,49000,20000,13000,22000,22000,16000];
  let previousHeight=0;
  for(const count of [1,10,55]){
   await page.emulateMedia({media:'screen'});
   const orders=[{id:'01001900-0000-4000-8000-000000000000',createdAt:'2026-09-10T10:56:00Z',items:Array.from({length:count},(_,i)=>({name:names[i%10],price:prices[i%10],qty:i===6?3:1}))}];
   const downloading=page.waitForEvent('download');
   await page.evaluate(async orders=>{localStorage.setItem('chd-usb-printer','{}');window.print=()=>{window.printCalled=true;};const {printReceipt}=await import('/receipt.js');await printReceipt(orders,3);},orders);
   const download=await downloading;
   assert.match(download.suggestedFilename(),/^bill-ban-3-.*-80mm\.png$/);
   const bytes=await fs.readFile(await download.path());
   assert.equal(bytes.subarray(1,4).toString(),'PNG');
   assert.equal(bytes.readUInt32BE(16),945);
   const height=bytes.readUInt32BE(20);
   assert.ok(height>previousHeight);previousHeight=height;
   const phys=bytes.indexOf(Buffer.from('pHYs'));
   assert.equal(bytes.readUInt32BE(phys+4),11811);
   assert.equal(bytes.readUInt32BE(phys+8),11811);
   assert.equal(await page.evaluate(()=>Boolean(window.printCalled)),false);
   assert.equal(await page.locator('#app').isVisible(),true);
   assert.equal(await page.locator('#print').isVisible(),false);
   const ink=await page.evaluate(async data=>{
    const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,c.width,c.height).data;
    let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<128)dark++;
    return dark;
   },bytes.toString('base64'));
   assert.ok(ink>1000,'download contains visible receipt text');
   if(count===10)await download.saveAs(path.join(os.tmpdir(),'chd-bill-80mm.png'));
  }
  const phone=await browser.newPage({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  let downloads=0;phone.on('download',()=>downloads++);
  await phone.goto('http://127.0.0.1:'+server.address().port+'/receipt-check');
  await phone.evaluate(()=>{
   Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files[0].type==='image/png'});
   Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{
    window.shared={type:files[0].type,name:files[0].name,size:files[0].size,active:navigator.userActivation.isActive};
    if(window.shareError)throw new DOMException('Share failed',window.shareError);
   }});
  });
  const renderPhone=()=>phone.evaluate(async()=>{
   const {printReceipt}=await import('/receipt.js');
   await printReceipt([{id:'phone-bill',createdAt:'2026-09-10T10:56:00Z',items:[{name:'Tàu hũ đá',qty:1,price:13000}]}],3);
  });
  await renderPhone();
  assert.equal(await phone.locator('#receipt-photo').isVisible(),true);
  assert.ok(await phone.locator('#receipt-photo img').evaluate(async img=>{await img.decode();return img.naturalWidth===945;}));
  await phone.locator('.photo-share').click();
  const shared=await phone.evaluate(()=>window.shared);
  assert.equal(shared.type,'image/png');assert.match(shared.name,/-80mm\.png$/);assert.ok(shared.size>1000);assert.equal(shared.active,true);
  await phone.evaluate(()=>window.shareError='AbortError');await phone.locator('.photo-share').click();
  assert.equal(await phone.locator('#receipt-photo').isVisible(),true);
  assert.equal(await phone.locator('.photo-share').isEnabled(),true);
  await phone.evaluate(()=>window.shareError='NotAllowedError');await phone.locator('.photo-share').click();
  assert.match(await phone.locator('.photo-help').textContent(),/Nhấn giữ/);
  await phone.locator('.photo-close').click();await phone.locator('#receipt-photo').waitFor({state:'detached'});assert.equal(await phone.locator('#receipt-photo').count(),0);
  await phone.evaluate(()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
  await renderPhone();assert.equal(await phone.locator('.photo-share').isVisible(),false);
  assert.match(await phone.locator('.photo-help').textContent(),/Nhấn giữ/);
  await phone.locator('.photo-close').click();await phone.locator('#receipt-photo').waitFor({state:'detached'});assert.equal(downloads,0);
  await phone.close();
  console.log('PASS: PNG download, 80mm at 300 dpi, 1/10/55 items; simulated iPhone image preview, PNG sharing with user activation, cancellation and unsupported-share fallback without downloading.');console.log('Preview: '+path.join(os.tmpdir(),'chd-bill-80mm.png'));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
