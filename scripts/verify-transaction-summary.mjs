import { MongoClient } from 'mongodb';
const client = new MongoClient(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 5000 });
try {
 await client.connect();
 const c = client.db('junyang-finance').collection('transactions');
 for (const field of ['transactionType','accountName','oppositeAccountName']) {
  const match = {direction: {$exists:true}};
  const old = await c.aggregate([{$match:match},{$group:{_id:{value:`$${field}`,status:'$status',direction:'$direction'},sum:{$sum:'$amount'}}}],{maxTimeMS:30000}).toArray();
  const sum = (direction,status)=>({$sum:{$cond:[{$and:[{$eq:['$direction',direction]},{$eq:['$status',status]}]},{$ifNull:['$amount',0]},0]}});
  const fresh = await c.aggregate([{$match:match},{$group:{_id:`$${field}`,ou:sum('outgoing','未对账'),iu:sum('income','未对账'),ov:sum('outgoing','已对账'),iv:sum('income','已对账')}}],{maxTimeMS:30000}).toArray();
  const expected = new Map();
  for (const row of old) { const key=String(row._id.value ?? null); const vals=expected.get(key)||[0,0,0,0]; const i= row._id.direction==='outgoing' ? (row._id.status==='未对账'?0:row._id.status==='已对账'?2:-1) : row._id.direction==='income' ? (row._id.status==='未对账'?1:row._id.status==='已对账'?3:-1) : -1; if(i>=0) vals[i]=Number(row.sum); expected.set(key,vals); }
  let mismatch=0; for (const row of fresh) {const vals=expected.get(String(row._id)); if(!vals || [row.ou,row.iu,row.ov,row.iv].some((x,i)=>Math.abs(Number(x)-vals[i])>0.001)) mismatch++;}
  if (expected.size !== fresh.length || mismatch) process.exitCode = 1;
  console.log(JSON.stringify({field,legacyGroups:expected.size,currentGroups:fresh.length,mismatch}));
 }
} catch(e) {console.error(e.name);process.exitCode=1} finally {await client.close()}
