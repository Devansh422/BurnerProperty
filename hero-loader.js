(() => {
  const THREE_D_THRESHOLD = 60;

  let fallbackHeroMarkup = "";

  function isValidMode(mode) {
    return mode === "3d" || mode === "video";
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

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { score: 0, gpu: null, reasons: ["prefers-reduced-motion"] };
    }

    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 || canvas.getContext("webgl");
    if (!gl) return { score: 0, gpu: null, reasons: ["no WebGL"] };
    score += gl2 ? 25 : 12;

    let gpu = "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      gpu = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();

      const software = ["swiftshader", "llvmpipe", "software", "mesa offscreen", "microsoft basic"];
      if (software.some((s) => gpu.includes(s))) {
        return { score: 0, gpu, reasons: ["software renderer"] };
      }

      // Integrated/old mobile GPUs cannot hold 60fps with the grass shader — auto-fail.
      const weak = ["intel hd", "intel uhd", "mali-4", "mali-t", "adreno 3", "adreno 4", "powervr sgx", "intel(r) hd", "intel(r) uhd"];
      if (weak.some((w) => gpu.includes(w))) {
        return { score: 0, gpu, reasons: ["weak GPU"] };
      }

      score += 30;
    } else {
      // Some browsers (Safari, privacy modes) hide renderer info.
      // WebGL2 + hidden GPU is most often Apple silicon / modern Mac → still capable.
      score += gl2 ? 16 : 6;
      reasons.push("gpu info unavailable");
    }

    if ("deviceMemory" in navigator) {
      const memory = navigator.deviceMemory;
      if (memory < 2) {
        return { score: 0, gpu, reasons: [`low memory: ${memory}GB`] };
      }
      score += memory >= 8 ? 18 : memory >= 4 ? 10 : 0;
    } else {
      score += 8;
    }

    const cores = navigator.hardwareConcurrency || 0;
    if (cores > 0 && cores < 4) {
      return { score: 0, gpu, reasons: [`low CPU: ${cores} cores`] };
    }
    score += cores >= 8 ? 12 : cores >= 4 ? 6 : 4;

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData) return { score: 0, gpu, reasons: ["data saver"] };
      if (["slow-2g", "2g", "3g"].includes(conn.effectiveType)) {
        return { score: 0, gpu, reasons: [`slow network: ${conn.effectiveType}`] };
      }
      score += conn.effectiveType === "4g" ? 8 : 5;
    } else {
      score += 5;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      gpu,
      reasons,
    };
  }

  function decideMode() {
    // Mobile is hard-locked to video: no scoring, no query override.
    if (isMobileDevice()) {
      return { mode: "video", forced: false, source: "mobile" };
    }

    const params = new URLSearchParams(window.location.search);
    const forced = params.get("hero");
    if (isValidMode(forced)) {
      return { mode: forced, forced: true, source: "query" };
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
    document.documentElement.dataset.heroMode = "3d";
    // Pause/strip the inline video before importing so it doesn't continue
    // downloading bytes that will be discarded when we mount the 3D scene.
    const inlineVideo = hero?.querySelector("video");
    if (inlineVideo instanceof HTMLVideoElement) {
      try { inlineVideo.pause(); } catch (_) {}
      inlineVideo.removeAttribute("autoplay");
      inlineVideo.removeAttribute("src");
      while (inlineVideo.firstChild) inlineVideo.removeChild(inlineVideo.firstChild);
      try { inlineVideo.load(); } catch (_) {}
    }

    const mod = await import("/hero-3d.js");
    await mod.init(hero);
  }

  function init() {
    const hero = document.getElementById("hero");
    if (!hero) return;

    fallbackHeroMarkup = hero.innerHTML;

    const decision = decideMode();
    console.debug("[hero] mode decision:", decision);

    if (decision.mode === "3d") {
      load3D(hero).catch((error) => {
        console.warn("[hero] 3D hero failed, falling back to video", error);
        loadVideo(hero);
      });
    } else {
      loadVideo(hero);
    }

    window.switchHero = (mode) => {
      const url = new URL(window.location.href);

      if (mode === "auto") {
        url.searchParams.delete("hero");
        window.location.assign(url.toString());
        return;
      }

      if (!isValidMode(mode)) return;
      url.searchParams.set("hero", mode);
      window.location.assign(url.toString());
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
