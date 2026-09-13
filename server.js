const express = require('express');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const store = require('./order-store');
const app = express();
app.use(express.json({limit:'300kb'}));
app.use('/api', (_,res,next)=>{res.set('Cache-Control','no-store');next();});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
app.use('/api/admin',require('./admin-api'));
app.use('/api/staff',require('./staff-auth').router);
app.use(['/api/catalog','/api/menu','/api/orders','/api/invoices','/api/checkout'],require('./staff-auth').requireStaff);
app.get('/api/catalog',async(_,res)=>{const catalog=await store.readCatalog();res.json({...catalog,menu:catalog.menu.filter(d=>d.active!==false)});});
app.get('/api/menu',async(_,res)=>res.json((await store.readCatalog()).menu.filter(d=>d.active!==false)));
app.get('/api/images/:id',async(req,res)=>{
 const data=await store.getImage(req.params.id);if(!data)return res.sendStatus(404);
 const [header,content]=data.split(',');res.set({'Cache-Control':'public, max-age=31536000, immutable','Content-Type':header.slice(5).split(';')[0],'X-Content-Type-Options':'nosniff'}).send(Buffer.from(content,'base64'));
});
// Staff only receive open orders, regardless of query parameters.
app.get('/api/orders',async (req,res)=>res.json((await store.read()).filter(o=>o.items.length&&!o.paid)));
app.post('/api/orders',async (req,res)=>{
 const {table,items,requestId}=req.body||{};
 if(!Number.isInteger(table)||!Array.isArray(items)||!items.length||items.length>100) return res.status(400).json({error:'Thông tin phiếu không hợp lệ.'});
 if(typeof requestId!=='string'||!requestId.length||requestId.length>100) return res.status(400).json({error:'Thiếu mã yêu cầu.'});
 const result=await store.mutateState(({orders,catalog})=>{
   const previous=orders.find(o=>o.requestId===requestId);if(previous){if(previous.paid)return {order:{id:previous.id,alreadySubmitted:true},created:false};return {order:previous,created:false};}
   if(!catalog.tables.includes(table))fail(400,'Bàn không còn tồn tại. Hãy chọn lại bàn.');
   const clean=[];
   for(const item of items){const dish=catalog.menu.find(m=>m.id===item?.id&&m.active!==false);if(!dish||!Number.isInteger(item.qty)||item.qty<1||item.qty>99||typeof item.note!=='string'||item.note.length>200)fail(400,'Món không còn bán hoặc số lượng/ghi chú không hợp lệ.');if(item.price!==undefined&&item.price!==dish.price)fail(409,'Giá món đã thay đổi. Vui lòng kiểm tra giỏ món và lưu lại.');clean.push({id:dish.id,name:dish.name,price:dish.price,qty:item.qty,note:item.note});}
   const order={id:randomUUID(),requestId,table,employee:{id:req.employee.id,name:req.employee.name},items:clean,paid:false,createdAt:new Date().toISOString()};
   orders.push(order);return {order,created:true};
 });res.status(result.created?201:200).json(result.order);
});
app.patch('/api/orders/:id/items/:index',async(req,res)=>{
 const index=Number(req.params.index),{qty,expectedItems}=req.body||{};
 if(!Number.isInteger(index)||index<0||!Number.isInteger(qty)||qty<1||qty>99||!Array.isArray(expectedItems))return fail(400,'Số lượng phải từ 1 đến 99.');
 const updated=await store.mutate(orders=>{
   const order=orders.find(o=>o.id===req.params.id);
   if(!order)return fail(404,'Không tìm thấy phiếu gọi món.');
   if(order.paid)return fail(409,'Hóa đơn đã thanh toán, không thể đổi số lượng.');
   if(JSON.stringify(order.items)!==JSON.stringify(expectedItems))return fail(409,'Phiếu gọi món đã thay đổi. Vui lòng kiểm tra và thử lại.');
   if(!order.items[index])return fail(404,'Không tìm thấy món cần sửa.');
   order.items[index].qty=qty;
   return order;
 });
 res.json(updated);
});
app.delete('/api/orders/:id/items/:index',async(req,res)=>{
 const index=Number(req.params.index),expectedItems=req.body?.expectedItems;
 if(!Number.isInteger(index)||index<0||!Array.isArray(expectedItems))return fail(400,'Món cần xóa không hợp lệ.');
 await store.mutate(orders=>{
   const order=orders.find(o=>o.id===req.params.id);
   if(!order)return fail(404,'Không tìm thấy phiếu gọi món.');
   if(order.paid)return fail(409,'Hóa đơn đã thanh toán, không thể xóa món.');
   if(JSON.stringify(order.items)!==JSON.stringify(expectedItems))return fail(409,'Phiếu gọi món đã thay đổi. Vui lòng tải lại và kiểm tra trước khi xóa.');
   if(!order.items[index])return fail(404,'Không tìm thấy món cần xóa.');
   // Keep the empty order to preserve request deduplication after the last item is removed.
   order.items.splice(index,1);
 });
 res.json({ok:true});
});
app.delete('/api/invoices',async(req,res)=>{
 const {key,expectedOrders}=req.body||{};
 if(typeof key!=='string'||!Array.isArray(expectedOrders)||!expectedOrders.length)return fail(400,'Hóa đơn cần xóa không hợp lệ.');
 await store.mutate(orders=>{
   const selected=orders.filter(o=>o.items.length&&(o.paid?'paid:'+o.table+':'+(o.paymentId||o.id):'open:'+o.table)===key);
   if(selected.some(o=>o.paid))return fail(403,'Chỉ quản trị viên được truy cập lịch sử thanh toán.');
   if(!selected.length)return fail(404,'Không tìm thấy hóa đơn.');
   if(JSON.stringify(selected)!==JSON.stringify(expectedOrders))return fail(409,'Hóa đơn đã thay đổi. Vui lòng kiểm tra và thử lại.');
   // Retain request IDs so a retried order submission cannot recreate the invoice.
   selected.forEach(o=>{o.items=[];o.deletedAt=new Date().toISOString();});
 });
 res.json({ok:true});
});
app.post('/api/checkout',async (req,res)=>{
 const ids=req.body?.ids;if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'))return fail(400,'Danh sách phiếu không hợp lệ.');
 await store.mutate(orders=>{
   const selected=orders.filter(o=>ids.includes(o.id));
   if(selected.length!==ids.length||selected.some(o=>!o.items.length)||new Set(selected.map(o=>o.table)).size!==1)return fail(400,'Danh sách phiếu không hợp lệ.');
   const paymentId=randomUUID(),paidAt=new Date().toISOString();
   selected.forEach(o=>{if(!o.paid){o.paid=true;o.paidAt=paidAt;o.paymentId=paymentId;}});
 });res.json({ok:true});
});
app.get(['/admin','/admin/'],(_,res)=>res.sendFile(path.join(__dirname,'public/admin.html')));
app.use(express.static(path.join(__dirname,'public')));
app.use('/api',(_,res)=>res.status(404).json({error:'API không tồn tại.'}));
app.use((error,req,res,next)=>{
 if(res.headersSent)return next(error);
 const status=error.status>=400&&error.status<500?error.status:error.status===503?503:500;
 res.status(status).json({error:status===500?'Không thể lưu hoặc tải đơn hàng. Vui lòng thử lại.':error.type==='entity.parse.failed'?'Dữ liệu JSON không hợp lệ.':error.message});
});
module.exports=app;
if(require.main===module){const port=process.env.PORT||3000;app.listen(port,'0.0.0.0',()=>console.log(`App: http://localhost:${port}`));}
