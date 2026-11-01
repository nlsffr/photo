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
};
