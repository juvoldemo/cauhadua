const {Router}=require('express');
const {randomUUID,randomBytes,createHash,scrypt}=require('node:crypto');
const {promisify}=require('node:util');
const store=require('./order-store');
const derive=promisify(scrypt),TTL=8*60*60*1000;
const router=Router(),employeesRouter=Router();
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const digest=value=>createHash('sha256').update(value).digest('hex');
const publicEmployee=({id,name})=>({id,name});
async function codeHash(code){
 if(typeof code!=='string'||!/^\d+$/.test(code))fail(400,'Mã nhân viên chỉ được gồm các chữ số từ 0 đến 9.');
 return (await derive(code,'chd-employee-code-v1',32)).toString('hex');
}
function token(req){return (req.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('chd_staff='))?.slice(10)||'';}
function cookie(req,res,value,maxAge){res.cookie('chd_staff',value,{httpOnly:true,sameSite:'strict',secure:req.secure||Boolean(process.env.VERCEL),path:'/',maxAge});}
async function requireStaff(req,res,next){
 const {auth}=await store.readState();
 const session=auth.sessions.find(s=>s.hash===digest(token(req))&&s.expiresAt>Date.now());
 const employee=session&&auth.employees.find(e=>e.id===session.employeeId);
 if(!employee)return fail(401,'Vui lòng nhập mã nhân viên. Phiên đăng nhập có hiệu lực 8 tiếng.');
 req.employee=publicEmployee(employee);req.staffSession=session;next();
}
// Limit password derivations per client; sessions themselves are persisted across server instances.
const attempts=new Map();
router.post('/session',async(req,res)=>{
 const now=Date.now(),key=req.ip,entry=attempts.get(key);
 if(entry&&entry.until>now&&entry.count>=10)return fail(429,'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 1 phút.');
 if(!entry||entry.until<=now)attempts.set(key,{count:1,until:now+60000});else entry.count++;
 if(attempts.size>10000)for(const [ip,value] of attempts)if(value.until<=now)attempts.delete(ip);
 const hash=await codeHash(req.body?.code),value=randomBytes(32).toString('hex');
 const result=await store.mutateState(({auth})=>{
  const employee=auth.employees.find(e=>e.codeHash===hash);
  if(!employee)return fail(401,'Mã nhân viên không đúng.');
  const expiresAt=Date.now()+TTL;
  auth.sessions=auth.sessions.filter(s=>s.expiresAt>Date.now());
  auth.sessions.push({hash:digest(value),employeeId:employee.id,expiresAt});
  return {employee:publicEmployee(employee),expiresAt};
 });
 attempts.delete(key);cookie(req,res,value,TTL);res.json(result);
});
router.get('/session',requireStaff,(req,res)=>res.json({employee:req.employee,expiresAt:req.staffSession.expiresAt}));
router.delete('/session',async(req,res)=>{
 const hash=digest(token(req));await store.mutateState(({auth})=>{auth.sessions=auth.sessions.filter(s=>s.hash!==hash);});
 cookie(req,res,'',0);res.json({ok:true});
});
employeesRouter.get('/',async(_,res)=>res.json((await store.readState()).auth.employees.map(publicEmployee)));
async function saveEmployee(req,res){
 const name=req.body?.name;
 if(typeof name!=='string'||!name.trim()||name.length>150)fail(400,'Nhập họ và tên nhân viên (tối đa 150 ký tự).');
 const hash=await codeHash(req.body?.code);
 const employee=await store.mutateState(({auth})=>{
  if(auth.employees.some(e=>e.codeHash===hash&&e.id!==req.params.id))fail(409,'Mã số này đã được dùng cho nhân viên khác.');
  let employee=req.params.id?auth.employees.find(e=>e.id===req.params.id):null;
  if(req.params.id&&!employee)fail(404,'Không tìm thấy nhân viên.');
  if(!employee){employee={id:randomUUID()};auth.employees.push(employee);}
  Object.assign(employee,{name:name.trim(),codeHash:hash});
  auth.sessions=auth.sessions.filter(s=>s.employeeId!==employee.id);
  return publicEmployee(employee);
 });res.status(req.params.id?200:201).json(employee);
}
employeesRouter.post('/',saveEmployee);employeesRouter.put('/:id',saveEmployee);
employeesRouter.delete('/:id',async(req,res)=>{
 await store.mutateState(({auth})=>{
  if(!auth.employees.some(e=>e.id===req.params.id))fail(404,'Không tìm thấy nhân viên.');
  auth.employees=auth.employees.filter(e=>e.id!==req.params.id);
  auth.sessions=auth.sessions.filter(s=>s.employeeId!==req.params.id);
 });res.json({ok:true});
});
module.exports={router,employeesRouter,requireStaff};
