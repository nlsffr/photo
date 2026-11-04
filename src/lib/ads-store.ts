import 'server-only';
import { getDbPool } from './db-pool';
import { readAdsConfig, saveAdsConfig, type AdsDatabase } from './ads-store-core.mjs';
import type { AdsSave } from './ads-contract';
export { validateAdsSave } from './ads-store-core.mjs';
export const getAdsConfig = () => readAdsConfig(getDbPool() as AdsDatabase|null);
export const putAdsConfig = (input:AdsSave, actor:string) => saveAdsConfig(getDbPool() as AdsDatabase|null,input,actor);
