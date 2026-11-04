// Shared by the Next server and the fixed operator CLI. No browser side effects.
import { isAdsRegistryReady } from './ads-registry-data.mjs';

const KEYS = ['header','footer','underVideo','feed','popunder','interstitial','slider'];
const MAX_REVISION = 4_294_967_294;
const COLUMNS = 'enabled, placements, revision, updated_at';
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const revisionValid = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_REVISION;

export function validateAdsSave(value) {
  if (!exactKeys(value,['revision','enabled','placements']) || !revisionValid(value.revision)
      || typeof value.enabled !== 'boolean' || !exactKeys(value.placements,KEYS)
      || KEYS.some(key => typeof value.placements[key] !== 'boolean')) return null;
  return {revision:value.revision, enabled:value.enabled, placements:{...value.placements}};
}
function fromRow(row) {
  if (!row || ![0,1].includes(row.enabled)) throw new Error('unavailable');
  let placements;
  try { placements = typeof row.placements === 'string' ? JSON.parse(row.placements) : row.placements; }
  catch { throw new Error('unavailable'); }
  const value = validateAdsSave({enabled:row.enabled===1, placements, revision:Number(row.revision)});
  if (!value) throw new Error('unavailable');
  const updatedAt = row.updated_at == null ? null : new Date(row.updated_at).toISOString();
  return {...value,updatedAt};
}
export async function readAdsConfig(db) {
  if (!db) throw new Error('unavailable');
  const [rows] = await db.execute(`SELECT ${COLUMNS} FROM ad_settings WHERE id = 1`);
  return fromRow(rows[0]);
}

async function update(db, input, actor, masterOnly, ready) {
  const valid = masterOnly
    ? exactKeys(input,['revision','enabled']) && revisionValid(input.revision) && typeof input.enabled==='boolean'
    : validateAdsSave(input);
  if (!valid || typeof actor !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(actor)) return {ok:false,error:'invalid_request'};
  if (!db) return {ok:false,error:'unavailable'};
  let connection, open=false;
  try {
    connection=await db.getConnection();
    await connection.beginTransaction(); open=true;
    const [rows]=await connection.execute(`SELECT ${COLUMNS} FROM ad_settings WHERE id = 1 FOR UPDATE`);
    const current=fromRow(rows[0]);
    if (input.revision !== current.revision) {
      await connection.rollback(); open=false; return {ok:false,error:'conflict'};
    }
    const next={revision:input.revision,enabled:input.enabled,placements:masterOnly ? current.placements : input.placements};
    if (next.enabled && !ready(next.placements)) {
      await connection.rollback(); open=false; return {ok:false,error:'not_ready'};
    }
    if (next.enabled===current.enabled && KEYS.every(key=>next.placements[key]===current.placements[key])) {
      await connection.commit(); open=false; return {ok:true,config:current};
    }
    if (current.revision===MAX_REVISION) throw new Error('unavailable');
    const now=new Date();
    const params={revision:current.revision,enabled:Number(next.enabled),placements:JSON.stringify(next.placements),actor,now};
    const [result]=await connection.execute(`UPDATE ad_settings SET enabled=:enabled, placements=:placements,
      revision=revision+1, updated_at=:now, updated_by=:actor WHERE id=1 AND revision=:revision`,params);
    if (result.affectedRows!==1) {
      await connection.rollback(); open=false; return {ok:false,error:'conflict'};
    }
    await connection.execute(`INSERT INTO ad_settings_history
      (previous_revision,next_revision,previous_enabled,next_enabled,previous_placements,next_placements,actor_user_id,changed_at)
      VALUES (:revision,:nextRevision,:previousEnabled,:enabled,:previousPlacements,:placements,:actor,:now)`,
      {...params,nextRevision:current.revision+1,previousEnabled:Number(current.enabled),previousPlacements:JSON.stringify(current.placements)});
    await connection.commit(); open=false;
    return {ok:true,config:{...next,placements:{...next.placements},revision:current.revision+1,updatedAt:now.toISOString()}};
  } catch (error) {
    if (open) { try { await connection.rollback(); } catch { /* Return a sanitized failure. */ } }
    return {ok:false,error:['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error?.code) ? 'conflict' : 'unavailable'};
  } finally { connection?.release(); }
}
export const saveAdsConfig = (db,input,actor,ready=isAdsRegistryReady) => update(db,input,actor,false,ready);
export const setAdsMaster = (db,input,actor,ready=isAdsRegistryReady) => update(db,input,actor,true,ready);
