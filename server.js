const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const store = require('./order-store');
const app = express();
app.use(express.json({limit:'100kb'}));
app.use('/api', (_,res,next)=>{res.set('Cache-Control','no-store');next();});
const menu=[]; let category='';
for(const line of fs.readFileSync(path.join(__dirname,'data/menu.txt'),'utf8').split(/\r?\n/)) {
  if(/^\d+\./.test(line)) category=line.replace(/^\d+\.\s*/, '');
  const m=line.match(/^- (.+) — (\d+)K(.*)$/);
  if(m) menu.push({id:String(menu.length+1),name:m[1],price:Number(m[2])*1000,category,unit:m[3],details:[]});
  if(/^\s+\+/.test(line)) menu.at(-1)?.details.push(line.trim().replace(/^\+\s*/,''));
}
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
app.get('/api/menu',(_,res)=>res.json(menu));
app.get('/api/orders',async (_,res)=>res.json(await store.read()));
app.post('/api/orders',async (req,res)=>{
 const {table,items,requestId}=req.body||{};
 if(!Number.isInteger(table)||table<1||table>12||!Array.isArray(items)||!items.length||items.length>100) return res.status(400).json({error:'Thông tin phiếu không hợp lệ.'});
 if(typeof requestId!=='string'||!requestId.length||requestId.length>100) return res.status(400).json({error:'Thiếu mã yêu cầu.'});
 const clean=[];
 for(const item of items){const dish=menu.find(m=>m.id===item?.id);if(!dish||!Number.isInteger(item.qty)||item.qty<1||item.qty>99||typeof item.note!=='string'||item.note.length>200)return res.status(400).json({error:'Món ăn không hợp lệ.'});clean.push({id:dish.id,name:dish.name,price:dish.price,qty:item.qty,note:item.note});}
 const result=await store.mutate(orders=>{
   const previous=orders.find(o=>o.requestId===requestId);if(previous)return {order:previous,created:false};
   const order={id:randomUUID(),requestId,table,items:clean,status:'new',paid:false,createdAt:new Date().toISOString()};
   orders.push(order);return {order,created:true};
 });res.status(result.created?201:200).json(result.order);
});
app.patch('/api/orders/:id',async (req,res)=>{
 const order=await store.mutate(orders=>{
   const o=orders.find(o=>o.id===req.params.id);if(!o)return fail(404,'Không tìm thấy phiếu.');
   const next={new:'cooking',cooking:'ready'};
   if(!next[o.status]||req.body?.status!==next[o.status])return fail(400,'Trạng thái không hợp lệ.');
   o.status=req.body.status;return o;
 });res.json(order);
});
app.post('/api/checkout',async (req,res)=>{
 const ids=req.body?.ids;if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'))return fail(400,'Danh sách phiếu không hợp lệ.');
 await store.mutate(orders=>{
   const selected=orders.filter(o=>ids.includes(o.id));
   if(selected.length!==ids.length||new Set(selected.map(o=>o.table)).size!==1)return fail(400,'Danh sách phiếu không hợp lệ.');
   selected.forEach(o=>{if(!o.paid){o.paid=true;o.paidAt=new Date().toISOString();}});
 });res.json({ok:true});
});
app.use(express.static(path.join(__dirname,'public')));
app.use('/api',(_,res)=>res.status(404).json({error:'API không tồn tại.'}));
app.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 const status=error.status>=400&&error.status<500?error.status:error.status===503?503:500;
 res.status(status).json({error:status===500?'Không thể lưu hoặc tải đơn hàng. Vui lòng thử lại.':error.type==='entity.parse.failed'?'Dữ liệu JSON không hợp lệ.':error.message});
});
module.exports=app;
if(require.main===module){const port=process.env.PORT||3000;app.listen(port,'0.0.0.0',()=>console.log(`App: http://localhost:${port}`));}
