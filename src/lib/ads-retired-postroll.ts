import {createHash} from 'node:crypto';

/** Releases the controller of an already-open old page; this document has no ad. */
export function buildRetiredPostrollDocument(nonce:string,parentOrigin:string) {
  const validParent=()=>{try{const url=new URL(parentOrigin);return url.origin===parentOrigin&&!url.username&&!url.password
    &&(parentOrigin==='https://leakfanhub.com'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)));}catch{return false;}};
  if(typeof nonce!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(nonce)||!validParent())throw new Error('invalid_retired_postroll');
  const data=JSON.stringify({nonce,parentOrigin}).replace(/</g,'\\u003c');
  const boot=`(({nonce,parentOrigin})=>{const status={type:'lfh-ad-status',placement:'underVideo',context:'postroll',nonce,status:'empty'};const tell=()=>parent.postMessage(status,parentOrigin);const ready=event=>{const data=event.data;if(event.source!==parent||event.origin!==parentOrigin||!data||data.type!=='lfh-ad-visibility'||data.placement!=='underVideo'||data.context!=='postroll'||data.nonce!==nonce||data.visible!==true||data.activated!==true)return;removeEventListener('message',ready);tell();};addEventListener('message',ready);tell();})(${data});`;
  const hash=createHash('sha256').update(boot).digest('base64');
  const csp=["default-src 'none'","base-uri 'none'","object-src 'none'","frame-ancestors 'self'","form-action 'none'",`script-src 'sha256-${hash}'`].join('; ');
  return{csp,html:`<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="referrer" content="no-referrer"><title></title></head><body><script>${boot}</script></body></html>`};
}
