const fs = require('node:fs');
const path = require('node:path');
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
    })().catch(error => {initialized = undefined; throw error;});
  }
  await initialized;
  return sql;
}
function localOrders() {
  if (process.env.VERCEL) throw unavailable();
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}
async function read() {
  if (!databaseUrl) return localOrders();
  const db = await database();
  const [state] = await db`SELECT orders FROM chd_order_state WHERE id = 1`;
  return state.orders;
}
async function mutate(update) {
  if (databaseUrl) {
    const db = await database();
    return db.begin(async tx => {
      const [state] = await tx`SELECT orders FROM chd_order_state WHERE id = 1 FOR UPDATE`;
      const result = update(state.orders);
      await tx`UPDATE chd_order_state SET orders = ${tx.json(state.orders)} WHERE id = 1`;
      return result;
    });
  }
  // No await between read and rename: serialize local mutations in this Node process.
  const orders = localOrders();
  const result = update(orders);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file + '.tmp', JSON.stringify(orders, null, 2));
  fs.renameSync(file + '.tmp', file);
  return result;
}
module.exports = {read, mutate};
