import {printReceipt} from './receipt.js';
const $=s=>document.querySelector(s), money=n=>n.toLocaleString('vi-VN')+'đ', esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let menu=[],tables=[],orders=[],view='menu',table=1,category='Tất cả',query='',modal=false,sending=false,connected=false;
let carts={};try{carts=JSON.parse(localStorage.getItem('chd-carts')||'{}')}catch{}
const cart=()=>carts[table]||[],total=items=>items.reduce((s,i)=>s+i.price*i.qty,0),count=()=>cart().reduce((s,i)=>s+i.qty,0),active=()=>orders.filter(o=>o.table===table&&!o.paid);
const icons={menu:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',tables:'<path d="M3 10h18M5 10V5h14v5M5 10v11M19 10v11M5 16h14"/>',bills:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>'};
const svg=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[k]}</svg>`;
const emoji=d=>d.category.includes('COMBO')?'🍲':d.category.includes('ỐC')?'🐚':d.category==='NGHÊU'?'🦪':d.category==='HÀU'?'🦪':d.category==='GỎI'?'🥗':d.category==='LẨU'?'🥘':d.category.includes('NƯỚC')?'🥤':d.category.includes('TÀU')?'🍮':d.category.includes('TOPPING')?'🥬':'🍟';
const short=c=>({'COMBO GIÁ HỜI':'Combo','GỌI THÊM – MÓN ĂN':'Ăn thêm','TOPPING – THÊM NGON':'Topping','NƯỚC GIẢI KHÁT':'Nước uống'}[c]||c.charAt(0)+c.slice(1).toLowerCase());
function toast(s){$('#toast').textContent=s;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3200)}
async function api(url,options){const r=await fetch(url,options);if(!r.ok){let e;try{e=await r.json()}catch{}throw new Error(e?.error||'Không thể xử lý. Vui lòng thử lại.')}return r.json()}
function save(){localStorage.setItem('chd-carts',JSON.stringify(carts))}
function qty(id,delta){if(sending)return;carts[table]??=[];let i=cart().find(i=>i.id===id);if(!i&&delta>0){const d=menu.find(d=>d.id===id);if(!d){toast('Món này không còn bán.');return;}cart().push({id,name:d.name,price:d.price,qty:1,note:''})}else if(i){i.qty=Math.min(99,i.qty+delta);carts[table]=cart().filter(i=>i.qty>0)}save();render();if(modal)showCart()}
function tablebar(){return `<div class="tablebar"><span class="tableicon">▤</span><div><label for="table">ĐANG PHỤC VỤ</label><select id="table">${tables.map(n=>`<option value="${n}" ${table===n?'selected':''}>Bàn ${String(n).padStart(2,'0')}</option>`).join('')}</select></div><span class="pill">${active().length?'Đang phục vụ':'Sẵn sàng gọi món'}</span></div>`}
function dishes(){const list=menu.filter(d=>(category==='Tất cả'||d.category===category)&&d.name.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));return `<div class="sectionhead"><h2>${category==='Tất cả'?'Thực đơn hôm nay':short(category)}</h2><span>${list.length} món ngon</span></div>${list.length?list.map(d=>{const n=cart().find(i=>i.id===d.id)?.qty||0;return `<article class="dish"><div class="dish-art" aria-hidden="true">${d.image?`<img src="${esc(d.image)}" alt="" loading="lazy">`:emoji(d)}</div><div class="dishinfo"><h3>${esc(d.name)}</h3><p>${d.details.length?esc(d.details.join(' · ')):esc(short(d.category))+' · Chế biến khi gọi'}</p><div class="dishbottom"><span class="price">${money(d.price)} <small>${d.unit||'/ phần'}</small></span><div class="quantity">${n?`<button class="add" data-minus="${d.id}" aria-label="Bớt ${esc(d.name)}">−</button><span>${n}</span>`:''}<button class="add" data-plus="${d.id}" aria-label="Thêm ${esc(d.name)}">+</button></div></div></div></article>`}).join(''):'<div class="empty">Không tìm thấy món phù hợp.</div>'}`}
let selectedBill=null,updatingQuantity=false,deletingBill=false;
function billQuantity(item){return `<span class="quantity bill-quantity" role="group" aria-label="Số lượng ${esc(item.name)}"><button class="add" data-quantity-order="${esc(item.orderId)}" data-quantity-index="${item.index}" data-delta="-1" aria-label="Giảm ${esc(item.name)}" ${item.qty<=1||updatingQuantity?'disabled':''}>−</button><span>${item.qty}</span><button class="add" data-quantity-order="${esc(item.orderId)}" data-quantity-index="${item.index}" data-delta="1" aria-label="Tăng ${esc(item.name)}" ${item.qty>=99||updatingQuantity?'disabled':''}>+</button></span>`;}
const billTime=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'Chưa có thời gian thanh toán';
function invoices(){const groups=new Map();for(const order of orders){const key=order.paid?'paid:'+order.table+':'+(order.paymentId||order.id):'open:'+order.table;if(!groups.has(key))groups.set(key,{key,table:order.table,paid:order.paid,time:order.paid?order.paidAt:order.createdAt,orders:[]});groups.get(key).orders.push(order);}return [...groups.values()].sort((a,b)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0));}
function invoiceCard(entry){return `<button class="invoice-card" data-bill="${esc(entry.key)}"><span><strong>Bàn ${String(entry.table).padStart(2,'0')}</strong><small>${entry.paid?billTime(entry.time):'Chưa thanh toán'}</small></span><b>${money(total(entry.orders.flatMap(o=>o.items)))}</b><span aria-hidden="true">›</span></button>`}
function bill(){const entries=invoices(),entry=entries.find(o=>o.key===selectedBill);if(entry){const items=entry.orders.flatMap(o=>o.items.map((i,index)=>({...i,orderId:o.id,index})));return `<button class="secondary" id="backbills">← Danh sách hóa đơn</button><article class="panel"><div class="panelhead"><strong>Bàn ${String(entry.table).padStart(2,'0')}</strong><small>${entry.paid?'Đã thanh toán':'Hóa đơn tạm tính'}</small></div><p class="hint">${entry.paid?'Thanh toán lúc '+billTime(entry.time):entry.orders.length+' lượt gọi'}</p>${items.map(i=>`<div class="dishbottom orderline"><span>${i.qty} × ${esc(i.name)}<small>${money(i.price)} / món${i.note?' · '+esc(i.note):''}</small></span><span class="order-actions">${money(i.qty*i.price)}${entry.paid?'':billQuantity(i)}${entry.paid?'':`<button class="remove-item" data-remove-order="${esc(i.orderId)}" data-remove-index="${i.index}" aria-label="Xóa ${esc(i.name)}">Xóa món</button>`}</span></div>`).join('')}<div class="totals"><span>${entry.paid?'Đã thanh toán':'Tổng thanh toán'}</span><span>${money(total(items))}</span></div><button class="primary" id="printbill">▤ In bill</button>${entry.paid?'':'<button class="secondary" id="checkout">Xác nhận đã thanh toán</button>'}<button class="secondary delete-bill" id="deletebill" ${deletingBill?'disabled':''}>${deletingBill?'Đang xoá…':'Xoá hoá đơn'}</button></article>`;}selectedBill=null;const pending=entries.filter(o=>!o.paid),paid=entries.filter(o=>o.paid);return `${pending.length?`<div class="sectionhead"><h2>Chưa thanh toán</h2><span>${pending.length} bàn</span></div><div class="unpaid-total"><span>Tổng số tiền chưa thanh toán</span><strong>${money(total(pending.flatMap(entry=>entry.orders.flatMap(order=>order.items))))}</strong></div>${pending.map(invoiceCard).join('')}`:''}<div class="sectionhead history-head"><h2>Lịch sử thanh toán</h2><span>${paid.length} hóa đơn</span></div>${paid.length?paid.map(invoiceCard).join(''):'<div class="empty">▤<b>Chưa có lịch sử thanh toán</b>Các bàn đã thanh toán sẽ được lưu tại đây.</div>'}`;}
function render(){const titles={menu:['HÔM NAY ĂN GÌ?','Gọi món, thật dễ.'],tables:['KHÔNG GIAN QUÁN','Chọn bàn phục vụ'],bills:['TRỌN VẸN BỮA NGON','Hóa đơn các bàn']};$('#app').innerHTML=`<header><div class="brand"><div class="brand-mark">♧</div><div><small>HẢI SẢN TƯƠI NGON</small><strong>Cầu Hà Dừa<span style="color:#d3c48e">.</span></strong></div><span class="live"><i class="dot" style="background:${connected?'#b2ce83':'#ec9970'}"></i>${connected?'Đã kết nối':'Đang kết nối'}</span></div><div class="intro"><div><span class="eyebrow">${titles[view][0]}</span><h1>${titles[view][1]}</h1></div><div class="date">THÁNG ${new Date().getMonth()+1}<b>${String(new Date().getDate()).padStart(2,'0')}</b></div></div></header><main class="workspace">${view==='menu'?`${tablebar()}<div class="search"><span>⌕</span><input id="search" type="search" placeholder="Tìm món ngon cho bàn…" aria-label="Tìm món" value="${esc(query)}"></div><div class="categories">${['Tất cả',...new Set(menu.map(d=>d.category))].map(c=>`<button data-category="${esc(c)}" class="${category===c?'active':''}">${short(c)}</button>`).join('')}</div><div id="dishes">${dishes()}</div><div class="footer-note">Tươi ngon mỗi ngày · Vui từng bữa ăn</div>`:view==='bills'?bill():`<div class="sectionhead"><h2>Sơ đồ bàn</h2><span>${tables.length} bàn</span></div><p class="hint">Chọn bàn để thêm món hoặc xem hóa đơn.</p><div class="tablegrid">${tables.map(n=>{const busy=orders.some(o=>o.table===n&&!o.paid);return `<button class="tabletile ${busy?'busy':''}" data-table="${n}">▤<b>Bàn ${String(n).padStart(2,'0')}</b><small>${busy?'Đang phục vụ':'Bàn trống'}</small></button>`}).join('')}</div>`}</main>${view==='menu'&&count()?`<button class="cartbar" id="opencart"><span class="count">${count()}</span><span><strong>Xem món đã chọn</strong><small>Bàn ${String(table).padStart(2,'0')} · Chưa lưu đơn</small></span><span class="sum">${money(total(cart()))} →</span></button>`:''}<nav class="nav" aria-label="Điều hướng">${[['menu','Thực đơn'],['tables','Bàn ăn'],['bills','Hóa đơn']].map(([k,n])=>`<button data-view="${k}" class="${view===k?'active':''}">${svg(k)}${n}</button>`).join('')}</nav>`;}
function showCart(){modal=true;$('#overlay').innerHTML=`<div class="overlay"><section class="sheet" role="dialog" aria-modal="true" aria-label="Món đã chọn"><div class="sheethead"><h2>Món đã chọn · Bàn ${table}</h2><button class="close" id="closecart" aria-label="Đóng" ${sending?'disabled':''}>×</button></div><p class="hint">Kiểm tra món và ghi chú trước khi lưu đơn.</p>${cart().map(i=>`<div class="cartitem"><div class="dishbottom"><strong>${esc(i.name)}</strong><div class="quantity"><button class="add" data-minus="${i.id}" ${sending?'disabled':''}>−</button>${i.qty}<button class="add" data-plus="${i.id}" ${sending?'disabled':''}>+</button></div></div><p class="hint">${money(i.price*i.qty)}</p><textarea data-note="${i.id}" maxlength="200" rows="1" placeholder="Ghi chú: ít cay, không hành…" aria-label="Ghi chú ${esc(i.name)}" ${sending?'disabled':''}>${esc(i.note)}</textarea></div>`).join('')||'<div class="empty">Chưa chọn món nào.</div>'}<div class="totals"><span>${count()} món</span><span>${money(total(cart()))}</span></div><button class="primary" id="send" ${!count()||sending?'disabled':''}>${sending?'Đang lưu…':'Lưu đơn gọi món →'}</button></section></div>`}
function close(){modal=false;$('#overlay').innerHTML=''}
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;$('#dishes').innerHTML=dishes()}if(e.target.dataset.note){const item=cart().find(i=>i.id===e.target.dataset.note);if(item){item.note=e.target.value;save()}}});
document.addEventListener('change',e=>{if(e.target.id==='table'){table=Number(e.target.value);render()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sending)close()});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;try{
 if(d.plus)qty(d.plus,1);if(d.minus)qty(d.minus,-1);
 if(d.quantityOrder){
   if(updatingQuantity)return;
   const order=orders.find(o=>o.id===d.quantityOrder),index=Number(d.quantityIndex),item=order?.items[index],next=item?.qty+Number(d.delta);
   if(!item||order.paid||next<1||next>99)return;
   updatingQuantity=true;render();
   try{
     const updated=await api('/api/orders/'+encodeURIComponent(order.id)+'/items/'+index,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({qty:next,expectedItems:order.items})});
     orders=orders.map(o=>o.id===updated.id?updated:o);
   }catch(error){
     try{orders=await api('/api/orders?history=all');}catch{}
     throw error;
   }finally{updatingQuantity=false;render();}
 }
 if(d.bill){selectedBill=d.bill;render();window.scrollTo(0,0)}if(b.id==='backbills'){selectedBill=null;render()}
 if(d.view){selectedBill=null;view=d.view;render();window.scrollTo(0,0)}if(d.table){table=Number(d.table);view='menu';render()}
 if(d.category){category=d.category;document.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('active',el.dataset.category===category));$('#dishes').innerHTML=dishes()}
 if(b.id==='opencart')showCart();if(b.id==='closecart')close();
 if(b.id==='send'&&!sending){sending=true;showCart();const payload=JSON.stringify({table,items:cart()});let pending=JSON.parse(localStorage.getItem('chd-pending')||'null');if(!pending||pending.payload!==payload){pending={payload,id:crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random()};localStorage.setItem('chd-pending',JSON.stringify(pending))}try{await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(payload),requestId:pending.id})});carts[table]=[];save();localStorage.removeItem('chd-pending');close();orders=await api('/api/orders?history=all');toast('Đã lưu đơn gọi món ✓')}finally{sending=false;render();if(modal)showCart()}}
 if(b.id==='printbill'){b.disabled=true;try{const entry=invoices().find(o=>o.key===selectedBill);if(entry)await printReceipt(entry.orders,entry.table);}finally{b.disabled=false;}}
 if(d.removeOrder){const order=orders.find(o=>o.id===d.removeOrder),index=Number(d.removeIndex),item=order?.items[index];if(!item||order.paid)return;if(!confirm(`Xóa ${item.qty} × ${item.name} khỏi hóa đơn bàn ${order.table}?`))return;b.disabled=true;try{await api('/api/orders/'+encodeURIComponent(order.id)+'/items/'+index,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedItems:order.items})});toast('Đã xóa món và cập nhật tổng tiền ✓');}finally{orders=await api('/api/orders?history=all');render();}}
 if(b.id==='deletebill'){
   if(deletingBill||updatingQuantity)return;
   const entry=invoices().find(o=>o.key===selectedBill);if(!entry)return;
   if(!confirm(`Xoá hoá đơn bàn ${entry.table} với tổng tiền ${money(total(entry.orders.flatMap(o=>o.items)))}?${entry.paid?' Hoá đơn này sẽ được xoá khỏi lịch sử và báo cáo doanh thu.':''}`))return;
   deletingBill=true;render();
   try{
     await api('/api/invoices',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:entry.key,expectedOrders:entry.orders})});
     const ids=new Set(entry.orders.map(o=>o.id));orders=orders.filter(o=>!ids.has(o.id));
     if(selectedBill===entry.key)selectedBill=null;
     toast('Đã xoá hoá đơn ✓');
   }catch(error){
     try{orders=await api('/api/orders?history=all');}catch{}
     throw error;
   }finally{deletingBill=false;render();}
 }
 if(b.id==='checkout'){const entry=invoices().find(o=>o.key===selectedBill);if(!entry||entry.paid)return;const selected=entry.orders;if(!confirm(`Xác nhận bàn ${entry.table} đã thanh toán ${money(total(selected.flatMap(o=>o.items)))}?`))return;b.disabled=true;await api('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:selected.map(o=>o.id)})});orders=await api('/api/orders?history=all');selectedBill=null;render();toast('Đã thanh toán. Bàn đã sẵn sàng ✓')}
}catch(error){toast(error.message);b.disabled=false}});
function applyCatalog(catalog){
 const changed=JSON.stringify(menu)!==JSON.stringify(catalog.menu)||JSON.stringify(tables)!==JSON.stringify(catalog.tables);
 menu=catalog.menu;tables=catalog.tables;
 if(!tables.includes(table)){if(modal){close();toast('Bàn đã được xóa. Vui lòng chọn bàn khác.');}table=tables[0]||1;}
 if(category!=='Tất cả'&&!menu.some(d=>d.category===category))category='Tất cả';
 let adjusted=false;
 for(const key of Object.keys(carts)){
   carts[key]=carts[key].filter(i=>{const dish=menu.find(d=>d.id===i.id);if(!dish){adjusted=true;return false;}if(i.price!==dish.price||i.name!==dish.name){adjusted=true;i.price=dish.price;i.name=dish.name;}return true;});
 }
 if(adjusted){save();toast('Thực đơn đã đổi. Vui lòng kiểm tra lại món và giá trong giỏ.');}
 return changed;
}
let syncing=false,lastSyncError='';
async function syncOrders(){
 if(syncing||sending||document.hidden)return;
 syncing=true;
 try{
   const [next,catalog]=await Promise.all([api('/api/orders?history=all'),api('/api/catalog')]);
   const catalogChanged=applyCatalog(catalog);
   const changed=JSON.stringify(next)!==JSON.stringify(orders)||!connected||catalogChanged;
   orders=next;connected=true;lastSyncError='';
   if(changed){const searching=document.activeElement?.id==='search';const position=searching?document.activeElement.selectionStart:null;render();if(searching&&$('#search')){$('#search').focus();if(position!==null)$('#search').setSelectionRange(position,position);}}
   if(catalogChanged&&modal&&document.activeElement?.tagName!=='TEXTAREA')showCart();
 }catch(error){
   const wasConnected=connected;connected=false;
   if(wasConnected&&document.activeElement?.id!=='search')render();
   if(error.message!==lastSyncError){toast(error.message);lastSyncError=error.message;}
 }finally{syncing=false;}
}
async function init(){
 render();
 try{applyCatalog(await api('/api/catalog'));render();}catch(error){toast(error.message);}
 await syncOrders();
 // Short requests work across serverless instances; no process-local SSE channels.
 setInterval(syncOrders,4000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncOrders();});
}init();
