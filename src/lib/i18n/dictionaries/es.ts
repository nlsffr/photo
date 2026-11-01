import type { Dictionary } from "./en";

export const esDictionary = {
  creator: {
    collections: {
      overview: { title: "Leaks de OnlyFans de {name}", description: "Fotos y vídeos exclusivos de OnlyFans filtrados de {name}. Streaming gratuito, sin registro. Solo +18." },
      photos: { title: "Fotos OnlyFans filtradas de {name}", description: "Fotos de OnlyFans filtradas de {name}. Gratis en LeakFanHub. +18." },
      videos: { title: "Vídeos OnlyFans filtrados de {name}", description: "Vídeos de OnlyFans filtrados de {name}. Streaming gratuito en LeakFanHub. +18." },
      popular: { title: "Leaks populares de OnlyFans de {name}", description: "Fotos y vídeos de OnlyFans más vistos de {name}." },
    },
    tabs: { overview: "Todo", photos: "Fotos", videos: "Vídeos", popular: "Popular" },
    home: "Inicio", models: "Modelos", back: "Volver", followers: "seguidores", media: "contenidos", views: "visualizaciones",
    previousPage: "Página anterior", nextPage: "Página siguiente", page: "Página", collectionsLabel: "Colecciones", paginationLabel: "Paginación", verified: "Verificado",
    follow: { follow: "Seguir", following: "Siguiendo" },
  },
  shell: {
    language: "Idioma", menu: "Menú", closeMenu: "Cerrar menú", add: "Añadir", search: "Buscar",
    footerSafety: "Solo para mayores de 18 años. Tolerancia cero: el contenido que implique a menores está prohibido y debe denunciarse de inmediato.",
    footerReport: "Denunciar",
    navigation: {
      home: "Inicio", search: "Buscar", models: "Modelos", feed: "Contenido", trending: "Tendencias", mostLiked: "Más valorados", random: "Aleatorio", forYou: "Para ti", following: "Siguiendo", saved: "Guardados", add: "Añadir", rankings: "Clasificaciones", premium: "Premium", login: "Iniciar sesión", signup: "Registrarse", help: "Ayuda", contact: "Contacto", dmca: "DMCA", trust: "Confianza y seguridad", report: "Denunciar contenido", terms: "Condiciones", privacy: "Privacidad",
    },
    searchInput: { placeholder: "Buscar un modelo o una etiqueta…", label: "Buscar", clear: "Borrar", submit: "Buscar" },
    account: { label: "Mi cuenta", saved: "Mis elementos guardados", following: "Mis suscripciones", logout: "Cerrar sesión" },
    ageGate: {
      title: "Solo para adultos",
      body: "Este sitio contiene contenido para adultos. Al entrar, confirmas que tienes al menos 18 años o la mayoría de edad legal de tu país.",
      enter: "Tengo 18 años o más — Entrar", leave: "Salir",
    },
    cookies: { body: "Usamos almacenamiento local mínimo para preferencias y me gusta. Sin rastreadores publicitarios de terceros.", more: "Más información" },
  },
  home: {
    featured: "Modelos destacados", viewAll: "Ver todo",
    filters: {
      label: "Filtros de descubrimiento", discover: "Descubrir", trending: "Tendencias", recent: "Reciente",
      popular: "Populares",
      liked: "Más valorados",
      longest: "Más largos",
      random: "Aleatorio", photos: "Fotos", videos: "Vídeos", all: "Todos los filtros", popularInterests: "Intereses populares", active: "Filtros activos", clear: "Borrar todo", title: "Todos los filtros", description: "Elige un interés para personalizar la galería.", close: "Cerrar filtros", search: "Buscar un interés", searchPlaceholder: "Buscar un interés…", empty: "No se encontró ningún filtro.",
    },
    gallery: { emptyTitle: "Sin resultados", emptyBody: "Prueba otra palabra o elimina filtros.", loading: "Cargando", loadError: "No se pueden cargar más elementos.", retry: "Intentar de nuevo", loadMore: "Cargar más", end: "Ya lo has visto todo", media: "elementos multimedia" },
  },
  mediaDetails: {
    views: "Visualizaciones",
    likes: "Me gusta",
    score: "Puntuación",
    allMedia: "Todo el contenido de @{handle} →",
    report: "Denunciar / DMCA",
    more: "Más contenido de @{handle}",
    viewProfile: "Ver perfil",
    saved: "Guardado",
    kinds: {
      photo: "foto",
      video: "vídeo",
      pack: "galería"
    },
    fallbackName: "{handle} {kind} #{id}",
    fallbackDescription: "{kind} de @{handle} en LeakFanHub{titleDetail} (contenido {id})."
  },
  comments: {
    title: "Comentarios",
    placeholder: "Escribe un comentario…",
    submit: "Enviar",
    login: "Inicia sesión",
    loginSuffix: "para comentar.",
    sendError: "No se pudo enviar.",
    loading: "Cargando comentarios…",
    loadError: "No se pueden cargar los comentarios.",
    retry: "Intentar de nuevo",
    empty: "Aún no hay comentarios.",
    user: "Usuario"
  },
  video: {
    errorTitle: "No se puede reproducir el vídeo",
    errorBody: "Archivo grande o conexión lenta; inténtalo de nuevo.",
    retry: "Intentar de nuevo",
    loading: "Cargando vídeo…",
    progress: "Progreso",
    speed: "Velocidad de reproducción",
    pictureInPicture: "Imagen en imagen",
    fullscreen: "Pantalla completa"
  },
  feed: { empty: "No hay contenido", close: "Cerrar contenido", play: "Reproducir", pause: "Pausar", unmute: "Activar sonido", mute: "Silenciar" },
  models: { title: "Modelos", countSuffix: "creadores en LeakFanHub", followers: "Con más seguidores", views: "Más vistos", added: "creadores añadidos.", loadError: "No se pueden cargar más creadores.", retry: "Intentar de nuevo", loadMore: "Ver más", loading: "Cargando…" },
  search: { title: "Buscar", creators: "Creadores", followers: "seguidores", result: "resultado", results: "resultados", trendingNow: "Tendencias actuales" },
  searchForm: { placeholder: "Buscar un modelo, etiqueta o título…", label: "Buscar", clear: "Borrar", submit: "Buscar", advanced: "Avanzado", filterByTag: "Filtrar por etiqueta", searchFor: "Buscar" },
  mediaTypes: { all: "Todo", photos: "Fotos", videos: "Vídeos", pack: "Paquete", packs: "Paquetes" },
  aiFilters: { all: "Todo", real: "Real", ai: "IA" },
  addMedia: {
    title: "Añadir contenido", guestBody: "Inicia sesión para publicar una foto o un vídeo.", login: "Iniciar sesión", intro: "El creador ya debe existir en la base de datos (autocompletado).", chooseFile: "Foto o vídeo — haz clic para elegir", creator: "Creador", change: "Cambiar", creatorPlaceholder: "Escribe las primeras letras…", optionalTitle: "Título (opcional)", missingFields: "Elige un archivo y un creador existente.", uploadFailed: "Error al subir", uploadSuccess: "Contenido subido — pendiente de moderación o publicación.", networkError: "Error de red", sending: "Subiendo…", publish: "Publicar",
  },
  auth: {
    loginTitle: "Iniciar sesión", signupTitle: "Crear una cuenta", loginIntro: "Nos alegra verte de nuevo.", signupIntro: "Únete a LeakFanHub en unos segundos.", username: "Nombre de usuario", usernamePlaceholder: "tu_usuario", email: "Correo electrónico", emailPlaceholder: "tu@ejemplo.com", identifier: "Correo o nombre de usuario", password: "Contraseña", confirmPassword: "Confirmar contraseña", show: "Mostrar", hide: "Ocultar", mismatch: "Las contraseñas no coinciden.", genericError: "Algo salió mal. Inténtalo de nuevo.", networkError: "No se puede conectar. Comprueba tu conexión e inténtalo de nuevo.", busy: "Un momento…", submitLogin: "Iniciar sesión", submitSignup: "Crear mi cuenta", already: "¿Ya tienes una cuenta?", needAccount: "¿Aún no tienes cuenta?", anonymousPrompt: "¿Prefieres mantener el anonimato?", anonymousLink: "Usar una identidad sin correo electrónico",
  },
  premium: {
    loading: "Cargando…", activeTitle: "Eres Premium", activeBody: "Tu pago con Telegram Stars ha sido confirmado y Premium está activo en tu cuenta.", back: "Volver a la galería", guestBody: "Crea una cuenta o inicia sesión para activar Premium en tu perfil.", createAccount: "Crear una cuenta", login: "Iniciar sesión", badge: "Premium · Telegram Stars", choosePlan: "Elige tu plan", intro: "Paga de forma segura en Telegram y activa Premium automáticamente durante", popular: "Popular", payTitle: "Pagar con Telegram Stars", createInvoice: "Creando factura…", continueTelegram: "Continuar en Telegram", invoiceSent: "Factura enviada. Completa el pago en Telegram; esta página lo confirmará automáticamente.", reopen: "Volver a abrir Telegram", expired: "Esta solicitud ya no es válida. Inicia un nuevo pago para recibir otra factura.", noAds: "Sin publicidad", everyDevice: "Premium vinculado a tu cuenta en todos los dispositivos", orderError: "No se puede crear el pago ahora. Inténtalo de nuevo en unos instantes.", paymentDescription: "Telegram abrirá el bot de pago con una factura exacta de", termsIntro: "Al continuar, aceptas las", terms: "condiciones", supportIntro: "Para preguntas sobre pagos, contacta con", support: "soporte",
  },
  contactForm: {
    submit: "Enviar", reason: "Motivo", message: "Mensaje", messagePlaceholder: "Describe tu solicitud con detalle…", sending: "Enviando…", sentTitle: "Mensaje enviado", sentBody: "Gracias; responderemos lo antes posible.", another: "Enviar otro mensaje", privacy: "Al enviar este formulario, aceptas que tu solicitud se procese conforme a nuestra política de privacidad. No se comparten datos con terceros.",
    errors: { invalid_email: "La dirección de correo no parece válida.", empty_message: "El mensaje es demasiado corto.", rate_limited: "Demasiados intentos. Vuelve a intentarlo en unos minutos.", not_configured: "El envío aún no está activo. Usa la dirección de correo que aparece en la página.", send_failed: "No se pudo enviar. Inténtalo de nuevo o usa la dirección de correo de la página.", bad_request: "Solicitud no válida.", network: "No se puede conectar. Comprueba tu conexión e inténtalo de nuevo." },
  },
  pages: {
    home: { meta: { title: "Últimos Leaks de OnlyFans - LeakFanHub", description: "Millones de fotos y vídeos de OnlyFans filtrados en LeakFanHub, los más nuevos primero. Streaming gratuito, sin registro, nuevos posts cada minuto. Solo +18." } },
    models: { meta: { title: "Modelos y creadores", description: "Explora todos los creadores de LeakFanHub, ordenados por seguidores o visualizaciones." } },
    trending: { meta: { title: "Contenido en tendencia", description: "Fotos y vídeos en tendencia clasificados por interacción y actualizados continuamente." } },
    mostLiked: { meta: { title: "Más valorados", description: "Las fotos y los vídeos con más me gusta de LeakFanHub." } },
    rankings: { meta: { title: "Clasificación de creadores", description: "Los creadores más vistos y valorados de LeakFanHub." } },
    influencers: { meta: { title: "Creadores en tendencia", description: "Creadores cuyo contenido está ganando más visualizaciones ahora mismo." } },
    about: { meta: { title: "Acerca de LeakFanHub", description: "Descubre cómo funcionan la exploración, los perfiles de creadores y la privacidad en LeakFanHub." } },
    dmca: { meta: { title: "Retirada de contenido DMCA", description: "Envía una solicitud completa de retirada por derechos de autor a LeakFanHub." } },
    trust: { meta: { title: "Confianza y seguridad", description: "Política de moderación de LeakFanHub y tolerancia cero con el contenido ilegal." } },
    contact: { meta: { title: "Contacto", description: "Contacta con los equipos de soporte, seguridad, colaboraciones o prensa de LeakFanHub." } },
    terms: { meta: { title: "Condiciones de uso", description: "Condiciones que regulan el acceso y el uso de LeakFanHub." } },
    privacy: { meta: { title: "Política de privacidad", description: "Cómo guarda LeakFanHub las preferencias, la información de cuenta y las solicitudes." } },
    legal: { meta: { title: "Aviso legal", description: "Información legal y de alojamiento de LeakFanHub." } },
    whatIs: { meta: { title: "¿Qué es LeakFanHub?", description: "Cómo explorar, seguir a creadores y guardar contenido en LeakFanHub." } },
  },
} satisfies Dictionary;
