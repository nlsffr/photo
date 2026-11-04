import type { Locale } from "@/lib/i18n/config";

/** Small controls shared by the translated discovery pages and their cards. */
export const DISCOVERY_COPY = {
  en: {
    windows: ["24 hours", "7 days", "30 days", "All time"], emptyRankings: "Not enough data yet.",
    like: "Like", save: "Save", adultsOnly: "18+ only", ad: "Advertisement",
    premium: "Ad-free Premium — {stars} Stars for {days} days", removeAd: "Remove with Premium",
    popularGalleries: "Popular galleries", galleriesTitle: "Trending and popular galleries",
    galleriesLinks: ["Trending galleries", "Top creators", "Most liked media"],
  },
  fr: {
    windows: ["24 h", "7 jours", "30 jours", "Tout"], emptyRankings: "Pas encore assez de données.",
    like: "J’aime", save: "Enregistrer", adultsOnly: "18+ uniquement", ad: "Publicité",
    premium: "Premium sans pub — {stars} Stars pour {days} jours", removeAd: "Retirer avec Premium",
    popularGalleries: "Galeries populaires", galleriesTitle: "Tendances et galeries populaires",
    galleriesLinks: ["Galeries tendance", "Créateurs populaires", "Médias les plus aimés"],
  },
  es: {
    windows: ["24 horas", "7 días", "30 días", "Siempre"], emptyRankings: "Aún no hay suficientes datos.",
    like: "Me gusta", save: "Guardar", adultsOnly: "Solo mayores de 18", ad: "Publicidad",
    premium: "Premium sin anuncios — {stars} Stars durante {days} días", removeAd: "Quitar con Premium",
    popularGalleries: "Galerías populares", galleriesTitle: "Galerías populares y en tendencia",
    galleriesLinks: ["Galerías en tendencia", "Creadores destacados", "Contenido con más me gusta"],
  },
  de: {
    windows: ["24 Stunden", "7 Tage", "30 Tage", "Gesamte Zeit"], emptyRankings: "Noch nicht genügend Daten.",
    like: "Gefällt mir", save: "Speichern", adultsOnly: "Nur ab 18", ad: "Werbung",
    premium: "Werbefreies Premium — {stars} Stars für {days} Tage", removeAd: "Mit Premium entfernen",
    popularGalleries: "Beliebte Galerien", galleriesTitle: "Angesagte und beliebte Galerien",
    galleriesLinks: ["Angesagte Galerien", "Top-Creator", "Meistgelikte Medien"],
  },
  it: {
    windows: ["24 ore", "7 giorni", "30 giorni", "Sempre"], emptyRankings: "Non ci sono ancora dati sufficienti.",
    like: "Mi piace", save: "Salva", adultsOnly: "Solo maggiorenni", ad: "Pubblicità",
    premium: "Premium senza pubblicità — {stars} Stars per {days} giorni", removeAd: "Rimuovi con Premium",
    popularGalleries: "Gallerie popolari", galleriesTitle: "Gallerie popolari e di tendenza",
    galleriesLinks: ["Gallerie di tendenza", "Creator più popolari", "Contenuti con più Mi piace"],
  },
  pt: {
    windows: ["24 horas", "7 dias", "30 dias", "Todo o período"], emptyRankings: "Ainda não há dados suficientes.",
    like: "Gostar", save: "Guardar", adultsOnly: "Apenas maiores de 18", ad: "Publicidade",
    premium: "Premium sem publicidade — {stars} Stars por {days} dias", removeAd: "Remover com Premium",
    popularGalleries: "Galerias populares", galleriesTitle: "Galerias populares e em destaque",
    galleriesLinks: ["Galerias em destaque", "Principais criadores", "Conteúdos com mais gostos"],
  },
  nl: {
    windows: ["24 uur", "7 dagen", "30 dagen", "Altijd"], emptyRankings: "Er zijn nog niet genoeg gegevens.",
    like: "Vind ik leuk", save: "Opslaan", adultsOnly: "Alleen 18+", ad: "Advertentie",
    premium: "Premium zonder advertenties — {stars} Stars voor {days} dagen", removeAd: "Verwijder met Premium",
    popularGalleries: "Populaire galerijen", galleriesTitle: "Trending en populaire galerijen",
    galleriesLinks: ["Trending galerijen", "Topcreators", "Media met de meeste likes"],
  },
  ru: {
    "windows": [
      "24 часа",
      "7 дней",
      "30 дней",
      "За всё время"
    ],
    "emptyRankings": "Пока недостаточно данных.",
    "like": "Нравится",
    "save": "Сохранить",
    "adultsOnly": "Только 18+",
    "ad": "Реклама",
    "premium": "Premium без рекламы — {stars} Stars на {days} дней",
    "removeAd": "Убрать с Premium",
    "popularGalleries": "Популярные галереи",
    "galleriesTitle": "Галереи в тренде и популярные галереи",
    "galleriesLinks": [
      "Галереи в тренде",
      "Лучшие авторы",
      "Материалы с наибольшим числом отметок «Нравится»"
    ]
  },
  zh: {
    "windows": [
      "24小时",
      "7天",
      "30天",
      "全部时间"
    ],
    "emptyRankings": "暂无足够数据。",
    "like": "点赞",
    "save": "收藏",
    "adultsOnly": "仅限18岁以上人士",
    "ad": "广告",
    "premium": "无广告 Premium — {stars} Stars，畅享{days}天",
    "removeAd": "开通 Premium 移除广告",
    "popularGalleries": "热门图库",
    "galleriesTitle": "趋势与热门图库",
    "galleriesLinks": [
      "趋势图库",
      "热门创作者",
      "获赞最多的媒体"
    ]
  },
  ja: {
    "windows": [
      "24時間",
      "7日間",
      "30日間",
      "全期間"
    ],
    "emptyRankings": "まだ十分なデータがありません。",
    "like": "いいね",
    "save": "保存",
    "adultsOnly": "18歳以上限定",
    "ad": "広告",
    "premium": "広告なしのプレミアム — {stars} Starsで{days}日間",
    "removeAd": "プレミアムで広告を非表示",
    "popularGalleries": "人気のギャラリー",
    "galleriesTitle": "急上昇と人気のギャラリー",
    "galleriesLinks": [
      "急上昇ギャラリー",
      "人気クリエイター",
      "いいね数が多いメディア"
    ]
  },
  hi: {
    "windows": [
      "24 घंटे",
      "7 दिन",
      "30 दिन",
      "पूरा समय"
    ],
    "emptyRankings": "अभी पर्याप्त डेटा नहीं है।",
    "like": "पसंद करें",
    "save": "सहेजें",
    "adultsOnly": "केवल 18 वर्ष या अधिक उम्र के लिए",
    "ad": "विज्ञापन",
    "premium": "विज्ञापन-मुक्त प्रीमियम — {stars} Stars में {days} दिन",
    "removeAd": "प्रीमियम से विज्ञापन हटाएँ",
    "popularGalleries": "लोकप्रिय गैलरी",
    "galleriesTitle": "ट्रेंडिंग और लोकप्रिय गैलरी",
    "galleriesLinks": [
      "ट्रेंडिंग गैलरी",
      "शीर्ष क्रिएटर",
      "सबसे ज़्यादा पसंद किया गया मीडिया"
    ]
  },
  th: {
    "windows": [
      "24 ชั่วโมง",
      "7 วัน",
      "30 วัน",
      "ตลอดเวลา"
    ],
    "emptyRankings": "ยังมีข้อมูลไม่เพียงพอ",
    "like": "ถูกใจ",
    "save": "บันทึก",
    "adultsOnly": "สำหรับผู้มีอายุ 18 ปีขึ้นไปเท่านั้น",
    "ad": "โฆษณา",
    "premium": "พรีเมียมไร้โฆษณา — {stars} Stars ใช้ได้ {days} วัน",
    "removeAd": "นำโฆษณาออกด้วยพรีเมียม",
    "popularGalleries": "แกลเลอรียอดนิยม",
    "galleriesTitle": "แกลเลอรีที่กำลังมาแรงและยอดนิยม",
    "galleriesLinks": [
      "แกลเลอรีที่กำลังมาแรง",
      "ครีเอเตอร์ยอดนิยม",
      "สื่อที่ถูกใจมากที่สุด"
    ]
  },
} satisfies Record<Locale, {
  windows: [string, string, string, string]; emptyRankings: string; like: string; save: string;
  adultsOnly: string; ad: string; premium: string; removeAd: string;
  popularGalleries: string; galleriesTitle: string; galleriesLinks: [string, string, string];
}>;
