const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=n=>n.toLocaleString('vi-VN');
const time=d=>d.toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'});

export function receiptMarkup(orders,table,now=new Date()){
 const items=orders.flatMap(o=>o.items),sum=items.reduce((n,i)=>n+i.qty*i.price,0);
 const first=[...orders].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
 const opened=first?new Date(first.createdAt):now;
 return `<article class="receipt"><h2>HẢI SẢN CẦU HÀ DỪA</h2><h3>HÓA ĐƠN THANH TOÁN</h3><p class="receipt-code">Mã đơn: ${esc(first?.id.slice(0,8).toUpperCase()||'—')}</p><div class="receipt-meta"><div><p><b>Bàn:</b> ${esc(table)} · Tại chỗ</p><p><b>Giờ vào:</b> ${time(opened)}</p></div><div><p><b>Ngày:</b> ${now.toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p><p><b>Giờ in:</b> ${time(now)}</p></div></div><table><colgroup><col style="width:9%"><col style="width:31%"><col style="width:9%"><col style="width:24%"><col style="width:27%"></colgroup><thead><tr><th>STT</th><th>Tên món</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${items.map((i,n)=>`<tr><td>${n+1}</td><td>${esc(i.name)}</td><td>${i.qty}</td><td><span class="receipt-amount ${amount(i.price).length>=10?'small':''}">${amount(i.price)}</span></td><td><span class="receipt-amount ${amount(i.price*i.qty).length>=10?'small':''}">${amount(i.price*i.qty)}</span></td></tr>`).join('')}</tbody></table><div class="receipt-summary"><div class="receipt-subtotal"><span>Thành tiền:</span><span>${amount(sum)} đ</span></div><div class="receipt-total"><span>Tổng tiền:</span><span>${amount(sum)} đ</span></div><p>Đơn vị tính: VNĐ</p><div class="receipt-footer">Cảm ơn Quý Khách!<br>Hẹn gặp lại.</div></div></article>`;
}

export async function printReceipt(orders,table){
 if(!orders.length)throw new Error('Bàn chưa có món để in.');
 const root=document.querySelector('#print');
 root.innerHTML=receiptMarkup(orders,table);
 root.classList.add('measuring');
 try{
   // CSS requires two concrete dimensions, not the invalid "58mm auto".
   // Measure the receipt at its printable width to avoid an A4-sized blank tail.
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const height=Math.max(60,Math.ceil(root.querySelector('.receipt').getBoundingClientRect().height*25.4/96)+10);
   let pageStyle=document.querySelector('#receipt-page-size');
   if(!pageStyle){pageStyle=document.createElement('style');pageStyle.id='receipt-page-size';document.head.append(pageStyle);}
   pageStyle.textContent=`@media print { @page { size:58mm ${height}mm; margin:4mm; } }`;
 }finally{root.classList.remove('measuring');}
 window.print();
}
