const {Router}=require('express');
const {randomUUID,createHash,timingSafeEqual}=require('node:crypto');
const store=require('./order-store');
const {report}=require('./reports');
const router=Router();
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=s=>createHash('sha256').update(s).digest();
router.use((req,res,next)=>{
  const password=process.env.ADMIN_PASSWORD;
  if(!password)return fail(503,'Hãy cấu hình ADMIN_PASSWORD không để trống trên máy chủ rồi khởi động/deploy lại.');
  let supplied='';try{supplied=decodeURIComponent((req.get('Authorization')||'').replace(/^Bearer /,''));}catch{return fail(401,'Mật khẩu quản trị không đúng.');}
  if(!timingSafeEqual(hash(supplied),hash(password)))return fail(401,'Mật khẩu quản trị không đúng.');
  next();
});
router.post('/session',(_,res)=>res.json({ok:true}));
router.get('/catalog',async(_,res)=>res.json(await store.readCatalog()));
router.get('/reports',async(req,res)=>res.json(report(await store.read(),req.query.period,req.query.date)));
function dishInput(body){
  if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.category!=='string'||!body.category.trim()||body.category.length>80||!Number.isSafeInteger(body.price)||body.price<0||body.price>100000000)fail(400,'Kiểm tra tên món, nhóm món và giá tiền (số nguyên từ 0 đến 100 triệu).');
  if(typeof body.unit!=='string'||body.unit.length>30||!Array.isArray(body.details)||body.details.length>10||body.details.some(s=>typeof s!=='string'||s.length>200)||typeof body.image!=='string'||(body.image&&!/^\/api\/images\/[a-f0-9-]{36}$/.test(body.image)))fail(400,'Thông tin mô tả hoặc ảnh không hợp lệ.');
  return {name:body.name.trim(),category:body.category.trim(),price:body.price,unit:body.unit.trim(),details:body.details.map(s=>s.trim()).filter(Boolean),image:body.image};
}
router.post('/menu',async(req,res)=>{
  const data=dishInput(req.body);
  const dish=await store.mutateState(({catalog})=>{if(catalog.menu.filter(d=>d.active!==false).length>=500)fail(400,'Tối đa 500 món đang bán.');const dish={id:randomUUID(),...data,active:true};catalog.menu.push(dish);return dish;});res.status(201).json(dish);
});
router.put('/menu/:id',async(req,res)=>{
  const data=dishInput(req.body);
  res.json(await store.mutateState(({catalog})=>{const d=catalog.menu.find(d=>d.id===req.params.id&&d.active!==false);if(!d)fail(404,'Không tìm thấy món.');Object.assign(d,data);return d;}));
});
router.delete('/menu/:id',async(req,res)=>{
  await store.mutateState(({catalog})=>{const d=catalog.menu.find(d=>d.id===req.params.id);if(!d)fail(404,'Không tìm thấy món.');d.active=false;});res.json({ok:true});
});
router.post('/tables',async(req,res)=>{
  const number=req.body?.number;if(!Number.isInteger(number)||number<1||number>999)fail(400,'Số bàn phải từ 1 đến 999.');
  await store.mutateState(({catalog})=>{if(catalog.tables.includes(number))fail(409,'Số bàn đã tồn tại.');if(catalog.tables.length>=200)fail(400,'Tối đa 200 bàn.');catalog.tables.push(number);catalog.tables.sort((a,b)=>a-b);});res.status(201).json({number});
});
router.delete('/tables/:number',async(req,res)=>{
  const number=Number(req.params.number);
  await store.mutateState(({catalog,orders})=>{if(!catalog.tables.includes(number))fail(404,'Không tìm thấy bàn.');if(catalog.tables.length===1)fail(400,'Cần giữ ít nhất một bàn.');if(orders.some(o=>o.table===number&&!o.paid&&o.items.length))fail(409,'Bàn còn đơn chưa thanh toán.');catalog.tables=catalog.tables.filter(n=>n!==number);});res.json({ok:true});
});
router.post('/images',async(req,res)=>{
  const data=req.body?.data;
  if(typeof data!=='string'||data.length>280000)fail(400,'Ảnh quá lớn. Vui lòng chọn ảnh khác.');
  const m=data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!m)fail(400,'Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  const bytes=Buffer.from(m[2],'base64');
  const valid=m[1]==='jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid||bytes.length>200000)fail(400,'Nội dung ảnh không hợp lệ hoặc vượt 200 KB.');
  const id=randomUUID();await store.putImage(id,data);res.status(201).json({url:'/api/images/'+id});
});
module.exports=router;
