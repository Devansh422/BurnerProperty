(() => {
  const THREE_D_THRESHOLD = 60;
  const FORCE_KEY = "hero-mode";
  const AUTO_MODE_KEY = "hero-auto-mode";

  let fallbackHeroMarkup = "";

  function isValidMode(mode) {
    return mode === "3d" || mode === "video";
  }

  function readStorage(storage, key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch {
      // Ignore storage failures in restrictive/private browsing contexts.
    }
  }

  function removeStorage(storage, key) {
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage failures in restrictive/private browsing contexts.
    }
  }

  function readAutoModeCache() {
    const mode = readStorage(sessionStorage, AUTO_MODE_KEY);
    return isValidMode(mode) ? mode : null;
  }

  function writeAutoModeCache(mode, detail) {
    if (!isValidMode(mode)) {
      return;
    }

    writeStorage(sessionStorage, AUTO_MODE_KEY, mode);
  }

  function ensureHeroVideoPlayback(hero) {
    const video = hero?.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    video.muted = true;
    video.playsInline = true;

    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay can still be blocked by browser policies; fail silently.
      });
    }
  }

  function isMobileDevice() {
    const uaMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const compactViewport = window.matchMedia("(max-width: 767px)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    return uaMobile || (compactViewport && coarsePointer);
  }

  function scoreDevice() {
    const reasons = [];
    let score = 0;

    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 || canvas.getContext("webgl");
    if (!gl) return { score: 0, gpu: null, reasons: ["no WebGL"] };
    score += gl2 ? 30 : 20;

    let gpu = "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      gpu = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();

      const software = ["swiftshader", "llvmpipe", "software", "mesa offscreen", "microsoft basic"];
      if (software.some((s) => gpu.includes(s))) {
        return { score: 0, gpu, reasons: ["software renderer"] };
      }

      const weak = ["intel hd", "intel uhd", "intel iris", "mali-4", "mali-t", "adreno 3", "adreno 4", "powervr sgx"];
      score += weak.some((w) => gpu.includes(w)) ? 5 : 25;
    } else {
      // Some browsers block renderer info for privacy; don't under-score capable WebGL2 devices.
      score += gl2 ? 18 : 8;
      reasons.push("gpu info unavailable");
    }

    if ("deviceMemory" in navigator) {
      const memory = navigator.deviceMemory;
      score += memory >= 8 ? 15 : memory >= 4 ? 10 : memory >= 2 ? 3 : 0;
    } else {
      score += 8;
    }

    const cores = navigator.hardwareConcurrency || 2;
    score += cores >= 8 ? 10 : cores >= 4 ? 7 : cores >= 2 ? 3 : 0;

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData) return { score: 0, gpu, reasons: ["data saver"] };
      if (["slow-2g", "2g", "3g"].includes(conn.effectiveType)) {
        return { score: 0, gpu, reasons: [`slow network: ${conn.effectiveType}`] };
      }
      if (conn.effectiveType === "4g") score += 10;
    } else {
      score += 5;
    }

    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && window.innerWidth < 768) {
      score -= 15;
      reasons.push("mobile");
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { score: 0, gpu, reasons: ["prefers-reduced-motion"] };
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      gpu,
      reasons,
    };
  }

  function decideMode() {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get("hero");
    if (forced === "auto") {
      removeStorage(sessionStorage, FORCE_KEY);
      removeStorage(sessionStorage, AUTO_MODE_KEY);
    }

    if (isValidMode(forced)) {
      writeStorage(sessionStorage, FORCE_KEY, forced);
      return { mode: forced, forced: true, source: "query" };
    }

    if (isMobileDevice()) {
      return { mode: "video", forced: false, source: "mobile" };
    }

    const saved = readStorage(sessionStorage, FORCE_KEY);
    if (isValidMode(saved)) {
      return { mode: saved, forced: true, source: "session" };
    }

    const cached = readAutoModeCache();
    if (cached === "3d") {
      return { mode: cached, forced: false, source: "cache" };
    }

    const profile = scoreDevice();
    const mode = profile.score >= THREE_D_THRESHOLD ? "3d" : "video";

    return {
      mode,
      forced: false,
      source: "desktop-score",
      profile,
    };
  }

  function loadVideo(hero) {
    if (!hero) return;
    if (fallbackHeroMarkup && hero.classList.contains("hero--three")) {
      hero.innerHTML = fallbackHeroMarkup;
    }

    hero.classList.remove("hero--three");
    delete hero.dataset.hero3dMounted;
    document.body.classList.remove("hero-3d-active");
    document.documentElement.dataset.heroMode = "video";
    ensureHeroVideoPlayback(hero);
  }

  async function load3D(hero) {
    const mod = await import("/hero-3d.js");
    await mod.init(hero);
    document.documentElement.dataset.heroMode = "3d";
  }

  function init() {
    const hero = document.getElementById("hero");
    if (!hero) return;

    fallbackHeroMarkup = hero.innerHTML;

    const decision = decideMode();
    console.debug("[hero] mode decision:", decision);

    if (!decision.forced) {
      writeAutoModeCache(decision.mode, decision);
    }

    if (decision.mode === "3d") {
      load3D(hero).catch((error) => {
        console.warn("[hero] 3D hero failed, falling back to video", error);
        if (!decision.forced) {
          removeStorage(sessionStorage, AUTO_MODE_KEY);
        }
        loadVideo(hero);
      });
    } else {
      loadVideo(hero);
    }

    window.switchHero = (mode) => {
      if (mode === "auto") {
        removeStorage(sessionStorage, FORCE_KEY);
        removeStorage(sessionStorage, AUTO_MODE_KEY);
        location.reload();
        return;
      }

      if (!isValidMode(mode)) return;
      writeStorage(sessionStorage, FORCE_KEY, mode);
      location.reload();
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
