const {chromium}=require('playwright');
const express=require('express');
const path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
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
   await page.evaluate(async orders=>{window.print=()=>{window.printCalled=true;};const {printReceipt}=await import('/receipt.js');await printReceipt(orders,3);},orders);
   assert.equal(await page.evaluate(()=>window.printCalled),true);
   await page.emulateMedia({media:'print'});
   const dimensions=await page.locator('.receipt').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,height:el.getBoundingClientRect().height}));
   assert.ok(Math.abs(dimensions.width-72*96/25.4)<1);assert.ok(dimensions.scroll<=Math.ceil(dimensions.width));assert.ok(dimensions.height>previousHeight);previousHeight=dimensions.height;
   assert.equal(await page.locator('#app').isVisible(),false);
   const pdf=await page.pdf({preferCSSPageSize:true,displayHeaderFooter:false,...(count===10?{path:path.join(os.tmpdir(),'chd-bill-80mm.pdf')}:{})});
   const text=pdf.toString('latin1'),box=text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
   assert.ok(box,'PDF page dimensions present');assert.ok(Math.abs(Number(box[1])-80*72/25.4)<1,'80mm paper width');
   assert.equal((text.match(/\/Type\s*\/Page\b/g)||[]).length,1,'one roll page');
   if(count===10){assert.equal(await page.locator('.receipt-total').innerText(),'Tổng tiền:\n342.000 đ');await page.locator('#print').screenshot({path:path.join(os.tmpdir(),'chd-bill-80mm.png')});}
  }
  console.log('PASS: 80mm PDF page, 72mm content, 1/10/55 items, dynamic height, total, no app UI or horizontal overflow.');console.log('Preview: '+path.join(os.tmpdir(),'chd-bill-80mm.png'));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
