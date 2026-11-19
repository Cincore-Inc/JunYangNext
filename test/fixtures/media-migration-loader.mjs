export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'mysql2/promise') return {url:'data:text/javascript,'+encodeURIComponent(`export default {createConnection:async()=>({query:async sql=>[[...(sql.includes('staff_imagelist')?[{id:1,path:'staff/image/test.png'}]:sql.includes('company_payproof')?[{id:2,path:'staff/image/test.png'}]:[])]],execute:async(sql,p)=>{if(p[0]!=='oss:staff/image/test.png')throw Error('bad');return [{affectedRows:1}]},end:async()=>{}})}`),shortCircuit:true};
  if (specifier === 'ali-oss') return {url:'data:text/javascript,'+encodeURIComponent(`export default class {async get(){if(process.env.TEST_CONFLICT)return {content:Buffer.from('different')};let e=Error('missing');e.code='NoSuchKey';throw e}async put(key,bytes){if(this.uploaded||key!=='core-media/staff/image/test.png'||bytes.length<8)throw Error('bad');this.uploaded=true}}`),shortCircuit:true};
  return nextResolve(specifier,context);
}
