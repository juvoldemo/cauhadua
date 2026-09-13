import {connectPrinter,useSystemPrinter,usbConfigured} from './usb-printer.js';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>n.toLocaleString('vi-VN')+'đ';
const today=()=>new Date(Date.now()+7*3600000).toISOString().slice(0,10);
let password='',view='reports',period='day',date=today(),catalog={menu:[],tables:[]},reportData=null,search='',editing=null,image='',busy=false,reportVersion=0;
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4000);}
async function api(route,method='GET',body){
  const r=await fetch('/api/admin'+route,{method,headers:{Authorization:'Bearer '+encodeURIComponent(password),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();if(!r.ok){if(r.status===401){password='';busy=false;closeEditor();render();}throw new Error(data.error||'Không thể xử lý yêu cầu.');}return data;
}
const header=()=>`<header class="admin-header"><div class="admin-top"><a class="backlink" href="/">← Về trang gọi món</a>${password?'<button class="signout" id="logout">Đăng xuất</button>':''}</div><div class="intro"><div><span class="eyebrow">CẦU HÀ DỪA · QUẢN TRỊ</span><h1>${!password?'Chào chủ quán.':view==='reports'?'Quán mình hôm nay.':view==='menu'?'Chăm chút thực đơn.':'Sắp xếp bàn ăn.'}</h1></div></div></header>`;
function render(){
  $('#admin').innerHTML=header()+`<main class="admin-main">${!password?`<form id="login" class="login"><div class="brand-mark">♧</div><h2>Đăng nhập quản trị</h2><p>Quản lý món ngon, bàn ăn và theo dõi doanh thu của quán tại một nơi.</p><label class="field">Mật khẩu quản trị<input name="password" type="password" autocomplete="current-password" required placeholder="Nhập mật khẩu của bạn"></label><p id="login-error" class="error" role="alert"></p><button class="primary">Đăng nhập →</button></form>`:view==='reports'?`<div class="periods">${[['day','Ngày'],['week','Tuần'],['month','Tháng']].map(([p,n])=>`<button data-period="${p}" class="${p===period?'selected':''}">${n}</button>`).join('')}</div><div class="datefilter"><input type="date" id="report-date" aria-label="Chọn ngày báo cáo" value="${date}"><button id="today">Hôm nay</button><button id="refresh" aria-label="Cập nhật báo cáo">↻</button></div><div id="report-content">${reportData?reportHtml():'<div class="empty">Đang tải báo cáo…</div>'}</div>`:view==='menu'?`<div class="toolbar"><div><h2>Thực đơn</h2><small>${catalog.menu.filter(d=>d.active!==false).length} món đang bán</small></div><button class="primary compact" id="new-dish">+ Thêm món</button></div><div class="search"><span>⌕</span><input type="search" id="menu-search" value="${esc(search)}" placeholder="Tìm theo tên hoặc nhóm món" aria-label="Tìm món"></div><div id="menu-list">${menuHtml()}</div>`:`<div class="toolbar"><div><h2>Bàn ăn</h2><small>${catalog.tables.length} bàn trong quán</small></div><button class="primary compact" id="new-table">+ Thêm bàn</button></div><p class="note-box">Bàn mới sẽ tự xuất hiện ở trang gọi món. Chỉ có thể xóa bàn đã thanh toán hết đơn.</p><div class="table-admin">${catalog.tables.map(n=>`<article>▤<strong>Bàn ${n}</strong><button data-remove-table="${n}">Xóa bàn</button></article>`).join('')}</div>`}${password?printerSettings():''}</main>${password?`<nav class="nav admin-tabs" aria-label="Quản trị">${[['reports','▥','Doanh thu'],['menu','☷','Thực đơn'],['tables','▤','Bàn ăn']].map(([v,i,n])=>`<button data-view="${v}" class="${v===view?'active':''}"><span>${i}</span>${n}</button>`).join('')}</nav>`:''}`;
}
function printerSettings(){
 return `<section class="panel" aria-label="Cài đặt máy in"><h2>Máy in bill</h2><p class="hint">Cài đặt cho trình duyệt trên máy POS này. Trang hóa đơn sẽ dùng chế độ đã chọn.</p><button class="secondary" id="connectusb">Kết nối máy in USB</button><p class="hint">${usbConfigured()?'Chế độ in: USB trực tiếp (ITP5 · 80 mm)':'Chế độ in: hộp thoại hệ thống'}</p><button class="secondary" id="systemprinter">Dùng hộp thoại in hệ thống</button></section>`;
}
function reportHtml(){
  const r=reportData,max=Math.max(1,...r.bins.map(b=>b.revenue));
  return `<section class="revenue-card"><small>DOANH THU ĐÃ THANH TOÁN</small><h2>${money(r.revenue)}</h2><p>${r.from===r.to?r.from:r.from+' → '+r.to} · Giờ Việt Nam</p></section><div class="metrics"><div class="metric"><small>Lượt thanh toán</small><strong>${r.payments}</strong></div><div class="metric"><small>Số phần đã bán</small><strong>${r.quantity}</strong></div></div><section class="panel"><div class="sectionhead"><h2>Doanh thu ${r.period==='day'?'theo giờ':'theo ngày'}</h2></div><div class="chart">${r.bins.map(b=>`<button class="bar" data-bar="${esc(b.label+' · '+money(b.revenue))}" aria-label="${esc(b.label+': '+money(b.revenue))}"><i style="height:${Math.max(2,b.revenue/max*100)}px"></i><span>${r.period==='day'?b.label.slice(0,2):b.label.slice(8)}</span></button>`).join('')}</div><p class="chart-note" id="chart-note">Chạm vào cột để xem số tiền.</p><p class="hint">Trung bình mỗi lượt thanh toán: <b>${money(r.average)}</b></p></section><section class="panel"><div class="sectionhead"><h2>Món bán chạy trong ngày</h2></div><p class="hint">${r.date} · Xếp theo số phần đã thanh toán</p>${r.bestsellers.length?r.bestsellers.map((d,i)=>`<div class="rank"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(d.name)}</strong><small>${money(d.revenue)}</small></div><b>${d.quantity} phần</b></div>`).join(''):'<div class="empty">Chưa có món được thanh toán trong ngày này.</div>'}</section><p class="hint">Doanh thu được ghi nhận khi bấm “Xác nhận đã thanh toán”. Tuần tính từ thứ Hai đến Chủ nhật.</p>`;
}
function menuHtml(){const list=catalog.menu.filter(d=>d.active!==false&&(d.name+' '+d.category).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));return list.map(d=>`<article class="admin-dish">${d.image?`<img src="${esc(d.image)}" alt="${esc(d.name)}" loading="lazy">`:'<div class="admin-placeholder">🍲</div>'}<div><h3>${esc(d.name)}</h3><p>${esc(d.category)}</p><strong>${money(d.price)}</strong></div><button class="edit-button" data-edit="${d.id}">Sửa</button></article>`).join('')||'<div class="empty">Chưa có món phù hợp.</div>';}
async function loadReport(){
  const version=++reportVersion;
  try{const data=await api('/reports?period='+period+'&date='+date);if(version!==reportVersion||!password)return;reportData=data;if(view==='reports'&&$('#report-content'))$('#report-content').innerHTML=reportHtml();}
  catch(error){if(version!==reportVersion)return;if($('#report-content'))$('#report-content').innerHTML=`<div class="error">${esc(error.message)}</div>`;toast(error.message);}
}
function closeEditor(){if(busy)return;$('#editor').innerHTML='';editing=null;image='';}
function showDish(id){
  const d=id?catalog.menu.find(d=>d.id===id):{name:'',category:'',price:'',unit:'/ phần',details:[],image:''};editing=id||'';image=d.image||'';
  $('#editor').innerHTML=`<div class="overlay"><section class="sheet" role="dialog" aria-modal="true" aria-label="Chỉnh sửa món ăn"><div class="sheethead"><h2>${id?'Chỉnh sửa món':'Thêm món mới'}</h2><button class="close" id="close-editor" aria-label="Đóng">×</button></div><form id="dish-form"><div id="photo-preview">${image?`<img class="photo-preview" src="${esc(image)}" alt="Ảnh món ăn">`:'<div class="photo-empty">Thêm ảnh để món ăn hấp dẫn hơn</div>'}</div><label class="field">Hình ảnh món ăn<input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp"></label><button type="button" class="edit-button" id="remove-photo">Bỏ ảnh</button><label class="field">Tên món<input name="name" value="${esc(d.name)}" required maxlength="100" placeholder="Ví dụ: Nghêu hấp sả"></label><label class="field">Nhóm món<input name="category" value="${esc(d.category)}" list="groups" required maxlength="80" placeholder="Chọn nhóm hoặc nhập nhóm mới"><datalist id="groups">${[...new Set(catalog.menu.filter(d=>d.active!==false).map(d=>d.category))].map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist></label><label class="field">Giá bán (đồng)<input name="price" type="number" inputmode="numeric" min="0" max="100000000" step="1" value="${d.price}" required placeholder="49000"></label><label class="field">Đơn vị<input name="unit" value="${esc(d.unit)}" maxlength="30" placeholder="/ phần, / cây…"></label><label class="field">Mô tả / món trong combo (mỗi dòng một mục)<textarea name="details" maxlength="2010">${esc(d.details.join('\n'))}</textarea></label><p class="hint">Giá mới áp dụng cho đơn tạo sau khi lưu. Đơn đã lưu giữ nguyên giá cũ.</p><p class="error" id="form-error" role="alert"></p><div class="editor-actions"><button class="primary" type="submit">Lưu món ăn</button>${id?'<button class="secondary danger" type="button" id="delete-dish">Xóa món khỏi thực đơn</button>':''}</div></form></section></div>`;
}
function showTable(){const next=Math.max(0,...catalog.tables)+1;$('#editor').innerHTML=`<div class="overlay"><section class="sheet" role="dialog" aria-modal="true" aria-label="Thêm bàn"><div class="sheethead"><h2>Thêm bàn ăn</h2><button class="close" id="close-editor" aria-label="Đóng">×</button></div><form id="table-form"><label class="field">Số bàn<input name="number" type="number" inputmode="numeric" required min="1" max="999" step="1" value="${Math.min(next,999)}"></label><p class="error" id="form-error" role="alert"></p><button class="primary">Thêm bàn</button></form></section></div>`;}
async function photoData(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Chọn ảnh JPEG, PNG hoặc WebP không quá 10 MB.');
 const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');const ratio=Math.min(1,640/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let data=canvas.toDataURL('image/jpeg',.8);if(data.length>260000)data=canvas.toDataURL('image/jpeg',.5);if(data.length>260000)throw new Error('Ảnh quá chi tiết, hãy chọn ảnh nhỏ hơn.');return data;
}
function lock(on){busy=on;document.querySelectorAll('#editor button,#editor input,#editor textarea').forEach(el=>el.disabled=on);}
document.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const form=e.target,values=new FormData(form);
 if(form.id==='login'){
   const button=form.querySelector('button');button.disabled=true;password=values.get('password');
   try{await api('/session','POST');catalog=await api('/catalog');render();await loadReport();}catch(error){password='';render();$('#login-error').textContent=error.message;}finally{button.disabled=false;}return;
 }
 lock(true);
 try{
   if(form.id==='dish-form'){await api('/menu'+(editing?'/'+editing:''),editing?'PUT':'POST',{name:values.get('name'),category:values.get('category'),price:Number(values.get('price')),unit:values.get('unit'),details:values.get('details').split('\n').filter(s=>s.trim()),image});}
   if(form.id==='table-form')await api('/tables','POST',{number:Number(values.get('number'))});
   catalog=await api('/catalog');lock(false);closeEditor();render();toast('Đã lưu thay đổi ✓');
 }catch(error){if($('#form-error'))$('#form-error').textContent=error.message;else toast(error.message);}finally{lock(false);}
});
document.addEventListener('input',e=>{if(e.target.id==='menu-search'){search=e.target.value;$('#menu-list').innerHTML=menuHtml();}});
document.addEventListener('change',async e=>{
 if(e.target.id==='report-date'&&e.target.value){date=e.target.value;reportData=null;render();await loadReport();}
 if(e.target.id==='photo-file'&&e.target.files[0]){lock(true);try{const data=await photoData(e.target.files[0]);const result=await api('/images','POST',{data});image=result.url;$('#photo-preview').innerHTML=`<img class="photo-preview" src="${esc(image)}" alt="Ảnh món ăn">`;}catch(error){toast(error.message);}finally{lock(false);}}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEditor();});
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||busy)return;const d=b.dataset;
 try{
   if(b.id==='connectusb'&&password){busy=true;b.disabled=true;try{await connectPrinter();toast('Đã kết nối máy in USB.');render();}finally{busy=false;b.disabled=false;}}
   if(b.id==='systemprinter'&&password){useSystemPrinter();render();toast('Đã chọn hộp thoại in hệ thống.');}
   if(b.id==='logout'){password='';catalog={menu:[],tables:[]};reportData=null;reportVersion++;render();}
   if(d.view){view=d.view;render();if(view==='reports')await loadReport();else{catalog=await api('/catalog');render();}}
   if(d.period){period=d.period;reportData=null;render();await loadReport();}
   if(b.id==='today'){date=today();reportData=null;render();await loadReport();}
   if(b.id==='refresh')await loadReport();
   if(d.bar)$('#chart-note').textContent=d.bar;
   if(b.id==='new-dish')showDish();if(d.edit)showDish(d.edit);
   if(b.id==='new-table')showTable();if(b.id==='close-editor')closeEditor();
   if(b.id==='remove-photo'){image='';$('#photo-preview').innerHTML='<div class="photo-empty">Chưa có hình ảnh</div>';$('#photo-file').value='';}
   if(b.id==='delete-dish'&&confirm('Xóa món khỏi thực đơn? Các hóa đơn cũ vẫn được giữ lại.')){lock(true);await api('/menu/'+editing,'DELETE');catalog=await api('/catalog');lock(false);closeEditor();render();toast('Đã xóa món khỏi thực đơn.');}
   if(d.removeTable&&confirm('Xóa bàn '+d.removeTable+'?')){b.disabled=true;await api('/tables/'+d.removeTable,'DELETE');catalog=await api('/catalog');render();toast('Đã xóa bàn.');}
 }catch(error){toast(error.message);b.disabled=false;}finally{lock(false);}
});
render();
