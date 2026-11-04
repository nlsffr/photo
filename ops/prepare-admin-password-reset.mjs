#!/usr/bin/env node
import {createHash,randomBytes} from 'node:crypto';
import {lstat,open,unlink} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const TTL_MS=30*60*1000;
function ownerId() {
  const ids=(process.env.SEO_EDITOR_USER_IDS??'').split(',').map(value=>value.trim()).filter(Boolean);
  if(ids.length!==1)throw Error('PREPARATION_FAILED');
  return ids[0];
}
function validateOptions({email:inputEmail,outputFile,siteUrl}) {
  const email=typeof inputEmail==='string'?inputEmail.trim().toLowerCase():'';
  if(email.length>255||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof outputFile!=='string'||!isAbsolute(outputFile))throw Error('PREPARATION_FAILED');
  const site=new URL(siteUrl);
  if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)throw Error('PREPARATION_FAILED');
  return {email,outputFile,origin:site.origin,id:ownerId()};
}
const validHash=value=>typeof value==='string'&&/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(value);

/** Prepares a short-lived reset only; never changes a password or a session. */
export async function prepareAdminPasswordReset(options,connection) {
  const {email,outputFile,origin,id}=validateOptions(options);
  const directory=await lstat(dirname(outputFile));
  if(!directory.isDirectory()||directory.uid!==process.getuid?.()||(directory.mode&0o077))throw Error('PREPARATION_FAILED');
  const file=await open(outputFile,'wx',0o600),reserved=await file.stat();
  let transactionOpen=false,committed=false;
  try {
    await connection.beginTransaction();transactionOpen=true;
    const [rows]=await connection.execute('SELECT id,password_hash FROM users WHERE email=:email FOR UPDATE',{email});
    if(rows.length!==1||rows[0].id!==id||!validHash(rows[0].password_hash)||ownerId()!==id)throw Error('PREPARATION_FAILED');
    const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
    const expiresAt=new Date(Date.now()+TTL_MS);
    await connection.execute('UPDATE admin_password_resets SET used_at=NOW() WHERE user_id=:id AND used_at IS NULL',{id});
    const [inserted]=await connection.execute('INSERT INTO admin_password_resets (token_hash,user_id,expires_at,used_at) VALUES (:hash,:id,:expires,NULL)',{hash,id,expires:expiresAt});
    if(inserted.affectedRows!==1)throw Error('PREPARATION_FAILED');
    await connection.commit();transactionOpen=false;committed=true;
    await file.writeFile(JSON.stringify({resetURL:`${origin}/admin/password/reset#${token}`,expiresAt:expiresAt.toISOString()})+'\n','utf8');
    await file.sync();
    return {ok:true,resetPrepared:true,expiresAt:expiresAt.toISOString(),outputFile};
  } catch {
    if(transactionOpen){try{await connection.rollback();}catch{/* No connection details in operator output. */}}
    try {
      const current=await lstat(outputFile);
      if(current.ino===reserved.ino&&current.dev===reserved.dev&&current.size===0)await unlink(outputFile);
    } catch {/* Preserve any private partial output. */}
    throw Error(committed?'PRIVATE_OUTPUT_FAILED_AFTER_COMMIT':'PREPARATION_FAILED');
  } finally {try{await file.close();}catch{/* Synced or already failed. */}}
}

async function main() {
  let connection;
  try {
    const {values}=parseArgs({options:{email:{type:'string'},output:{type:'string'}},allowPositionals:false});
    const options={email:values.email,outputFile:values.output,siteUrl:process.env.NEXT_PUBLIC_SITE_URL};
    validateOptions(options);
    if(!process.env.DATABASE_URL)throw Error('PREPARATION_FAILED');
    const {default:mysql}=await import('mysql2/promise');
    connection=await mysql.createConnection({uri:process.env.DATABASE_URL,namedPlaceholders:true,timezone:'Z',connectTimeout:5000,
      ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:true,ca:process.env.DB_SSL_CA}:undefined});
    process.stdout.write(JSON.stringify(await prepareAdminPasswordReset(options,connection))+'\n');
  } catch(error) {
    process.stderr.write(JSON.stringify({ok:false,error:error?.message==='PRIVATE_OUTPUT_FAILED_AFTER_COMMIT'?error.message:'PREPARATION_FAILED'})+'\n');
    process.exitCode=1;
  } finally {if(connection){try{await connection.end();}catch{/* No raw driver errors. */}}}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
