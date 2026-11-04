import type {AdPlacement,AdProfile} from './ads-contract';
import {ADS_REGISTRY,type AdDevice,type AdSpot} from '@/lib/ads-registry';

export const AD_PROFILE_INFO: ReadonlyArray<{key:AdProfile;title:string;summary:string;details:readonly string[]}> = [
  {key:'current',title:'1 · Confort',summary:'Navigation actuelle et fréquences conservées ; encart bas ExoClick.',details:[
    'Galeries : une rangée après 8 médias, puis tous les 16.',
    'Popunder : au plus 1 fenêtre par session de 5 minutes, espacement de 60 secondes.',
    'Interstitiel : 3 clics éligibles, fermeture après 5 secondes, cookie de 5 minutes.',
    'TrafficStars en haut et dans le feed ; ExoClick remplace la bannière du bas.',
  ]},
  {key:'balanced',title:'2 · Équilibré',summary:'Des annonces plus présentes, avec les mêmes commandes de navigation.',details:[
    'Galeries : une rangée après 6 médias, puis tous les 12.',
    'Popunder : au plus 2 fenêtres par session de 5 minutes, espacées de 30 secondes.',
    'Interstitiel et vidéo flottante : mêmes limites que le profil Confort.',
    'Bannières basses et sous les vidéos ExoClick ; feed alterné entre les deux régies.',
  ]},
  {key:'intensive',title:'3 · Intensif',summary:'Disposition issue du relevé public concurrent, avec nos propres zones TrafficStars et ExoClick.',details:[
    'Galeries : encarts après 2, 8 et 31 médias sur ordinateur ; après 2 sur téléphone, par groupe de 40 médias.',
    'Popunder : au plus 3 fenêtres par session de 5 minutes, espacées de 5 secondes.',
    'Vidéo en pause : image ExoClick fermable ; feed ExoClick après 5 médias, puis tous les 4, avec une promotion Premium à la deuxième insertion.',
    'Profils : bannières hautes et basses, sans encart inséré dans la grille. Les partenaires privés et variantes non observables du concurrent ne sont pas reproduits.',
    'Interstitiel : 3 clics éligibles, fermeture après 5 secondes. Aucun clic forcé ni retour arrière bloqué.',
  ]},
];

function withPopFrequency(count:number,delay:number):typeof ADS_REGISTRY {
  return {...ADS_REGISTRY,popunder:{
    desktop:{...ADS_REGISTRY.popunder.desktop,count,delay},
    mobile:{...ADS_REGISTRY.popunder.mobile,count,delay},
  }};
}
// Stable objects avoid remounting vendor listeners whenever the runtime is polled.
const SPOTS:Record<AdProfile,typeof ADS_REGISTRY>={current:ADS_REGISTRY,balanced:withPopFrequency(2,30),intensive:withPopFrequency(3,5)};

export function adSpotFor(profile:AdProfile|undefined,placement:AdPlacement,device:AdDevice):AdSpot {
  return SPOTS[profile??'current'][placement][device];
}

export function isProfileGalleryAdPosition(mediaCount:number,profile:AdProfile='current',device:AdDevice='desktop',context:'gallery'|'creator'='gallery'):boolean {
  if (!Number.isSafeInteger(mediaCount) || mediaCount<1) return false;
  if (profile==='intensive') {
    if (context === 'creator') return false;
    // The reference was observed on its first 40 media; later groups repeat our chosen layout.
    const position=(mediaCount-1)%40+1;
    return (device==='desktop'?[2,8,31]:[2]).includes(position);
  }
  const first=profile==='balanced'?6:8, every=profile==='balanced'?12:16;
  return mediaCount>=first && (mediaCount-first)%every===0;
}

export const profileHasPauseBanner=(profile:AdProfile|undefined)=>profile==='intensive';
