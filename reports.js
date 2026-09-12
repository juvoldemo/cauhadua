const DAY=86400000,OFFSET=7*3600000;
const localDate=time=>new Date(new Date(time).getTime()+OFFSET).toISOString().slice(0,10);
function report(orders,period='day',date=localDate(new Date())){
  if(!['day','week','month'].includes(period)||typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Object.assign(new Error('Ngày hoặc kỳ báo cáo không hợp lệ.'),{status:400});
  const anchor=new Date(date+'T00:00:00Z');let start=anchor.getTime(),end=start+DAY;
  if(period==='week'){start-=((anchor.getUTCDay()+6)%7)*DAY;end=start+7*DAY;}
  if(period==='month'){start=Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth(),1);end=Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+1,1);}
  const bins=Array.from({length:period==='day'?24:(end-start)/DAY},(_,i)=>({label:period==='day'?String(i).padStart(2,'0')+'h':new Date(start+i*DAY).toISOString().slice(0,10),revenue:0}));
  let revenue=0,quantity=0;const payments=new Set(),best=new Map();
  for(const o of orders){
    if(o.deletedAt||!o.paid||!o.paidAt||!Number.isFinite(Date.parse(o.paidAt)))continue;
    const time=Date.parse(o.paidAt)+OFFSET;
    if(time>=start&&time<end){
      const amount=o.items.reduce((sum,i)=>sum+i.qty*i.price,0);
      revenue+=amount;quantity+=o.items.reduce((sum,i)=>sum+i.qty,0);payments.add(o.paymentId||o.id);
      bins[Math.floor((time-start)/(period==='day'?3600000:DAY))].revenue+=amount;
    }
    if(localDate(o.paidAt)===date)for(const i of o.items){const row=best.get(i.id)||{id:i.id,name:i.name,quantity:0,revenue:0};row.quantity+=i.qty;row.revenue+=i.qty*i.price;best.set(i.id,row);}
  }
  return {period,date,from:new Date(start).toISOString().slice(0,10),to:new Date(end-DAY).toISOString().slice(0,10),revenue,quantity,payments:payments.size,average:payments.size?Math.round(revenue/payments.size):0,bins,bestsellers:[...best.values()].sort((a,b)=>b.quantity-a.quantity||b.revenue-a.revenue).slice(0,10)};
}
module.exports={report,localDate};
