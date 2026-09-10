const {test}=require('node:test');
const assert=require('node:assert/strict');
const {report}=require('../reports');
const order=(id,time,qty=1,paid=true,paymentId=id)=>({id,paid,paidAt:time,paymentId,items:[{id:'dish',name:'Món cũ',qty,price:10000}]});
test('Vietnam date boundaries, unpaid exclusion, daily ranking and receipt grouping',()=>{
 const orders=[order('before','2026-09-09T16:59:59Z'),order('start','2026-09-09T17:00:00Z',2,true,'bill'),order('same','2026-09-10T01:00:00Z',3,true,'bill'),order('end','2026-09-10T16:59:59Z'),order('after','2026-09-10T17:00:00Z'),order('unpaid','2026-09-10T03:00:00Z',99,false)];
 const r=report(orders,'day','2026-09-10');assert.equal(r.revenue,60000);assert.equal(r.quantity,6);assert.equal(r.payments,2);assert.equal(r.bestsellers[0].quantity,6);assert.equal(r.bins[0].revenue,20000);assert.equal(r.bins[23].revenue,10000);
});
test('Monday weeks, month/year boundaries, leap day and invalid inputs',()=>{
 const orders=[order('sunday','2026-08-30T16:59:59Z'),order('monday','2026-08-30T17:00:00Z'),order('september','2026-08-31T17:00:00Z'),order('next-week','2026-09-06T17:00:00Z')];
 const week=report(orders,'week','2026-09-02');assert.equal(week.from,'2026-08-31');assert.equal(week.to,'2026-09-06');assert.equal(week.revenue,20000);
 const month=report(orders,'month','2026-09-02');assert.equal(month.revenue,20000);assert.equal(month.bins.length,30);assert.equal(month.bestsellers.length,0);
 assert.equal(report([],'month','2024-02-29').bins.length,29);
 assert.equal(report([],'week','2027-01-01').from,'2026-12-28');
 assert.throws(()=>report([],'day','2026-02-30'));
 assert.throws(()=>report([],'year','2026-09-10'));
});
