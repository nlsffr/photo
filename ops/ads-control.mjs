#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAdsConfig, setAdsMaster } from '../src/lib/ads-store-core.mjs';
import { isAdsRegistryReady, missingAdsPlacements } from '../src/lib/ads-registry-data.mjs';

export function validateCommand(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) return null;
  const keys=Object.keys(value).sort().join(',');
  if (value.action==='get' && keys==='action') return {action:'get'};
  if (value.action==='set' && keys==='action,enabled,revision' && typeof value.enabled==='boolean'
    && Number.isSafeInteger(value.revision) && value.revision>=0 && value.revision<=4_294_967_294) return value;
  return null;
}
export async function readCommand(stream=process.stdin) {
  const chunks=[];let size=0;
  const timer=setTimeout(()=>stream.destroy(new Error('invalid_request')),5000);
  try {
    for await (const chunk of stream) {
      const bytes=Buffer.from(chunk);size+=bytes.length;
      if (size>2048) throw new Error('invalid_request');
      chunks.push(bytes);
    }
    const value=validateCommand(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
    if (!value) throw new Error('invalid_request');
    return value;
  } catch { throw new Error('invalid_request'); }
  finally {clearTimeout(timer);}
}
export async function runAdsControl(value,db,actor) {
  const command=validateCommand(value);
  if (!command) return {ok:false,error:'invalid_request'};
  try {
    const result=command.action==='get' ? {ok:true,config:await readAdsConfig(db)}
      : await setAdsMaster(db,{revision:command.revision,enabled:command.enabled},actor);
    return result.ok ? {...result,ready:isAdsRegistryReady(result.config.placements),missing:missingAdsPlacements(result.config.placements)} : result;
  } catch { return {ok:false,error:'unavailable'}; }
}
async function main() {
  let db,result;
  try {
    if (process.argv.length!==2) throw new Error('invalid_request');
    const command=await readCommand();
    const owners=(process.env.SEO_EDITOR_USER_IDS??'').split(',').map(value=>value.trim()).filter(Boolean);
    if (!process.env.DATABASE_URL || (command.action==='set' && owners.length!==1)) throw new Error('unavailable');
    const {default:mysql}=await import('mysql2/promise');
    db=mysql.createPool({uri:process.env.DATABASE_URL,connectionLimit:1,waitForConnections:false,namedPlaceholders:true,
      timezone:'Z',connectTimeout:5000,ssl:process.env.DB_SSL==='true' ? {rejectUnauthorized:true,ca:process.env.DB_SSL_CA} : undefined});
    await db.execute('SET SESSION innodb_lock_wait_timeout=5');
    result=await runAdsControl(command,db,owners[0]);
  } catch(error) {result={ok:false,error:error?.message==='invalid_request' ? 'invalid_request' : 'unavailable'};}
  finally {if(db) {try{await db.end();}catch{/* Do not replace a committed result with a cleanup error. */}}}
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if(!result.ok)process.exitCode=1;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
