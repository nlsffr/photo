import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
// @ts-expect-error Native Node requires explicit suffixes.
import {buildRetiredPostrollDocument} from '../src/lib/ads-retired-postroll.ts';

const origin='https://leakfanhub.com',nonce='old_postroll_25';
test('the real retired bootstrap sends empty synchronously with no timers or external access',()=>{
 const document=buildRetiredPostrollDocument(nonce,origin),messages:Array<Record<string,unknown>>=[];
 const parent={postMessage:(message:Record<string,unknown>,target:string)=>{assert.equal(target,origin);messages.push(message);}};
 const script=document.html.match(/<script>([\s\S]*?)<\/script>/)![1];
 runInNewContext(script,{parent,addEventListener:()=>{},removeEventListener:()=>{}});
 assert.deepEqual(JSON.parse(JSON.stringify(messages)),[{type:'lfh-ad-status',placement:'underVideo',context:'postroll',nonce,status:'empty'}]);
 const hash=createHash('sha256').update(script).digest('base64');assert.ok(document.csp.includes(`script-src 'sha256-${hash}'`));
 assert.match(document.csp,/default-src 'none'/);assert.match(document.csp,/frame-ancestors 'self'/);assert.doesNotMatch(document.csp,/https:|unsafe-inline|unsafe-eval/);
});

test('a missed initial completion may be repeated only for the exact parent visibility handshake',()=>{
 const document=buildRetiredPostrollDocument(nonce,origin),messages:unknown[]=[];let listener:((event:unknown)=>void)|undefined;
 const parent={postMessage:(message:unknown)=>messages.push(message)};
 runInNewContext(document.html.match(/<script>([\s\S]*?)<\/script>/)![1],{parent,
  addEventListener:(name:string,fn:(event:unknown)=>void)=>{assert.equal(name,'message');listener=fn;},removeEventListener:()=>{listener=undefined;}});
 const data={type:'lfh-ad-visibility',placement:'underVideo',context:'postroll',nonce,visible:true,activated:true};
 for(const event of [{source:{},origin,data},{source:parent,origin:'https://evil.example.com',data},{source:parent,origin,data:{...data,nonce:'other'}},{source:parent,origin,data:{...data,context:'preroll'}},{source:parent,origin,data:{...data,visible:false}}])listener?.(event);
 assert.equal(messages.length,1);listener?.({source:parent,origin,data});assert.equal(messages.length,2);assert.equal(listener,undefined);
});

test('the retired builder rejects invalid nonce and untrusted or noncanonical parent origins',()=>{
 for(const value of ['', '<script>', 'a'.repeat(101),undefined,null,25])assert.throws(()=>buildRetiredPostrollDocument(value as never,origin));
 for(const value of ['null','https://evil.example.com','https://leakfanhub.com.evil.example.com','http://leakfanhub.com','https://leakfanhub.com/path'])assert.throws(()=>buildRetiredPostrollDocument(nonce,value));
 for(const value of ['http://127.0.0.1:3028','http://localhost:3028'])assert.doesNotThrow(()=>buildRetiredPostrollDocument(nonce,value));
});
