import type {AdMediation} from './ads-provider-plan';

/** Fetch the normal SDK without executing it. No fill/click signal is used. */
export function probeAdMediation(permitted:()=>boolean,signal:AbortSignal):Promise<AdMediation|null> {
  if (!permitted() || signal.aborted) return Promise.resolve(null);
  const link=document.createElement('link');
  // Older clients keep the normal branch; absence of preload support isn't a block.
  if (!link.relList.supports('preload')) return Promise.resolve('standard');
  return new Promise(resolve=>{
    let finished=false;
    const finish=(value:AdMediation|null)=>{
      if (finished) return;
      finished=true;
      window.clearTimeout(timer);signal.removeEventListener('abort',abort);
      link.onload=null;link.onerror=null;link.remove();
      resolve(permitted()&&!signal.aborted?value:null);
    };
    const abort=()=>finish(null);
    // A slow connection alone isn't proof of blocking. Never run two providers.
    const timer=window.setTimeout(()=>finish('standard'),3_500);
    link.rel='preload';link.as='script';link.href='https://cdn.tsyndicate.com/sdk/v1/video.shorts.js';
    link.onload=()=>finish('standard');link.onerror=()=>finish('alternative');
    signal.addEventListener('abort',abort,{once:true});
    document.head.appendChild(link);
  });
}
