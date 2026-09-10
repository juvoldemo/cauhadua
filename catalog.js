const fs = require('node:fs');
const path = require('node:path');
const menu=[];let category='';
for(const line of fs.readFileSync(path.join(__dirname,'data/menu.txt'),'utf8').split(/\r?\n/)){
  if(/^\d+\./.test(line))category=line.replace(/^\d+\.\s*/,'');
  const m=line.match(/^- (.+) — (\d+)K(.*)$/);
  if(m)menu.push({id:String(menu.length+1),name:m[1],price:Number(m[2])*1000,category,unit:m[3],details:[],image:'',active:true});
  if(/^\s+\+/.test(line))menu.at(-1)?.details.push(line.trim().replace(/^\+\s*/,''));
}
module.exports=()=>({menu:structuredClone(menu),tables:Array.from({length:12},(_,i)=>i+1)});
