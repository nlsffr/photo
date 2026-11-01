import type { Locale } from "./i18n/config";

export const AUDIENCE_COOKIE = "lfh_audience";
export const CHOICE_MAX_AGE = 180 * 24 * 60 * 60;
export type Choice = "accepted" | "refused";
export function isChoice(value: unknown): value is Choice {
  return value === "accepted" || value === "refused";
}

type Copy = { body: string; accept: string; refuse: string; manage: string; error: string };
export const cookieCopy: Record<Locale, Copy> = {
  fr: { body: "Avec ton accord, un cookie nous permet de compter les visites et les pages vues. Tu peux le refuser et accéder au site.", accept: "Entrer et accepter les cookies", refuse: "Refuser les cookies facultatifs", manage: "Choix des cookies", error: "Ton choix n’a pas pu être enregistré. Réessaie." },
  en: { body: "With your permission, a cookie helps us count visits and page views. You can decline and still use the site.", accept: "Enter and accept cookies", refuse: "Decline optional cookies", manage: "Cookie choices", error: "Your choice could not be saved. Try again." },
  es: { body: "Con tu permiso, una cookie nos ayuda a contar visitas y páginas vistas. Puedes rechazarla y usar el sitio.", accept: "Entrar y aceptar las cookies", refuse: "Rechazar cookies opcionales", manage: "Opciones de cookies", error: "No pudimos guardar tu elección. Inténtalo de nuevo." },
  de: { body: "Mit deiner Zustimmung zählen wir Besuche und Seitenaufrufe mithilfe eines Cookies. Du kannst ablehnen und die Website trotzdem nutzen.", accept: "Eintreten und Cookies akzeptieren", refuse: "Optionale Cookies ablehnen", manage: "Cookie-Auswahl", error: "Deine Auswahl konnte nicht gespeichert werden. Versuche es erneut." },
  it: { body: "Con il tuo consenso, un cookie ci aiuta a contare le visite e le pagine viste. Puoi rifiutarlo e usare il sito.", accept: "Entra e accetta i cookie", refuse: "Rifiuta i cookie facoltativi", manage: "Scelte sui cookie", error: "Non è stato possibile salvare la scelta. Riprova." },
  pt: { body: "Com a tua autorização, um cookie ajuda-nos a contar visitas e páginas vistas. Podes recusar e continuar a usar o site.", accept: "Entrar e aceitar cookies", refuse: "Recusar cookies opcionais", manage: "Opções de cookies", error: "Não foi possível guardar a tua escolha. Tenta novamente." },
  nl: { body: "Met jouw toestemming helpt een cookie ons bezoeken en paginaweergaven te tellen. Je kunt weigeren en de site blijven gebruiken.", accept: "Bezoek de site en accepteer cookies", refuse: "Optionele cookies weigeren", manage: "Cookiekeuzes", error: "Je keuze kon niet worden opgeslagen. Probeer het opnieuw." },
};
