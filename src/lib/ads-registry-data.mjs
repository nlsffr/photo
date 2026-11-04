/** Public publisher spot identifiers from site 89019. See ADS-STAGING.md for deliberate SDK differences. */
export const ADS_REGISTRY = {
  "header": {
    "desktop": {
      "kind": "banner",
      "spotId": "e325b511a88d41cebe31bf61a4830315",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js",
      "domain": "fozekikikiminu.com",
      "width": 728,
      "height": 90
    },
    "mobile": {
      "kind": "banner",
      "spotId": "ac23f7ff171648cf98eaede6374b9eb5",
      "width": 300,
      "height": 100,
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js",
      "domain": "fozekikikiminu.com"
    }
  },
  "footer": {
    "desktop": {
      "kind": "banner",
      "spotId": "abc45c95d74a4eb9bc61f7a9435e65ca",
      "width": 728,
      "height": 90,
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js",
      "domain": "fozekikikiminu.com"
    },
    "mobile": {
      "kind": "banner",
      "spotId": "14c07a1d5ce5403fac4f27406367f2d8",
      "width": 300,
      "height": 250,
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js",
      "domain": "fozekikikiminu.com"
    }
  },
  "underVideo": {
    "desktop": {
      "kind": "banner",
      "spotId": "aeb8aff12db7418d98db737d04089822",
      "width": 300,
      "height": 250,
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js",
      "domain": "fozekikikiminu.com"
    },
    "mobile": {
      "kind": "banner",
      "spotId": "8b7c10f34a5249bfaadd4a85fca7308e",
      "width": 300,
      "height": 250,
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js",
      "domain": "fozekikikiminu.com"
    }
  },
  "feed": {
    "desktop": {
      "kind": "feed",
      "spotId": "2ca9e6ff88c24a11b9b65dce58572514",
      "scriptUrl": "https://cdn.tsyndicate.com/sdk/v1/video.shorts.js",
      "domain": "fozekikikiminu.com",
      "generatedScriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.video.shorts.js",
      "inFeed": true
    },
    "mobile": {
      "kind": "feed",
      "spotId": "d7e8153361b24152ad7f2c6d9c53d90b",
      "scriptUrl": "https://cdn.tsyndicate.com/sdk/v1/video.shorts.js",
      "domain": "fozekikikiminu.com",
      "generatedScriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.video.shorts.js",
      "inFeed": true
    }
  },
  "popunder": {
    "desktop": {
      "kind": "popunder",
      "spotId": "3e73580c158c442aa5fda6cfb52b0bc7",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.p.js",
      "domain": "fozekikikiminu.com",
      "sessionDuration": 300,
      "count": 1,
      "firstDelay": 5,
      "delay": 60,
      "mode": "selective",
      "devices": "all"
    },
    "mobile": {
      "kind": "popunder",
      "spotId": "b1b808c026cf4d5fbfc50ab1d9d6afee",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.p.js",
      "domain": "fozekikikiminu.com",
      "sessionDuration": 300,
      "count": 1,
      "firstDelay": 5,
      "delay": 60,
      "mode": "selective",
      "devices": "mobile"
    }
  },
  "interstitial": {
    "desktop": {
      "kind": "interstitial",
      "spotId": "f2d7cdea16834afcaee13a011fcd76a8",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.interstitial.ts.js",
      "domain": "fozekikikiminu.com",
      "styleUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.interstitial.ts.css",
      "countdown": 5,
      "countClicks": 3,
      "cookieExpires": 0.08333333333333333
    },
    "mobile": {
      "kind": "interstitial",
      "spotId": "8daf2423caab49ce87cae4636343033f",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.interstitial.ts.js",
      "domain": "fozekikikiminu.com",
      "styleUrl": "https://cdn.fozekikikiminu.com/sdk/v1/dd.interstitial.ts.css",
      "countdown": 5,
      "countClicks": 3,
      "cookieExpires": 0.08333333333333333
    }
  },
  "slider": {
    "desktop": {
      "kind": "slider",
      "spotId": "4f16cfa864e245629cbcd140d10e7d60",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/video.instant.message.js",
      "width": "10%",
      "mobileWidth": "25%",
      "displayMode": "capped",
      "cappedAction": "click",
      "cappedValueInMinutes": 1,
      "showCTAButton": true,
      "hideOnComplete": true,
      "closeButtonDelay": 0
    },
    "mobile": {
      "kind": "slider",
      "spotId": "179f09e703994154ae22c30717fde67a",
      "scriptUrl": "https://cdn.fozekikikiminu.com/sdk/v1/video.instant.message.js",
      "width": "10%",
      "mobileWidth": "25%",
      "displayMode": "capped",
      "cappedAction": "click",
      "cappedValueInMinutes": 1,
      "showCTAButton": true,
      "hideOnComplete": true,
      "closeButtonDelay": 0
    }
  }
};

const SDK_HOSTS = new Set(["cdn.fozekikikiminu.com", "cdn.tsyndicate.com"]);
const SDK_FILES = {banner:"ms", feed:"video.shorts", popunder:"p", interstitial:"interstitial.ts", slider:"video.instant.message"};
const PLACEMENT_KINDS = {header:"banner",footer:"banner",underVideo:"banner",feed:"feed",popunder:"popunder",interstitial:"interstitial",slider:"slider"};
export function isValidAdSpot(spot) {
  if (!spot || !/^[a-zA-Z0-9]{16,64}$/.test(spot.spotId) || !Object.hasOwn(SDK_FILES,spot.kind) || typeof spot.scriptUrl !== "string") return false;
  try {
      const url = new URL(spot.scriptUrl);
      const file = SDK_FILES[spot.kind];
      if (url.protocol !== "https:" || !SDK_HOSTS.has(url.hostname) || url.port || url.search || url.hash || url.username || url.password
        || !["/sdk/v1/"+file+".js", "/sdk/v1/dd."+file+".js"].includes(url.pathname)) return false;
      if (url.pathname.includes("/dd.") && (url.hostname !== "cdn."+spot.domain)) return false;
  } catch { return false; }
  const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  if (spot.kind === "banner") return Number.isInteger(spot.width) && spot.width > 0 && Number.isInteger(spot.height) && spot.height > 0;
  if (spot.kind === "feed") return spot.inFeed === true;
  if (spot.kind === "popunder") return positive(spot.sessionDuration) && Number.isInteger(spot.count) && spot.count > 0
    && positive(spot.firstDelay) && positive(spot.delay) && spot.mode === "selective" && ["all","desktop","mobile"].includes(spot.devices);
  if (spot.kind === "interstitial") {
    if (!positive(spot.countdown) || !Number.isInteger(spot.countClicks) || spot.countClicks < 1 || !positive(spot.cookieExpires)) return false;
    try { const style = new URL(spot.styleUrl); return style.protocol === "https:" && SDK_HOSTS.has(style.hostname)
      && !style.port && !style.search && !style.hash && !style.username && !style.password
      && ["/sdk/v1/interstitial.ts.css","/sdk/v1/dd.interstitial.ts.css"].includes(style.pathname); } catch { return false; }
  }
  return /^\d+(?:\.\d+)?%$/.test(spot.width) && /^\d+(?:\.\d+)?%$/.test(spot.mobileWidth)
    && spot.displayMode === "capped" && ["click","impression"].includes(spot.cappedAction) && positive(spot.cappedValueInMinutes)
    && spot.showCTAButton === true && spot.hideOnComplete === true && spot.closeButtonDelay === 0;
}
export function missingAdsPlacements(placements) {
  return Object.keys(ADS_REGISTRY).filter(key => placements?.[key] === true &&
    (ADS_REGISTRY[key].desktop.spotId === ADS_REGISTRY[key].mobile.spotId
      || ["desktop", "mobile"].some(device => ADS_REGISTRY[key][device]?.kind !== PLACEMENT_KINDS[key] || !isValidAdSpot(ADS_REGISTRY[key][device]))));
}

export function isAdsRegistryReady(placements) {
  return Object.keys(ADS_REGISTRY).some(key => placements?.[key] === true)
    && missingAdsPlacements(placements).length === 0;
}
