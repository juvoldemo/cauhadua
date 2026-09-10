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

export async function printReceipt(orders,table){
 if(!orders.length)throw new Error('Bàn chưa có món để in.');
 const root=document.querySelector('#print');
 root.innerHTML=receiptMarkup(orders,table);
 root.classList.add('measuring');
 try{
   // CSS requires two concrete dimensions, not the invalid "80mm auto".
   // Measure the receipt at its printable width to avoid an A4-sized blank tail.
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const height=Math.max(60,Math.ceil(root.querySelector('.receipt').getBoundingClientRect().height*25.4/96)+10);
   let pageStyle=document.querySelector('#receipt-page-size');
   if(!pageStyle){pageStyle=document.createElement('style');pageStyle.id='receipt-page-size';document.head.append(pageStyle);}
   pageStyle.textContent=`@media print { @page { size:80mm ${height}mm; margin:4mm; } }`;
 }finally{root.classList.remove('measuring');}
 window.print();
}
