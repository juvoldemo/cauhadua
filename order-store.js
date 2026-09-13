const fs = require('node:fs');
const path = require('node:path');
const seed = require('./catalog');
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const file = process.env.ORDER_DB || path.join(__dirname, 'data/orders.json');
const unavailable = () => Object.assign(new Error('Chưa cấu hình cơ sở dữ liệu. Hãy thêm DATABASE_URL trong Vercel rồi deploy lại.'), {status:503});
let sql, initialized;
async function database() {
  if (!databaseUrl) throw unavailable();
  sql ||= require('postgres')(databaseUrl, {max:1, prepare:false, idle_timeout:5, connect_timeout:10});
  if (!initialized) {
    initialized = (async () => {
      // Lock this state row during mutations to serialize requests across Vercel instances.
      await sql`CREATE TABLE IF NOT EXISTS chd_order_state (id integer PRIMARY KEY CHECK (id = 1), orders jsonb NOT NULL)`;
      await sql`INSERT INTO chd_order_state (id, orders) VALUES (1, '[]'::jsonb) ON CONFLICT DO NOTHING`;
      await sql`ALTER TABLE chd_order_state ADD COLUMN IF NOT EXISTS catalog jsonb`;
      await sql`ALTER TABLE chd_order_state ADD COLUMN IF NOT EXISTS auth jsonb`;
      await sql`CREATE TABLE IF NOT EXISTS chd_images (id text PRIMARY KEY, content text NOT NULL)`;
    })().catch(error => {initialized = undefined; throw error;});
  }
  await initialized;
  return sql;
}
function localState() {
  if (process.env.VERCEL) throw unavailable();
  const raw=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  return Array.isArray(raw)?{orders:raw,catalog:seed(),auth:{employees:[],sessions:[]}}:{orders:raw.orders,catalog:raw.catalog||seed(),auth:raw.auth||{employees:[],sessions:[]}};
}
async function readState() {
  if (!databaseUrl) return localState();
  const db = await database();
  const [state] = await db`SELECT orders, catalog, auth FROM chd_order_state WHERE id = 1`;
  return {orders:state.orders,catalog:state.catalog||seed(),auth:state.auth||{employees:[],sessions:[]}};
}
async function mutateState(update) {
  if (databaseUrl) {
    const db = await database();
    return db.begin(async tx => {
      const [state] = await tx`SELECT orders, catalog, auth FROM chd_order_state WHERE id = 1 FOR UPDATE`;
      state.catalog ||= seed();
      state.auth ||= {employees:[],sessions:[]};
      const result = update(state);
      await tx`UPDATE chd_order_state SET orders = ${tx.json(state.orders)}, catalog = ${tx.json(state.catalog)}, auth = ${tx.json(state.auth)} WHERE id = 1`;
      return result;
    });
  }
  // No await between read and rename: serialize local mutations in this Node process.
  const state = localState();
  const result = update(state);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(file + '.tmp', file);
  return result;
}
async function readCatalog(){
  if(!databaseUrl&&process.env.VERCEL)return seed();
  return (await readState()).catalog;
}
const imageDir=path.join(path.dirname(file),'images');
async function putImage(id,content){
  if(databaseUrl){const db=await database();await db`INSERT INTO chd_images (id,content) VALUES (${id},${content})`;}
  else{if(process.env.VERCEL)throw unavailable();fs.mkdirSync(imageDir,{recursive:true});fs.writeFileSync(path.join(imageDir,id+'.json'),JSON.stringify(content));}
}
async function getImage(id){
  if(!/^[a-f0-9-]{36}$/.test(id))return null;
  if(databaseUrl){const db=await database();return (await db`SELECT content FROM chd_images WHERE id=${id}`)[0]?.content;}
  if(process.env.VERCEL)return null;
  const imageFile=path.join(imageDir,id+'.json');
  return fs.existsSync(imageFile)?JSON.parse(fs.readFileSync(imageFile,'utf8')):null;
}
module.exports={read:async()=>(await readState()).orders,mutate:update=>mutateState(state=>update(state.orders)),readState,mutateState,readCatalog,putImage,getImage};
