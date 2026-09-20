const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=n=>n.toLocaleString('vi-VN');
const time=d=>d.toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'});

export function receiptMarkup(orders,table,now=new Date()){
 const items=orders.flatMap(o=>o.items),sum=items.reduce((n,i)=>n+i.qty*i.price,0);
 const first=[...orders].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
 const opened=first?new Date(first.createdAt):now;
 const paid=orders.length>0&&orders.every(o=>o.paid);
 const closed=paid&&first?.paidAt?new Date(first.paidAt):now;
 const code=String(first?.paymentId||first?.id||'—').slice(0,8).toUpperCase();
 return `<article class="receipt">
 <div class="receipt-heading"><h2>Tàu hũ đá Cầu Hà Dừa</h2><p>Địa chỉ: 168 Lý Tự Trọng</p></div>
 <h3>HÓA ĐƠN THANH TOÁN</h3><p class="receipt-code">Số HĐ: ${esc(code)}</p>
 <div class="receipt-meta"><div><p><b>Mã HĐ:</b> #${esc(first?.id.slice(0,8).toUpperCase()||'—')}</p><p><b>Bàn:</b> ${esc(table)} · Tại chỗ</p><p><b>Giờ vào:</b> ${time(opened)}</p></div><div><p>${paid?'Đã thanh toán':'Chưa thanh toán'}</p><p><b>Ngày:</b> ${closed.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'})}</p><p><b>${paid?'Giờ ra':'Giờ in'}:</b> ${time(closed)}</p></div></div>
 <table><colgroup><col style="width:8%"><col style="width:36%"><col style="width:7%"><col style="width:23%"><col style="width:26%"></colgroup><thead><tr><th>STT</th><th>Tên món</th><th>SL</th><th>Đơn<br>giá</th><th>Thành<br>tiền</th></tr></thead><tbody>${items.map((i,n)=>`<tr><td>${n+1}</td><td>${esc(i.name)}</td><td>${i.qty}</td><td><span class="receipt-amount ${amount(i.price).length>=10?'small':''}">${amount(i.price)}</span></td><td><span class="receipt-amount ${amount(i.price*i.qty).length>=10?'small':''}">${amount(i.price*i.qty)}</span></td></tr>`).join('')}</tbody></table>
 <div class="receipt-summary"><div class="receipt-subtotal"><span>Thành tiền:</span><span>${amount(sum)} đ</span></div><div class="receipt-total"><span>Tổng tiền:</span><span>${amount(sum)} đ</span></div><div class="receipt-payment"><span>${paid?'Đã thanh toán:':'Cần thanh toán:'}</span><span>${amount(sum)} đ</span></div><div class="receipt-footer">Cảm ơn Quý Khách!<br>Hẹn gặp lại.</div></div></article>`;
}

// Record 300 dpi in the PNG so its 945 pixels correspond to 80 mm on paper.
async function pngWithResolution(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);
 view.setUint32(0,9);chunk.set([112,72,89,115],4);
 view.setUint32(8,11811);view.setUint32(12,11811);chunk[16]=1;
 let crc=0xffffffff;
 for(const byte of chunk.subarray(4,17)){
  crc^=byte;
  for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 view.setUint32(17,(crc^0xffffffff)>>>0);
 const parts=[bytes.subarray(0,33),chunk];
 for(let offset=33;offset<bytes.length;){
  const size=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0)+12;
  if(String.fromCharCode(...bytes.subarray(offset+4,offset+8))!=='pHYs')parts.push(bytes.subarray(offset,offset+size));
  offset+=size;
 }
 return new Blob(parts,{type:'image/png'});
}

function showPhotoPreview(file){
 document.querySelector('#receipt-photo')?.close();
 const url=URL.createObjectURL(file),previousFocus=document.activeElement;
 const dialog=document.createElement('dialog');
 dialog.id='receipt-photo';
 dialog.setAttribute('aria-labelledby','receipt-photo-title');
 dialog.innerHTML='<h2 id="receipt-photo-title">Ảnh bill 80 mm</h2><p class="photo-help"></p><img alt="Ảnh hóa đơn khổ giấy 80 mm"><button type="button" class="primary photo-share">Lưu vào Ảnh / Chia sẻ</button><button type="button" class="secondary photo-close">Đóng</button>';
 const help=dialog.querySelector('.photo-help'),share=dialog.querySelector('.photo-share');
 const supported=Boolean(navigator.share&&navigator.canShare?.({files:[file]}));
 const fallback='Nhấn giữ ảnh bill bên dưới, sau đó chọn “Lưu vào Ảnh” hoặc “Lưu hình ảnh”.';
 help.textContent=supported?'Bấm “Lưu vào Ảnh / Chia sẻ”, rồi chọn “Lưu hình ảnh” trong bảng chia sẻ của iPhone.':fallback;
 share.hidden=!supported;
 dialog.querySelector('img').src=url;
 // A separate tap keeps native sharing within a fresh user gesture after rendering.
 share.addEventListener('click',async()=>{
  share.disabled=true;
  try{await navigator.share({files:[file]});}
  catch(error){if(error.name!=='AbortError')help.textContent='Không mở được bảng chia sẻ. '+fallback;}
  finally{share.disabled=false;}
 });
 dialog.querySelector('.photo-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  URL.revokeObjectURL(url);dialog.remove();
  if(previousFocus?.isConnected)previousFocus.focus();
 },{once:true});
 document.body.append(dialog);dialog.showModal();
}

let exporting=false;
export async function printReceipt(orders,table){
 if(!orders.length)throw new Error('Bàn chưa có món để in.');
 if(exporting)throw new Error('Đang tạo ảnh bill. Vui lòng chờ.');
 exporting=true;
 const root=document.querySelector('#print');
 try{
  root.innerHTML=receiptMarkup(orders,table);
  root.classList.add('measuring');
  await document.fonts.ready;
  const receipt=root.querySelector('.receipt');
  const margin=4*96/25.4,width=80*96/25.4;
  const height=Math.ceil(receipt.getBoundingClientRect().height+margin*2);
  const clone=receipt.cloneNode(true),originals=[receipt,...receipt.querySelectorAll('*')];
  [clone,...clone.querySelectorAll('*')].forEach((node,index)=>{
   const style=getComputedStyle(originals[index]);
   for(const property of style)node.style.setProperty(property,style.getPropertyValue(property));
   node.style.visibility='visible';
  });
  const html=new XMLSerializer().serializeToString(clone);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="${margin}" y="${margin}" width="${width-margin*2}" height="${height-margin*2}">${html}</foreignObject></svg>`;
  const image=new Image();
  await new Promise((resolve,reject)=>{
   image.onload=resolve;image.onerror=()=>reject(new Error('Không tạo được ảnh bill. Vui lòng thử lại.'));
   image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  });
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(80/25.4*300);canvas.height=Math.ceil(height*canvas.width/width);
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Trình duyệt không hỗ trợ tạo ảnh bill.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('Bill quá dài để xuất ảnh.')),'image/png'));
  const png=await pngWithResolution(blob),safe=value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'-');
  const filename=`bill-ban-${safe(table)}-${safe(orders[0].paymentId||orders[0].id).slice(0,8)}-${Date.now()}-80mm.png`;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios){showPhotoPreview(new File([png],filename,{type:'image/png'}));return;}
  const url=URL.createObjectURL(png),link=document.createElement('a');
  link.href=url;link.download=filename;
  document.body.append(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 }finally{root?.classList.remove('measuring');exporting=false;}
}
