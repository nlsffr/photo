import {createHash} from 'node:crypto';

type SqlParams=Record<string,string|Date>;
interface ResetConnection {
  beginTransaction():Promise<void>;
  execute(sql:string,params:SqlParams):Promise<unknown>;
  commit():Promise<void>;
  rollback():Promise<void>;
  release():void;
}
export interface PasswordResetDatabase {
  execute(sql:string,params:SqlParams):Promise<unknown>;
  getConnection():Promise<ResetConnection>;
}
interface ResetDependencies {
  isAllowed(id:string):boolean;
  hashPassword(password:string):Promise<string>;
  newSessionToken():string;
  sessionExpiry():Date;
}
type ResetInput={token:string;password:string};
type ResetResult={ok:true;token:string}|{ok:false;error:'invalid'|'unavailable'};
export function validPasswordResetInput(input:unknown):input is ResetInput {
  if(!input || typeof input!=='object' || Array.isArray(input)) return false;
  const value=input as Record<string,unknown>;
  return Object.keys(value).sort().join(',')==='password,token' && typeof value.token==='string'
    && /^[a-f0-9]{64}$/.test(value.token) && typeof value.password==='string'
    && value.password.length>=12 && value.password.length<=200;
}
function validHash(value:unknown):value is string {
  return typeof value==='string' && /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(value);
}
function rows(result:unknown):Array<{user_id?:string;id?:string;password_hash?:unknown}> {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : [];
}
const changed=(result:unknown)=>Array.isArray(result)&&result[0]?.affectedRows===1;
const FIND=`SELECT r.user_id,u.password_hash FROM admin_password_resets r
  JOIN users u ON u.id=r.user_id WHERE r.token_hash=:hash AND r.used_at IS NULL
  AND r.expires_at>NOW() AND u.password_hash IS NOT NULL`;

export async function resetAdminPassword(database:PasswordResetDatabase,input:unknown,dependencies:ResetDependencies):Promise<ResetResult> {
  if(!validPasswordResetInput(input)) return {ok:false,error:'invalid'};
  const hash=createHash('sha256').update(input.token).digest('hex');
  let connection:ResetConnection|undefined,open=false;
  try {
    const candidate=rows(await database.execute(FIND,{hash}))[0];
    if(!candidate?.user_id || !validHash(candidate.password_hash) || !dependencies.isAllowed(candidate.user_id)) return {ok:false,error:'invalid'};
    // Expired/unknown tokens and unauthorized accounts never run scrypt.
    const password=await dependencies.hashPassword(input.password);
    if(!validHash(password)) throw new Error('invalid_hash');
    connection=await database.getConnection();
    await connection.beginTransaction();open=true;
    // Same user-first lock order as the private preparation CLI.
    const user=rows(await connection.execute('SELECT id,password_hash FROM users WHERE id=:id AND password_hash IS NOT NULL FOR UPDATE',{id:candidate.user_id}))[0];
    const reset=rows(await connection.execute(`SELECT user_id FROM admin_password_resets WHERE token_hash=:hash
      AND user_id=:id AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`,{hash,id:candidate.user_id}))[0];
    if(!user || user.id!==candidate.user_id || user.password_hash!==candidate.password_hash
      || !validHash(user.password_hash) || !reset || reset.user_id!==candidate.user_id || !dependencies.isAllowed(candidate.user_id)) {
      await connection.rollback();open=false;return {ok:false,error:'invalid'};
    }
    const token=dependencies.newSessionToken(),expiry=dependencies.sessionExpiry();
    if(!/^[a-f0-9]{64}$/.test(token) || !(expiry instanceof Date) || !Number.isFinite(expiry.getTime())) throw new Error('invalid_session');
    const updated=await connection.execute('UPDATE users SET password_hash=:password WHERE id=:id AND BINARY password_hash=BINARY :previousPassword',
      {password,id:candidate.user_id,previousPassword:candidate.password_hash});
    const consumed=await connection.execute(`UPDATE admin_password_resets SET used_at=NOW() WHERE token_hash=:hash
      AND user_id=:id AND used_at IS NULL AND expires_at>NOW()`,{hash,id:candidate.user_id});
    if(!changed(updated)||!changed(consumed)) {
      await connection.rollback();open=false;return {ok:false,error:'invalid'};
    }
    await connection.execute('DELETE FROM sessions WHERE user_id=:id',{id:candidate.user_id});
    if(!changed(await connection.execute('INSERT INTO sessions (id,user_id,expires_at) VALUES (:token,:id,:expiry)',{token,id:candidate.user_id,expiry}))) throw new Error('session_failed');
    await connection.commit();open=false;
    return {ok:true,token};
  } catch {
    if(open&&connection){try{await connection.rollback();}catch{/* Keep failures generic. */}}
    return {ok:false,error:'unavailable'};
  } finally {try{connection?.release();}catch{/* Never expose driver details. */}}
}
