import type {AdPlacement,AdProfile} from './ads-contract';
import {ADS_REGISTRY,type AdDevice,type AdSpot} from '@/lib/ads-registry';
// @ts-expect-error Native Node requires explicit suffixes.
import {adFormatPlacementFor, type AdPageContext} from './ads-page-context.ts';

export const AD_PROFILE_INFO: ReadonlyArray<{key:AdProfile;title:string;summary:string;details:readonly string[]}> = [
  {key:'current',title:'1 · Tranquille',summary:'Bannières uniquement, sans fenêtre ni interruption de navigation.',details:[
    'Galeries : une rangée après 8 médias, puis tous les 16.',
    'Bannières en haut, en bas, sous les vidéos et dans les galeries, selon les emplacements activés.',
    'Aucun popunder, interstitiel, lecteur flottant, préroll, annonce de pause ou publicité du feed.',
    'Bannières TrafficStars ; ExoClick pour la bannière du bas.',
  ]},
  {key:'balanced',title:'2 · Équilibré',summary:'Bannières, feed et lecteur flottant, avec des fenêtres moins fréquentes.',details:[
    'Galeries : une rangée après 6 médias, puis tous les 12.',
    'Popunder : au plus 2 fenêtres par session de 5 minutes, espacées de 30 secondes.',
    'Lecteur flottant conservé ; aucun interstitiel, préroll ni annonce de pause.',
    'Bannières basses et sous les vidéos ExoClick ; feed alterné entre les deux régies.',
  ]},
  {key:'intensive',title:'3 · Intensif',summary:'Disposition adaptée du relevé public concurrent, avec nos propres zones TrafficStars et ExoClick.',details:[
    'Accueil et médias tendances : encarts après 2, 8, 31, 54… médias sur ordinateur et téléphone, avec nos propres formats.',
    'Popunder : moteur armé dès autorisation, sans attente initiale ; au plus 3 fenêtres par session de 5 minutes, espacées de 5 secondes.',
    'Avant la vidéo : préroll ExoClick dédié, passage possible à partir de 5 secondes, selon le délai VAST, et fréquence de zone de 5 minutes. En pause : image ExoClick séparée et fermable.',
    'Feed TrafficStars ou ExoClick selon la disponibilité du SDK, après 5 médias, puis tous les 4, avec une promotion Premium à la deuxième insertion.',
    'Profils et Plus aimés : aucun encart inséré dans la grille. Les partenaires privés et variantes non observables du concurrent ne sont pas reproduits.',
    'Pages photo et vidéo : un encart après les commentaires et, à partir de 3 recommandations, un encart après les 2 premières.',
    'Interstitiel : premier lien éligible après chargement, fermeture automatique après 20 secondes et cookie de 5 minutes à la fermeture. Aucun clic forcé ni retour arrière bloqué.',
  ]},
];

function withPopFrequency(count:number,delay:number):typeof ADS_REGISTRY {
  return {...ADS_REGISTRY,popunder:{
    desktop:{...ADS_REGISTRY.popunder.desktop,count,delay},
    mobile:{...ADS_REGISTRY.popunder.mobile,count,delay},
  }};
}
const intensive=withPopFrequency(3,5);
intensive.interstitial={desktop:{...ADS_REGISTRY.interstitial.desktop,countClicks:0,countdown:20},mobile:{...ADS_REGISTRY.interstitial.mobile,countClicks:0,countdown:20}};
for(const device of ["desktop","mobile"] as const){
  intensive.popunder[device]={...intensive.popunder[device],firstDelay:0,mode:undefined};
}
// Stable objects avoid remounting vendor listeners whenever the runtime is polled.
const SPOTS:Record<AdProfile,typeof ADS_REGISTRY>={current:ADS_REGISTRY,balanced:withPopFrequency(2,30),intensive};

export function adSpotFor(profile:AdProfile|undefined,placement:AdPlacement,device:AdDevice,page?:AdPageContext):AdSpot {
  return SPOTS[profile??'current'][adFormatPlacementFor(profile,placement,device,page)][device];
}

export function isProfileGalleryAdPosition(mediaCount:number,profile:AdProfile='current',device:AdDevice='desktop',context:'gallery'|'creator'|AdPageContext='gallery'):boolean {
  if (!Number.isSafeInteger(mediaCount) || mediaCount<1) return false;
  if (profile==='intensive') {
    if (!['desktop','mobile'].includes(device) || context === 'creator'
      || (typeof context === 'object' && !['/','/trending-medias'].includes(context.pathname))) return false;
    // The native reference's mixed-list splice counts imply 23 real media between CPC cards.
    return mediaCount === 2 || (mediaCount >= 8 && (mediaCount-8)%23 === 0);
  }
  const first=profile==='balanced'?6:8, every=profile==='balanced'?12:16;
  return mediaCount>=first && (mediaCount-first)%every===0;
}

export const profileHasPauseBanner=(profile:AdProfile|undefined)=>profile==='intensive';
