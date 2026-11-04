import {createHash} from 'node:crypto';

type Kind='linear'|'nonlinear';
type XmlNode={name:string;attrs:Record<string,string>;text:string;children:XmlNode[]};
type VastAd={kind:Kind;resource:string;mime:string;duration:number;skipAfter:number;wrapper:string|null;
  impressions:string[];errors:string[];clickThrough:string|null;clickTracking:string[];events:Record<string,string[]>};
type XmlParser={parseFromString:(value:string,type:DOMParserSupportedType)=>Document};
export type ExoclickVastOptions={kind:Kind;mode?:'preroll';placement:string;tagUrl:string;sourceHosts:readonly string[];
  parentOrigin:string;nonce:string;consentValue:'v2:accepted';labels:{advertisement:string;close:string;skip:string;visit:string;play:string}};

/** Serialized into the fixed iframe bootstrap as well as exercised by native Node tests.
 * No DOM insertion of XML, VPAID, HTML resources, arbitrary scripts or server-side fetching.
 */
export function createVastTools(){
  function fail(code:string):never{throw new Error(code);}
  const publicUrl=(value:unknown):string|null=>{
    if(typeof value!=='string'||value.length>4096||!/^https:\/\//i.test(value)||/[\u0000-\u0020\u007f]/.test(value))return null;
    try{const u=new URL(value),host=u.hostname.toLowerCase();
      if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||host.endsWith('.')
        ||!host.includes('.')||host.includes(':')||/^\d+(?:\.\d+)*$/.test(host)
        ||/(?:^|\.)(?:localhost|local|internal|test|invalid|onion|home|lan)$/.test(host)
        ||!host.split('.').every(p=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)))return null;
      return u.href;
    }catch{return null;}
  };
  const uniq=(values:string[])=>[...new Set(values)];
  const children=(n:XmlNode,name:string)=>n.children.filter(c=>c.name===name);
  const first=(n:XmlNode,name:string)=>children(n,name)[0];
  const descendants=(n:XmlNode,name:string):XmlNode[]=>n.children.flatMap(c=>[...(c.name===name?[c]:[]),...descendants(c,name)]);
  const urls=(nodes:XmlNode[])=>uniq(nodes.map(n=>publicUrl(n.text.trim())).filter((u):u is string=>u!==null));
  const seconds=(s:string)=>{
    const m=/^(\d{2}):(\d{2}):(\d{2}(?:\.\d{1,3})?)$/.exec(s.trim());
    return m&&+m[2]<60&&+m[3]<60?+m[1]*3600 + +m[2]*60 + +m[3]:NaN;
  };
  const parseTree=(root:XmlNode,kind:Kind,mode?:'preroll'):VastAd=>{
    let count=0;const inspect=(n:XmlNode,depth:number)=>{if(++count>2000||depth>32)fail('vast_xml');n.children.forEach(c=>inspect(c,depth+1));};inspect(root,0);
    if(root.name!=='VAST'||!/^([34])(?:\.\d+)?$/.test(root.attrs.version??''))fail('vast_version');
    const ads=children(root,'Ad');if(ads.length!==1)fail('vast_no_ad');
    const body=first(ads[0],'InLine')??first(ads[0],'Wrapper');if(!body)fail('vast_no_ad');
    const selected=descendants(body,kind==='linear'?'Linear':'NonLinearAds')[0];
    const events:Record<string,string[]>={};
    for(const e of selected?descendants(selected,'Tracking'):[]){
      const event=e.attrs.event,url=publicUrl(e.text.trim());
      if(url&&['start','firstQuartile','midpoint','thirdQuartile','complete','creativeView','pause','resume','mute','unmute','skip','close','closeLinear'].includes(event))(events[event]??=[]).push(url);
    }
    for(const event of Object.keys(events))events[event]=uniq(events[event]);
    const common:VastAd={kind,resource:'',mime:'',duration:0,skipAfter:5,wrapper:null,
      impressions:urls(children(body,'Impression')),errors:urls([...children(root,'Error'),...children(body,'Error')]),
      clickThrough:null,clickTracking:selected?urls(descendants(selected,kind==='linear'?'ClickTracking':'NonLinearClickTracking')):[],events};
    if(body.name==='Wrapper'){
      common.wrapper=publicUrl(first(body,'VASTAdTagURI')?.text.trim());if(!common.wrapper)fail('vast_wrapper');return common;
    }
    if(kind==='linear'){
      const linear=descendants(body,'Linear')[0];if(!linear)fail('vast_unsupported');
      const duration=seconds(first(linear,'Duration')?.text??'');if(!Number.isFinite(duration)||duration<=0||duration>120)fail('vast_duration');
      const media=descendants(linear,'MediaFile').find(n=>['video/mp4','video/webm'].includes(n.attrs.type?.toLowerCase())&&publicUrl(n.text.trim()));
      if(!media)fail('vast_unsupported');const offset=linear.attrs.skipoffset;
      const skip=offset?.endsWith('%')?duration*parseFloat(offset)/100:seconds(offset??'');
      return {...common,resource:publicUrl(media.text.trim())!,mime:media.attrs.type.toLowerCase(),duration,
        skipAfter:mode==='preroll'?Math.max(5,Number.isFinite(skip)&&skip>=0?Math.min(skip,duration):5)
          :Number.isFinite(skip)&&skip>=0?Math.min(5,skip,duration):Math.min(5,duration),
        clickThrough:publicUrl(descendants(linear,'ClickThrough')[0]?.text.trim())};
    }
    const nonlinear=descendants(body,'NonLinear').find(n=>n.attrs.width==='300'&&n.attrs.height==='250');if(!nonlinear)fail('vast_unsupported');
    const image=children(nonlinear,'StaticResource').find(n=>/^image\/(?:png|jpeg|gif|webp)$/i.test(n.attrs.creativeType??'')&&publicUrl(n.text.trim()));
    if(!image)fail('vast_unsupported');return {...common,resource:publicUrl(image.text.trim())!,mime:image.attrs.creativeType.toLowerCase(),clickThrough:publicUrl(first(nonlinear,'NonLinearClickThrough')?.text.trim())};
  };
  const parseXml=(xml:string,kind:Kind,parser:XmlParser=new DOMParser(),mode?:'preroll')=>{
    if(xml.length>262144||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))fail('vast_xml');
    const doc=parser.parseFromString(xml,'application/xml');if(!doc.documentElement||doc.getElementsByTagName('parsererror').length)fail('vast_xml');
    let count=0;const tree=(element:Element,depth:number):XmlNode=>{
      if(++count>2000||depth>32)fail('vast_xml');
      return {name:element.localName,attrs:Object.fromEntries(Array.from(element.attributes).map(a=>[a.name,a.value])),text:element.textContent??'',children:Array.from(element.children).map(c=>tree(c,depth+1))};
    };
    return parseTree(tree(doc.documentElement,0),kind,mode);
  };
  const resolve=async(tagUrl:string,kind:Kind,options:{signal:AbortSignal;mode?:'preroll';fetchText:(u:string,signal:AbortSignal)=>Promise<string>;parse?:(xml:string)=>VastAd})=>{
    let url=publicUrl(tagUrl);if(!url)fail('vast_url');const visited=new Set<string>();let inherited:VastAd|null=null;
    for(let depth=0;depth<=3;depth++){
      if(options.signal.aborted)fail('vast_abort');if(visited.has(url!))fail('vast_wrapper');visited.add(url!);
      const xml=await options.fetchText(url!,options.signal);if(options.signal.aborted)fail('vast_abort');
      const ad=options.parse?options.parse(xml):parseXml(xml,kind,undefined,options.mode);
      if(inherited){ad.impressions=uniq([...inherited.impressions,...ad.impressions]);ad.errors=uniq([...inherited.errors,...ad.errors]);ad.clickTracking=uniq([...inherited.clickTracking,...ad.clickTracking]);
        for(const event of Object.keys(inherited.events))ad.events[event]=uniq([...(inherited.events[event]??[]),...(ad.events[event]??[])]);}
      if(!ad.wrapper)return ad;inherited=ad;url=ad.wrapper;
    }
    return fail('vast_wrapper');
  };
  const createTracker=(ad:VastAd,send:(url:string,event?:string)=>void)=>{
    let active=false,closed=false,impressed=false,last:number|null=null,watched=0;const sent=new Set<string>();
    const once=(event:string,list:string[])=>{if(sent.has(event))return;sent.add(event);uniq(list).forEach(url=>send(url,event));};
    const event=(name:string)=>{if(active&&!closed&&impressed)once(name,ad.events[name]??[]);};
    const impression=()=>{if(!active||closed||impressed)return;impressed=true;once('impression',ad.impressions);event('creativeView');event('start');};
    return {
      setActive(value:boolean){active=value;last=null;},
      imageReady(){if(ad.kind==='nonlinear')impression();},
      progress(time:number,duration:number,seeking:boolean){
        if(!active||closed||!Number.isFinite(time)||!Number.isFinite(duration))return;
        const delta=last===null?0:time-last;last=time;if(seeking||delta<=0||delta>2)return;
        watched+=delta;impression();const length=Math.max(ad.duration,duration);
        if(length>0)for(const [fraction,name] of [[.25,'firstQuartile'],[.5,'midpoint'],[.75,'thirdQuartile']] as const)if(watched>=length*fraction)event(name);
      },
      event,
      complete(){if(watched>=ad.duration*.9)event('complete');},
      close(name:string){event(name);closed=true;active=false;},
      click(){if(active&&!closed&&impressed)once('click',ad.clickTracking);},
      error(code:string){if(active&&!closed)once('error',ad.errors.map(u=>u.replace(/\[ERRORCODE\]/g,code)));},
      watched:()=>watched,impressed:()=>impressed,
    };
  };
  return {publicUrl,parseTree,parseXml,resolve,createTracker};
}

function runVastFrame(config:ExoclickVastOptions,tools:ReturnType<typeof createVastTools>){
  const preroll=config.mode==='preroll';
  let activated=!preroll,lifetime:ReturnType<typeof setTimeout>|null=null;
  let parentVisible=false,closed=false,generation=0,loading=false,mounted=false,ad:VastAd|null=null,resumeAt=0;
  let cleanup=()=>{};
  let phase:AbortController|null=null,deadline:ReturnType<typeof setTimeout>|null=null,filled=false;
  let tracker:ReturnType<typeof tools.createTracker>|null=null,video:HTMLVideoElement|null=null,image:HTMLImageElement|null=null;
  const requests=new Set<AbortController>();
  const root=document.getElementById('lfh-vast')!;
  const accepted=()=>{try{return document.cookie.split(';').some(p=>{const [name,...value]=p.trim().split('=');return name==='lfh_ad_consent'&&decodeURIComponent(value.join('='))===config.consentValue;});}catch{return false;}};
  const allowed=()=>!closed&&activated&&parentVisible&&!document.hidden&&accepted();
  const tell=(status:string)=>parent.postMessage({type:'lfh-ad-status',placement:config.placement,nonce:config.nonce,...(preroll?{context:'preroll'}:{}),status},config.parentOrigin);
  const outbound=(raw:string)=>{const value=tools.publicUrl(raw);return value&&new URL(value).origin!==config.parentOrigin?value:null;};
  const track=(raw:string,event?:string)=>{
    if(!allowed())return;
    const url=outbound(raw.replace(/\[(?:CACHEBUSTING|CACHEBUSTER|RANDOM)\]/g,String(Math.floor(10000000+Math.random()*90000000))));if(!url)return;
    const terminal=['skip','close','closeLinear','complete','error'].includes(event??'');
    const controller=new AbortController();if(!terminal)requests.add(controller);
    // A no-cors tracking GET must use follow; Chromium rejects no-cors + redirect:error before sending.
    void fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'follow',mode:'no-cors',cache:'no-store',keepalive:terminal,signal:terminal?undefined:controller.signal}).catch(()=>{}).finally(()=>requests.delete(controller));
  };
  const stop=()=>{generation++;phase?.abort();phase=null;loading=false;if(deadline!==null)clearTimeout(deadline);deadline=null;
    if(video){if(Number.isFinite(video.currentTime))resumeAt=video.currentTime;video.pause();video.removeAttribute('src');video.load();}
    image?.removeAttribute('src');root.hidden=true;tracker?.setActive(false);for(const request of requests)request.abort();requests.clear();};
  const finish=(event:string)=>{
    if(closed)return;tracker?.close(event);closed=true;if(lifetime!==null)clearTimeout(lifetime);lifetime=null;
    stop();cleanup();root.replaceChildren();tell(preroll&&event==='complete'?'ended':preroll&&event==='skip'?'skipped':'empty');
  };
  const failed=()=>{tracker?.error('405');finish('');};
  const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',label);b.addEventListener('click',event=>{event.stopPropagation();action();});return b;};
  const announce=()=>{if(!filled&&allowed()&&tracker?.impressed()){
    filled=true;if(preroll){if(lifetime!==null)clearTimeout(lifetime);lifetime=setTimeout(failed,125000);}tell('filled');
  }};
  const play=()=>{if(allowed()&&video){void video.play().catch(()=>{/* Native controls and the explicit play button remain usable. */});}};
  const show=()=>{
    if(!allowed())return;root.hidden=false;tracker?.setActive(true);
    if(image&&ad&&!image.getAttribute('src'))image.src=ad.resource;
    if(video&&ad&&!video.getAttribute('src')){video.src=ad.resource;video.load();}
    if(image&&image.complete&&image.naturalWidth>0){tracker?.imageReady();announce();}
    if(video&&!matchMedia('(prefers-reduced-motion: reduce)').matches)play();
  };
  const read=async(url:string,max:number,signal:AbortSignal)=>{
    if(!outbound(url))throw new Error('vast_url');
    const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal});
    if(!response.ok||!response.body||Number(response.headers.get('content-length'))>max)throw new Error('vast_response');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){if(signal.aborted)throw new Error('vast_abort');const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>max)throw new Error('vast_size');chunks.push(part.value);}}
    finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
    if(signal.aborted)throw new Error('vast_abort');const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
  };
  const mount=(value:VastAd)=>{
    if(!allowed())return;ad=value;tracker=tools.createTracker(value,track);root.replaceChildren();
    const title=document.createElement('p');title.textContent=config.labels.advertisement;root.appendChild(title);
    if(!preroll){const close=button(config.labels.close,()=>finish(value.kind==='linear'?'closeLinear':'close'));close.dataset.close='';root.appendChild(close);}
    const holder=document.createElement('div');root.appendChild(holder);
    let link:HTMLAnchorElement|null=null;
    const click=outbound(value.clickThrough??'');if(click){link=document.createElement('a');link.href=click;link.target='_blank';link.rel='noopener noreferrer nofollow';link.referrerPolicy='no-referrer';link.setAttribute('aria-label',config.labels.visit);link.addEventListener('click',event=>{if(!event.isTrusted||!allowed()||!tracker?.impressed())event.preventDefault();else tracker.click();});}
    if(value.kind==='nonlinear'){
      image=document.createElement('img');image.width=300;image.height=250;image.className='nonlinear';image.alt=config.labels.advertisement;image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';
      image.addEventListener('load',()=>{requestAnimationFrame(()=>{if(allowed()){tracker?.imageReady();announce();}});});image.addEventListener('error',failed);
      if(link)link.className='creative-link';(link??holder).appendChild(image);if(link)holder.appendChild(link);
    }else{
      let played=false;
      video=document.createElement('video');video.width=640;video.height=360;video.muted=true;video.playsInline=true;video.controls=!preroll;
      if(preroll)video.autoplay=!matchMedia('(prefers-reduced-motion: reduce)').matches;
      video.preload='none';video.crossOrigin='anonymous';video.setAttribute('aria-label',config.labels.advertisement);holder.appendChild(video);
      const skip=button(config.labels.skip,()=>{if(tracker&&tracker.watched()>=value.skipAfter)finish('skip');});
      const updateSkip=()=>{const remaining=Math.max(0,value.skipAfter-(tracker?.watched()??0));skip.disabled=remaining>0;
        if(preroll){skip.textContent=remaining>0?`${config.labels.skip} (${Math.ceil(remaining)})`:config.labels.skip;skip.setAttribute('aria-label',skip.textContent);}};
      if(preroll)updateSkip();else skip.disabled=true;root.appendChild(skip);
      const playable=button(config.labels.play,play);root.appendChild(playable);
      if(link){link.textContent=config.labels.visit;root.appendChild(link);}
      video.addEventListener('timeupdate',()=>{if(!video||!allowed()||video.paused||video.ended||video.readyState<2||(preroll&&!played))return;tracker?.progress(video.currentTime,video.duration,video.seeking);updateSkip();announce();});
      video.addEventListener('pause',()=>{if(preroll&&video?.ended)return;tracker?.event('pause');if(preroll)tracker?.setActive(false);});
      video.addEventListener('playing',()=>{if(video&&allowed()){
        if(preroll){if(video.paused||video.ended||video.readyState<2)return;played=true;tracker?.setActive(true);}
        tracker?.progress(video.currentTime,video.duration,video.seeking);tracker?.event('resume');
      }});
      video.addEventListener('volumechange',()=>tracker?.event(video?.muted?'mute':'unmute'));
      video.addEventListener('ended',()=>{if(allowed()&&(!preroll||(played&&video?.ended&&video.readyState>=2))){tracker?.complete();finish('complete');}});video.addEventListener('error',failed);
      video.addEventListener('loadedmetadata',()=>{if(video&&allowed()&&resumeAt>0)video.currentTime=Math.min(resumeAt,video.duration);});
      video.addEventListener('loadeddata',()=>{if(allowed()&&!matchMedia('(prefers-reduced-motion: reduce)').matches)play();});
    }
    show();
  };
  const load=async()=>{
    if(!allowed()||loading||mounted)return;
    loading=true;const mine=++generation,controller=new AbortController();phase=controller;
    deadline=setTimeout(()=>controller.abort(),10000);
    try{
      const value=await tools.resolve(config.tagUrl,config.kind,{signal:controller.signal,mode:config.mode,fetchText:async(url,signal)=>new TextDecoder('utf-8',{fatal:true}).decode(await read(url,262144,signal))});
      if(!allowed()||mine!==generation||controller.signal.aborted)return;
      if(!outbound(value.resource))throw new Error('vast_url');mounted=true;mount(value);
    }catch{if(mine===generation&&allowed())failed();}
    finally{if(mine===generation){loading=false;phase=null;if(deadline!==null)clearTimeout(deadline);deadline=null;}}
  };
  const refresh=()=>{if(!accepted()||(preroll&&activated&&(!parentVisible||document.hidden))){finish('');return;}if(allowed()){if(mounted&&ad)show();else void load();}else stop();};
  const message=(event:MessageEvent)=>{
    if(event.source!==parent||event.origin!==config.parentOrigin||!event.data||event.data.type!=='lfh-ad-visibility'
      ||event.data.placement!==config.placement||event.data.nonce!==config.nonce||typeof event.data.visible!=='boolean')return;
    if(preroll&&(event.data.context!=='preroll'||event.data.activated!==true))return;
    if(parentVisible===event.data.visible)return;parentVisible=event.data.visible;
    if(preroll&&parentVisible&&!activated){activated=true;lifetime=setTimeout(failed,12000);}
    refresh();
  };
  addEventListener('message',message);document.addEventListener('visibilitychange',refresh);
  const pagehide=()=>finish('');addEventListener('pagehide',pagehide,{once:true});
  // Revocation also stops a frame when a tab's observer is throttled.
  const cookieTimer=setInterval(()=>{if(!accepted())finish('');},1000);
  cleanup=()=>{clearInterval(cookieTimer);removeEventListener('message',message);removeEventListener('pagehide',pagehide);document.removeEventListener('visibilitychange',refresh);};
  if(!accepted())finish('');
}

/** Server-side document builder only. tagUrl/sourceHosts are internal registry values,
 * never URL query parameters supplied by a visitor. No default/live zone is embedded.
 * Tags/resources must permit CORS. XML redirects and unsupported formats fail closed;
 * images/video use native credentialless CORS loading without full-file prefetching.
 */
export function buildExoclickVastDocument(options:ExoclickVastOptions){
  const tools=createVastTools(),tag=tools.publicUrl(options.tagUrl);
  const validParent=()=>{try{const url=new URL(options.parentOrigin);return url.origin===options.parentOrigin&&!url.username&&!url.password
    &&(options.parentOrigin==='https://leakfanhub.com'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)));}catch{return false;}};
  if(!['linear','nonlinear'].includes(options.kind)||!tag||!validParent()
    ||(options.mode!==undefined&&(options.mode!=='preroll'||options.kind!=='linear'||options.placement!=='underVideo'))
    ||!Array.isArray(options.sourceHosts)||!options.sourceHosts.length||!options.sourceHosts.every(h=>tools.publicUrl('https://'+h+'/')&&new URL('https://'+h+'/').hostname===h)
    ||!options.sourceHosts.includes(new URL(tag).hostname)||options.consentValue!=='v2:accepted'||typeof options.placement!=='string'||!/^[a-z][a-zA-Z]{0,31}$/.test(options.placement)
    ||typeof options.nonce!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(options.nonce)
    ||Object.keys(options.labels).sort().join(',')!=='advertisement,close,play,skip,visit'||Object.values(options.labels).some(v=>typeof v!=='string'||!v.trim()||v.length>240))throw new Error('invalid_vast_config');
  const data=JSON.stringify(options).replace(/</g,'\\u003c');
  const boot=`(${runVastFrame.toString()})(${data},(${createVastTools.toString()})());`;
  const hash=createHash('sha256').update(boot).digest('base64');
  const csp=["default-src 'none'","base-uri 'none'","object-src 'none'","frame-ancestors 'self'","form-action 'none'",`script-src 'sha256-${hash}'`,"style-src 'unsafe-inline'","connect-src https:","img-src https:","media-src https:","frame-src 'none'"].join('; ');
  const scheme=options.mode==='preroll'?'<meta name="color-scheme" content="dark">':'';
  const schemeStyle=options.mode==='preroll'?'html{color-scheme:dark}':'';
  // A media-page iframe can be only 219px tall on a phone. The preroll's
  // controls must overlay its contained video rather than extend its height.
  const prerollStyle=options.mode==='preroll'?'html,body,#lfh-vast{width:100%;height:100%;overflow:hidden}#lfh-vast>div{position:absolute;inset:0}#lfh-vast video{width:100%;height:100%;max-height:none;object-fit:contain;background:#000}#lfh-vast>button,#lfh-vast>a{position:absolute;z-index:2;max-width:calc(50% - 16px);margin:0;border:1px solid #777;border-radius:8px;background:#111e;color:inherit;font:inherit;line-height:1.2;text-align:center;overflow-wrap:anywhere}#lfh-vast>button:first-of-type{right:8px;bottom:8px}#lfh-vast>button:nth-of-type(2){left:8px;bottom:8px}#lfh-vast>a{right:8px;top:8px}#lfh-vast>p{box-sizing:border-box;max-width:calc(50% - 16px);font-size:12px}':'';
  return {csp,html:`<!doctype html><html lang="en"><head><meta charset="utf-8">${scheme}<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Advertisement</title><style>${schemeStyle}html,body{margin:0;background:transparent;color:white;font:14px system-ui}#lfh-vast{text-align:center;position:relative}#lfh-vast[hidden]{display:none}p{position:absolute;top:0;left:0;z-index:1;margin:0;padding:4px;background:#000b;max-width:calc(100% - 52px)}button,a{min-height:44px;min-width:44px;padding:8px;box-sizing:border-box}button{cursor:pointer}button[data-close]{position:absolute;right:0;top:0;z-index:2}a{display:inline-block;color:inherit}.creative-link{display:block;padding:0;min-height:0;min-width:0}video{display:block;max-width:100%;height:auto;max-height:75dvh;margin:auto}img{display:block;max-width:100%;height:auto;margin:auto}.nonlinear{width:300px;height:250px;object-fit:contain}${prerollStyle}</style></head><body><section id="lfh-vast" hidden></section><script>${boot}</script></body></html>`};
}
