const key='chd-usb-printer';
let selected=null,busy=false;
export function usbConfigured(){return Boolean(localStorage.getItem(key));}
function supported(){
 if(!window.isSecureContext)throw new Error('In USB cần mở website bằng HTTPS.');
 if(!navigator.usb)throw new Error('Chrome này chưa hỗ trợ WebUSB. Cần cập nhật Chrome hoặc dùng ứng dụng cầu nối in Android.');
}
export function printerEndpoint(device){
 for(const config of device.configurations)for(const iface of config.interfaces)for(const alt of iface.alternates){
  const endpoint=alt.endpoints.find(e=>e.direction==='out'&&e.type==='bulk');
  if(endpoint&&[7,255].includes(alt.interfaceClass))return {config:config.configurationValue,iface:iface.interfaceNumber,alt:alt.alternateSetting,endpoint:endpoint.endpointNumber};
 }
 throw new Error('Không tìm thấy cổng in USB tương thích trên thiết bị đã chọn.');
}
export async function connectPrinter(){
 supported();
 const device=await navigator.usb.requestDevice({filters:[{classCode:7},{classCode:255}]});
 printerEndpoint(device);
 await device.open();
 await device.close();
 localStorage.setItem(key,JSON.stringify({vendorId:device.vendorId,productId:device.productId,serialNumber:device.serialNumber||''}));
 selected=device;
}
export function useSystemPrinter(){localStorage.removeItem(key);selected=null;}
export function rasterPacket(rgba,width,height){
 const stride=Math.ceil(width/8),bytes=new Uint8Array(8+stride*height);
 bytes.set([29,118,48,0,stride&255,stride>>8,height&255,height>>8]);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4;
  if(rgba[p+3]>127&&(rgba[p]+rgba[p+1]+rgba[p+2])<384)bytes[8+y*stride+(x>>3)]|=128>>(x%8);
 }
 return bytes;
}
// Render Vietnamese with the Android font, avoiding printer code-page dependencies.
function receiptLines(orders,table){
 const lines=['Tàu hũ đá Cầu Hà Dừa','Địa chỉ: 168 Lý Tự Trọng','HÓA ĐƠN THANH TOÁN'];
 const first=[...orders].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
 const paid=orders.every(o=>o.paid);
 lines.push('Số HĐ: '+String(first.paymentId||first.id).slice(0,8).toUpperCase(),'Bàn: '+table,
  'Giờ vào: '+new Date(first.createdAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),
  'Giờ in: '+new Date().toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),paid?'Đã thanh toán':'Chưa thanh toán','--------------------------------------');
 const money=n=>n.toLocaleString('vi-VN')+' đ';
 let sum=0;
 orders.flatMap(o=>o.items).forEach((i,n)=>{lines.push(`${n+1}. ${i.name}`,`   ${i.qty} x ${money(i.price)} = ${money(i.qty*i.price)}`);sum+=i.qty*i.price;});
 lines.push('--------------------------------------','TỔNG TIỀN: '+money(sum),'Cảm ơn Quý Khách! Hẹn gặp lại.');
 return lines;
}
export async function printUsbReceipt(orders,table){
 if(busy)throw new Error('Máy in đang nhận bill. Vui lòng chờ.');
 supported();busy=true;
 let device,claimed=false,target,started=false;
 try{
  const preference=JSON.parse(localStorage.getItem(key)||'null');
  const devices=await navigator.usb.getDevices();
  const matches=devices.filter(d=>preference&&d.vendorId===preference.vendorId&&d.productId===preference.productId&&(d.serialNumber||'')===preference.serialNumber);
  device=devices.includes(selected)?selected:matches.length===1?matches[0]:null;
  if(!device)throw new Error('Hãy cắm máy in và bấm Kết nối máy in USB để chọn lại.');
  target=printerEndpoint(device);
  await device.open();
  if(device.configuration?.configurationValue!==target.config)await device.selectConfiguration(target.config);
  await device.claimInterface(target.iface);claimed=true;
  await device.selectAlternateInterface(target.iface,target.alt);
  const send=async bytes=>{
   for(let offset=0;offset<bytes.length;){
    const chunk=bytes.subarray(offset,offset+4096);started=true;
    const result=await device.transferOut(target.endpoint,chunk);
    if(result.status!=='ok'||!result.bytesWritten)throw new Error('Truyền dữ liệu USB bị gián đoạn.');
    offset+=result.bytesWritten;
   }
  };
  const canvas=document.createElement('canvas');canvas.width=576;canvas.height=32;
  const ctx=canvas.getContext('2d');
  await send(new Uint8Array([27,64]));
  for(const line of receiptLines(orders,table)){
   ctx.font='22px sans-serif';
   let part='';const wrapped=[];
   for(const char of line){if(ctx.measureText(part+char).width>544){wrapped.push(part);part='';}part+=char;}
   wrapped.push(part);
   for(const text of wrapped){
    ctx.fillStyle='white';ctx.fillRect(0,0,576,32);ctx.fillStyle='black';ctx.textBaseline='top';ctx.fillText(text,16,3);
    await send(rasterPacket(ctx.getImageData(0,0,576,32).data,576,32));
   }
  }
  await send(new Uint8Array([27,100,4,29,86,66,0]));
 }catch(error){
  throw new Error((started?'Bill có thể đã in một phần; kiểm tra giấy trước khi in lại. ':'Không kết nối được máy in USB. ')+error.message);
 }finally{
  if(claimed)try{await device.releaseInterface(target.iface);}catch{}
  if(device?.opened)try{await device.close();}catch{}
  busy=false;
 }
}
