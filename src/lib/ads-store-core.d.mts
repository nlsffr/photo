import type { AdsConfig, AdsSave, AdPlacements } from './ads-contract';
export type AdsSaveResult = {ok:true;config:AdsConfig} | {ok:false;error:'invalid_request'|'unavailable'|'conflict'|'not_ready'};
export interface AdsDatabase {
  execute(sql:string, params?:Record<string,unknown>):Promise<unknown>;
  getConnection():Promise<{
    execute(sql:string, params?:Record<string,unknown>):Promise<unknown>;
    beginTransaction():Promise<void>;commit():Promise<void>;rollback():Promise<void>;release():void;
  }>;
}
export function validateAdsSave(value:unknown):AdsSave|null;
export function readAdsConfig(db:AdsDatabase|null):Promise<AdsConfig>;
export function saveAdsConfig(db:AdsDatabase|null,input:AdsSave,actor:string,ready?:(placements:AdPlacements)=>boolean):Promise<AdsSaveResult>;
export function setAdsMaster(db:AdsDatabase|null,input:Pick<AdsSave,'revision'|'enabled'>,actor:string,ready?:(placements:AdPlacements)=>boolean):Promise<AdsSaveResult>;
