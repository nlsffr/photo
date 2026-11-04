import type { Locale } from "./i18n/config";

type AdsCopy = { title: string; body: string; accept: string; refuse: string; manage: string; saved: string; error: string; label: string; close: string; preview: string };
export const adsCopy: Record<Locale, AdsCopy> = {
  fr: {title:"Publicités et cookies publicitaires",body:"TrafficStars et ExoClick peuvent utiliser des cookies et recevoir des informations sur ta navigation pour afficher et mesurer des publicités. Ce choix est distinct des statistiques du site. Tu peux refuser et continuer à naviguer, puis changer d’avis dans les choix des cookies.",accept:"Accepter les publicités",refuse:"Refuser les cookies publicitaires",manage:"Publicités",saved:"Choix enregistré",error:"Impossible d’enregistrer ce choix. Réessaie.",label:"Publicité",close:"Fermer la publicité",preview:"Aperçu privé — aucune publicité chargée"},
  en: {title:"Ads and advertising cookies",body:"TrafficStars and ExoClick may use cookies and receive browsing information to display and measure ads. This choice is separate from site analytics. You can decline, keep browsing and change your choice in cookie settings.",accept:"Accept advertising",refuse:"Decline advertising cookies",manage:"Advertising",saved:"Choice saved",error:"Your choice could not be saved. Try again.",label:"Advertisement",close:"Close advertisement",preview:"Private preview — no ads loaded"},
  es: {title:"Anuncios y cookies publicitarias",body:"TrafficStars y ExoClick pueden usar cookies y recibir información de navegación para mostrar y medir anuncios. Esta elección es independiente de las estadísticas del sitio. Puedes rechazarla, seguir navegando y cambiarla en las opciones de cookies.",accept:"Aceptar publicidad",refuse:"Rechazar cookies publicitarias",manage:"Publicidad",saved:"Elección guardada",error:"No se pudo guardar. Inténtalo de nuevo.",label:"Publicidad",close:"Cerrar publicidad",preview:"Vista previa privada — sin anuncios cargados"},
  de: {title:"Werbung und Werbe-Cookies",body:"TrafficStars und ExoClick können Cookies verwenden und Informationen zum Surfverhalten erhalten, um Werbung anzuzeigen und zu messen. Diese Auswahl ist unabhängig von der Website-Statistik. Du kannst ablehnen, weiter surfen und deine Auswahl in den Cookie-Einstellungen ändern.",accept:"Werbung akzeptieren",refuse:"Werbe-Cookies ablehnen",manage:"Werbung",saved:"Auswahl gespeichert",error:"Speichern fehlgeschlagen. Versuche es erneut.",label:"Werbung",close:"Werbung schließen",preview:"Private Vorschau — keine Werbung geladen"},
  it: {title:"Annunci e cookie pubblicitari",body:"TrafficStars ed ExoClick possono usare cookie e ricevere informazioni sulla navigazione per mostrare e misurare annunci. La scelta è separata dalle statistiche del sito. Puoi rifiutare, continuare a navigare e modificarla nelle impostazioni dei cookie.",accept:"Accetta pubblicità",refuse:"Rifiuta i cookie pubblicitari",manage:"Pubblicità",saved:"Scelta salvata",error:"Impossibile salvare. Riprova.",label:"Pubblicità",close:"Chiudi pubblicità",preview:"Anteprima privata — nessun annuncio caricato"},
  pt: {title:"Anúncios e cookies publicitários",body:"A TrafficStars e a ExoClick podem usar cookies e receber informações de navegação para apresentar e medir anúncios. Esta escolha é separada das estatísticas do site. Podes recusar, continuar a navegar e alterá-la nas opções de cookies.",accept:"Aceitar publicidade",refuse:"Recusar cookies publicitários",manage:"Publicidade",saved:"Escolha guardada",error:"Não foi possível guardar. Tenta novamente.",label:"Publicidade",close:"Fechar publicidade",preview:"Pré-visualização privada — sem anúncios carregados"},
  nl: {title:"Advertenties en advertentiecookies",body:"TrafficStars en ExoClick kunnen cookies gebruiken en surfgegevens ontvangen om advertenties weer te geven en te meten. Deze keuze staat los van de sitestatistieken. Je kunt weigeren, verder surfen en je keuze wijzigen via de cookie-instellingen.",accept:"Advertenties accepteren",refuse:"Advertentiecookies weigeren",manage:"Advertenties",saved:"Keuze opgeslagen",error:"Opslaan mislukt. Probeer opnieuw.",label:"Advertentie",close:"Advertentie sluiten",preview:"Privévoorbeeld — geen advertenties geladen"},
  ru: {
    "title": "Реклама и рекламные файлы cookie",
    "body": "TrafficStars и ExoClick могут использовать файлы cookie и получать сведения о ваших просмотрах для показа рекламы и оценки её эффективности. Этот выбор не связан со статистикой сайта. Вы можете отказаться, продолжить просмотр и изменить своё решение в настройках cookie.",
    "accept": "Разрешить рекламу",
    "refuse": "Отклонить рекламные файлы cookie",
    "manage": "Реклама",
    "saved": "Выбор сохранён",
    "error": "Не удалось сохранить выбор. Повторите попытку.",
    "label": "Реклама",
    "close": "Закрыть рекламу",
    "preview": "Личный предпросмотр — реклама не загружена"
  },
  zh: {
    "title": "广告与广告 Cookie",
    "body": "TrafficStars 和 ExoClick 可能使用 Cookie 并接收你的浏览信息，以展示广告和衡量广告效果。此选择与网站统计相互独立。你可以拒绝并继续浏览，也可以稍后在 Cookie 设置中更改选择。",
    "accept": "接受广告",
    "refuse": "拒绝广告 Cookie",
    "manage": "广告",
    "saved": "选择已保存",
    "error": "无法保存你的选择，请重试。",
    "label": "广告",
    "close": "关闭广告",
    "preview": "私人预览 — 未加载广告"
  },
  ja: {
    "title": "広告と広告Cookie",
    "body": "TrafficStarsとExoClickは、広告の表示と測定のためにCookieを使用し、閲覧に関する情報を受け取る場合があります。この選択はサイトのアクセス統計とは別です。拒否しても閲覧を続けられます。Cookie設定からいつでも変更できます。",
    "accept": "広告に同意する",
    "refuse": "広告Cookieを拒否する",
    "manage": "広告",
    "saved": "選択を保存しました",
    "error": "選択を保存できませんでした。もう一度お試しください。",
    "label": "広告",
    "close": "広告を閉じる",
    "preview": "非公開プレビュー — 広告は読み込まれません"
  },
  hi: {
    "title": "विज्ञापन और विज्ञापन कुकीज़",
    "body": "TrafficStars और ExoClick विज्ञापन दिखाने और मापने के लिए कुकीज़ इस्तेमाल कर सकते हैं और ब्राउज़िंग संबंधी जानकारी प्राप्त कर सकते हैं। यह विकल्प साइट के आँकड़ों से अलग है। आप अस्वीकार करके भी ब्राउज़ कर सकते हैं और कुकी विकल्पों में अपना निर्णय बदल सकते हैं।",
    "accept": "विज्ञापन स्वीकार करें",
    "refuse": "विज्ञापन कुकीज़ अस्वीकार करें",
    "manage": "विज्ञापन",
    "saved": "विकल्प सहेजा गया",
    "error": "आपका विकल्प सहेजा नहीं जा सका। फिर कोशिश करें।",
    "label": "विज्ञापन",
    "close": "विज्ञापन बंद करें",
    "preview": "निजी पूर्वावलोकन — कोई विज्ञापन लोड नहीं हुआ"
  },
  th: {
    "title": "โฆษณาและคุกกี้โฆษณา",
    "body": "TrafficStars และ ExoClick อาจใช้คุกกี้และรับข้อมูลการเรียกดูเพื่อแสดงและวัดผลโฆษณา ตัวเลือกนี้แยกจากสถิติของเว็บไซต์ คุณสามารถปฏิเสธและเรียกดูต่อได้ รวมทั้งเปลี่ยนตัวเลือกได้ในการตั้งค่าคุกกี้",
    "accept": "ยอมรับโฆษณา",
    "refuse": "ปฏิเสธคุกกี้โฆษณา",
    "manage": "โฆษณา",
    "saved": "บันทึกตัวเลือกแล้ว",
    "error": "ไม่สามารถบันทึกตัวเลือกของคุณได้ ลองอีกครั้ง",
    "label": "โฆษณา",
    "close": "ปิดโฆษณา",
    "preview": "ตัวอย่างส่วนตัว — ไม่มีการโหลดโฆษณา"
  },
};
