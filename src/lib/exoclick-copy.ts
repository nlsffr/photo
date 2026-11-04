import type {Locale} from "./i18n/config";

export const exoclickCopy: Record<Locale, { skip: string; visit: string; play: string; unavailable: string }> = {
  en: { skip: "Skip advertisement", visit: "Visit advertiser", play: "Play advertisement", unavailable: "Advertisement unavailable" },
  fr: { skip: "Passer la publicité", visit: "Voir l’annonceur", play: "Lire la publicité", unavailable: "Publicité indisponible" },
  es: { skip: "Saltar anuncio", visit: "Visitar al anunciante", play: "Reproducir anuncio", unavailable: "Anuncio no disponible" },
  de: { skip: "Werbung überspringen", visit: "Werbetreibenden besuchen", play: "Werbung abspielen", unavailable: "Werbung nicht verfügbar" },
  it: { skip: "Salta pubblicità", visit: "Visita l’inserzionista", play: "Riproduci pubblicità", unavailable: "Pubblicità non disponibile" },
  pt: { skip: "Saltar anúncio", visit: "Visitar anunciante", play: "Reproduzir anúncio", unavailable: "Anúncio indisponível" },
  nl: { skip: "Advertentie overslaan", visit: "Adverteerder bezoeken", play: "Advertentie afspelen", unavailable: "Advertentie niet beschikbaar" },
  ru: { skip: "Пропустить рекламу", visit: "Перейти к рекламодателю", play: "Воспроизвести рекламу", unavailable: "Реклама недоступна" },
  zh: { skip: "跳过广告", visit: "访问广告商", play: "播放广告", unavailable: "广告不可用" },
  ja: { skip: "広告をスキップ", visit: "広告主のサイトへ", play: "広告を再生", unavailable: "広告を表示できません" },
  hi: { skip: "विज्ञापन छोड़ें", visit: "विज्ञापनदाता की साइट खोलें", play: "विज्ञापन चलाएँ", unavailable: "विज्ञापन उपलब्ध नहीं है" },
  th: { skip: "ข้ามโฆษณา", visit: "เยี่ยมชมผู้ลงโฆษณา", play: "เล่นโฆษณา", unavailable: "โฆษณาไม่พร้อมใช้งาน" },
};
