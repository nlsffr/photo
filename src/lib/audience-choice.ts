import type { Locale } from "./i18n/config";

export const AUDIENCE_COOKIE = "lfh_audience";
export const CHOICE_MAX_AGE = 180 * 24 * 60 * 60;
export type Choice = "accepted" | "refused";
export function isChoice(value: unknown): value is Choice {
  return value === "accepted" || value === "refused";
}

type Copy = { body: string; accept: string; refuse: string; manage: string; error: string };
export const cookieCopy: Record<Locale, Copy> = {
  fr: { body: "En cliquant sur « Entrer », tu acceptes le cookie qui nous permet de compter les visites et les pages vues. Tu peux le refuser et accéder au site.", accept: "Entrer", refuse: "Refuser les cookies", manage: "Choix des cookies", error: "Ton choix n’a pas pu être enregistré. Réessaie." },
  en: { body: "By clicking “Enter”, you accept the cookie we use to count visits and page views. You can decline and still use the site.", accept: "Enter", refuse: "Decline cookies", manage: "Cookie choices", error: "Your choice could not be saved. Try again." },
  es: { body: "Al pulsar «Entrar», aceptas la cookie que usamos para contar visitas y páginas vistas. Puedes rechazarla y usar el sitio.", accept: "Entrar", refuse: "Rechazar cookies", manage: "Opciones de cookies", error: "No pudimos guardar tu elección. Inténtalo de nuevo." },
  de: { body: "Wenn du auf „Eintreten“ klickst, akzeptierst du das Cookie, mit dem wir Besuche und Seitenaufrufe zählen. Du kannst es ablehnen und die Website trotzdem nutzen.", accept: "Eintreten", refuse: "Cookies ablehnen", manage: "Cookie-Auswahl", error: "Deine Auswahl konnte nicht gespeichert werden. Versuche es erneut." },
  it: { body: "Facendo clic su «Entra», accetti il cookie che usiamo per contare visite e pagine viste. Puoi rifiutarlo e usare il sito.", accept: "Entra", refuse: "Rifiuta i cookie", manage: "Scelte sui cookie", error: "Non è stato possibile salvare la scelta. Riprova." },
  pt: { body: "Ao clicar em «Entrar», aceitas o cookie que usamos para contar visitas e páginas vistas. Podes recusá-lo e continuar a usar o site.", accept: "Entrar", refuse: "Recusar cookies", manage: "Opções de cookies", error: "Não foi possível guardar a tua escolha. Tenta novamente." },
  nl: { body: "Door op ‘Doorgaan’ te klikken, accepteer je de cookie waarmee we bezoeken en paginaweergaven tellen. Je kunt deze weigeren en de site blijven gebruiken.", accept: "Doorgaan", refuse: "Cookies weigeren", manage: "Cookiekeuzes", error: "Je keuze kon niet worden opgeslagen. Probeer het opnieuw." },
};
