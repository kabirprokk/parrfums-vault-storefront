// Integration checks against an isolated PostgreSQL runtime. No live customer records.
// Development dependency: @electric-sql/pglite
const {PGlite}=require('@electric-sql/pglite');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1'))$$;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  const dir=path.join(__dirname,'../supabase/migrations');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
  const user='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users(id) values ($1),($2)',[user,other]);
  // Explicit fixture quantities/components are test-only, never production seeds.
  await db.exec(`update public.product_prices set available_quantity=100;
    insert into public.offer_components values('festive-four','angel-share',100,2),('festive-four','vanilla-28',30,2),('duo-plus','angel-share',50,2),('duo-plus','guilty-man',30,1);`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false)`);
  const delivery={recipient_name:'Test Customer',email:'test@example.invalid',phone:'9876543210',address_line1:'123 Test Road',city:'Mumbai',state:'Maharashtra',postal_code:'400001'};
  async function order(items,city='Mumbai'){
    return (await db.query('select public.checkout_order($1::jsonb,$2::jsonb,$3::uuid) as id',[JSON.stringify(items),JSON.stringify({...delivery,city}),crypto.randomUUID()])).rows[0].id;
  }
  for(const [size,price] of [[30,400],[50,750],[100,1250]]){
    const id=await order([{kind:'product',id:'angel-share',size_ml:size,quantity:1,price:1}]);
    const row=(await db.query('select subtotal_inr,shipping_inr,total_inr from public.customer_orders where id=$1',[id])).rows[0];
    assert.equal(Number(row.subtotal_inr),price,'Server must ignore browser prices');
    assert.equal(Number(row.shipping_inr),100,'Mumbai shipping never becomes free');
    assert.equal(Number(row.total_inr),price+100);
  }
  for(const city of [' Mumbai ','MUMBAI','Bombay']){
    const id=await order([{kind:'offer',id:'festive-four',quantity:1}],city);
    const row=(await db.query('select shipping_inr,total_inr from public.customer_orders where id=$1',[id])).rows[0];
    assert.equal(Number(row.shipping_inr),100);assert.equal(Number(row.total_inr),2700);
  }
  const outside=await order([{kind:'offer',id:'duo-plus',quantity:2}],'Pune');
  const out=(await db.query('select shipping_inr,total_inr from public.customer_orders where id=$1',[outside])).rows[0];
  assert.equal(Number(out.shipping_inr),120);assert.equal(Number(out.total_inr),3320);
  await assert.rejects(order([{kind:'product',id:'angel-share',size_ml:30,quantity:21}]),/quantity/i);
  await assert.rejects(order([{kind:'product',id:'angel-share',size_ml:999,quantity:1}]),/unavailable/i);
  await assert.rejects(db.exec("update public.product_prices set price_inr=1"),/permission denied/i);
  await assert.rejects(db.exec("insert into public.customer_orders(user_id) values('"+user+"')"),/permission denied/i);
  await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
  assert.equal((await db.query('select * from public.customer_orders')).rows.length,0,'Orders must be private to their owner');
  await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
  assert.equal((await db.query('select * from public.product_prices')).rows.length,18);
  await assert.rejects(db.exec("select public.checkout_order('[]','{}',gen_random_uuid())"),/permission denied/i);
  await db.close();
  console.log('PASS: all migrations, server pricing, location shipping, combos, validation, catalogue grants and order isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
