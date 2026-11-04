import type { Locale } from "./i18n/config";

export const AUDIENCE_COOKIE = "lfh_audience";
export const CHOICE_MAX_AGE = 180 * 24 * 60 * 60;
export type Choice = "accepted" | "refused";
export function isChoice(value: unknown): value is Choice {
  return value === "accepted" || value === "refused";
}

type Copy = {
  body: string;
  settingsBody: string;
  accept: string;
  confirm: string;
  refuse: string;
  manage: string;
  back: string;
  error: string;
};
export const cookieCopy: Record<Locale, Copy> = {
  fr: {
    confirm: "Accepter",
    back: "Retour",
    settingsBody: "Un cookie nous aide à compter les visites et les pages vues. Choisis si tu l’acceptes. Tu peux accéder au site même en le refusant.",
    body: "En cliquant sur « Entrer », tu acceptes le cookie qui nous permet de compter les visites et les pages vues. Tu peux le refuser et accéder au site.",
    accept: "Entrer",
    refuse: "Refuser",
    manage: "Choix des cookies",
    error: "Ton choix n’a pas pu être enregistré. Réessaie.",
  },
  en: {
    confirm: "Accept",
    back: "Back",
    settingsBody: "A cookie helps us count visits and page views. Choose whether to accept it. You can still use the site if you decline.",
    body: "By clicking “Enter”, you accept the cookie we use to count visits and page views. You can decline and still use the site.",
    accept: "Enter",
    refuse: "Decline",
    manage: "Cookie choices",
    error: "Your choice could not be saved. Try again.",
  },
  es: {
    confirm: "Aceptar",
    back: "Volver",
    settingsBody: "Una cookie nos ayuda a contar visitas y páginas vistas. Elige si la aceptas. Puedes usar el sitio aunque la rechaces.",
    body: "Al pulsar «Entrar», aceptas la cookie que usamos para contar visitas y páginas vistas. Puedes rechazarla y usar el sitio.",
    accept: "Entrar",
    refuse: "Rechazar",
    manage: "Opciones de cookies",
    error: "No pudimos guardar tu elección. Inténtalo de nuevo.",
  },
  de: {
    confirm: "Akzeptieren",
    back: "Zurück",
    settingsBody: "Ein Cookie hilft uns, Besuche und Seitenaufrufe zu zählen. Entscheide, ob du es akzeptierst. Du kannst die Website auch nutzen, wenn du es ablehnst.",
    body: "Wenn du auf „Eintreten“ klickst, akzeptierst du das Cookie, mit dem wir Besuche und Seitenaufrufe zählen. Du kannst es ablehnen und die Website trotzdem nutzen.",
    accept: "Eintreten",
    refuse: "Ablehnen",
    manage: "Cookie-Auswahl",
    error: "Deine Auswahl konnte nicht gespeichert werden. Versuche es erneut.",
  },
  it: {
    confirm: "Accetta",
    back: "Indietro",
    settingsBody: "Un cookie ci aiuta a contare visite e pagine viste. Scegli se accettarlo. Puoi usare il sito anche se lo rifiuti.",
    body: "Facendo clic su «Entra», accetti il cookie che usiamo per contare visite e pagine viste. Puoi rifiutarlo e usare il sito.",
    accept: "Entra",
    refuse: "Rifiuta",
    manage: "Scelte sui cookie",
    error: "Non è stato possibile salvare la scelta. Riprova.",
  },
  pt: {
    confirm: "Aceitar",
    back: "Voltar",
    settingsBody: "Um cookie ajuda-nos a contar visitas e páginas vistas. Escolhe se o aceitas. Podes usar o site mesmo que o recuses.",
    body: "Ao clicar em «Entrar», aceitas o cookie que usamos para contar visitas e páginas vistas. Podes recusá-lo e continuar a usar o site.",
    accept: "Entrar",
    refuse: "Recusar",
    manage: "Opções de cookies",
    error: "Não foi possível guardar a tua escolha. Tenta novamente.",
  },
  nl: {
    confirm: "Accepteren",
    back: "Terug",
    settingsBody: "Een cookie helpt ons bezoeken en paginaweergaven te tellen. Kies of je deze accepteert. Je kunt de site ook gebruiken als je weigert.",
    body: "Door op ‘Doorgaan’ te klikken, accepteer je de cookie waarmee we bezoeken en paginaweergaven tellen. Je kunt deze weigeren en de site blijven gebruiken.",
    accept: "Doorgaan",
    refuse: "Weigeren",
    manage: "Cookiekeuzes",
    error: "Je keuze kon niet worden opgeslagen. Probeer het opnieuw.",
  },
  ru: {
    "confirm": "Принять",
    "back": "Назад",
    "settingsBody": "Файл cookie помогает нам считать посещения и просмотры страниц. Выберите, разрешаете ли вы его использовать. Сайтом можно пользоваться и при отказе.",
    "body": "Нажимая «Войти», вы разрешаете файл cookie, с помощью которого мы считаем посещения и просмотры страниц. Вы можете отказаться и пользоваться сайтом.",
    "accept": "Войти",
    "refuse": "Отказаться",
    "manage": "Настройки cookie",
    "error": "Не удалось сохранить ваш выбор. Повторите попытку."
  },
  zh: {
    "confirm": "接受",
    "back": "返回",
    "settingsBody": "我们使用一个 Cookie 统计访问次数和页面浏览量。请选择是否接受。即使拒绝，你仍然可以使用本网站。",
    "body": "点击“进入”即表示你接受我们用于统计访问次数和页面浏览量的 Cookie。你可以拒绝并继续使用本网站。",
    "accept": "进入",
    "refuse": "拒绝",
    "manage": "Cookie 选项",
    "error": "无法保存你的选择，请重试。"
  },
  ja: {
    "body": "「入場」を押すと、訪問数とページ閲覧数の計測に使用するCookieに同意したことになります。拒否してもサイトを利用できます。",
    "settingsBody": "訪問数とページ閲覧数の計測にCookieを使用します。同意するかどうかを選択してください。拒否してもサイトを利用できます。",
    "accept": "入場",
    "confirm": "同意する",
    "refuse": "拒否する",
    "manage": "Cookieの選択",
    "back": "戻る",
    "error": "選択を保存できませんでした。もう一度お試しください。"
  },
  hi: {
    "body": "“प्रवेश करें” पर क्लिक करके आप उस कुकी को स्वीकार करते हैं जिससे हम विज़िट और पेज व्यू गिनते हैं। आप अस्वीकार करके भी साइट इस्तेमाल कर सकते हैं।",
    "settingsBody": "एक कुकी हमें विज़िट और पेज व्यू गिनने में मदद करती है। चुनें कि आप इसे स्वीकार करते हैं या नहीं। अस्वीकार करने पर भी आप साइट इस्तेमाल कर सकते हैं।",
    "accept": "प्रवेश करें",
    "confirm": "स्वीकार करें",
    "refuse": "अस्वीकार करें",
    "manage": "कुकी विकल्प",
    "back": "वापस",
    "error": "आपका विकल्प सहेजा नहीं जा सका। फिर कोशिश करें।"
  },
  th: {
    "body": "เมื่อคลิก “เข้าชม” คุณยอมรับคุกกี้ที่เราใช้เพื่อนับการเข้าชมและยอดดูหน้าเว็บ คุณสามารถปฏิเสธและยังคงใช้งานเว็บไซต์ได้",
    "settingsBody": "คุกกี้ช่วยให้เรานับการเข้าชมและยอดดูหน้าเว็บได้ เลือกว่าคุณยอมรับหรือไม่ แม้ปฏิเสธก็ยังใช้งานเว็บไซต์ได้",
    "accept": "เข้าชม",
    "confirm": "ยอมรับ",
    "refuse": "ปฏิเสธ",
    "manage": "ตัวเลือกคุกกี้",
    "back": "ย้อนกลับ",
    "error": "ไม่สามารถบันทึกตัวเลือกของคุณได้ ลองอีกครั้ง"
  },
};
