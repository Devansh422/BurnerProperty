/**
 * hero-loader.js
 * Default behaviour: load the 3D hero. Only fall back to the lightweight
 * video on a small set of hard-disqualifier signals (mobile, no WebGL,
 * software renderer, reduced-motion, data-saver).
 */

(() => {
  const FORCE_KEY = "hero-mode"; // ?hero=3d or ?hero=video to override

  let fallbackHeroMarkup = "";

  function isValidMode(mode) {
    return mode === "3d" || mode === "video";
  }

  function ensureHeroVideoPlayback(hero) {
    const video = hero?.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return;
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

  // Returns a reason string when the device is *clearly* unable to handle the
  // 3D scene; null otherwise. Default is to allow 3D.
  function lowEndReason() {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return "no WebGL";

    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      const gpu = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();
      const software = ["swiftshader", "llvmpipe", "software", "mesa offscreen", "microsoft basic"];
      if (software.some((s) => gpu.includes(s))) return "software renderer";
    }

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && ["slow-2g", "2g"].includes(conn.effectiveType)) {
      return `slow network: ${conn.effectiveType}`;
    }

    return null;
  }

  function decideMode() {
    // Mobile is hard-locked to video — phones cannot run this scene.
    if (isMobileDevice()) {
      return { mode: "video", forced: false, source: "mobile" };
    }

    // URL override for testing / user preference
    const params = new URLSearchParams(window.location.search);
    const forced = params.get("hero");
    if (isValidMode(forced)) return { mode: forced, forced: true, source: "query" };

    // Sticky preference (if user previously chose)
    const saved = sessionStorage.getItem(FORCE_KEY);
    if (isValidMode(saved)) return { mode: saved, forced: true, source: "session" };

    const reason = lowEndReason();
    if (reason) {
      return { mode: "video", forced: false, source: "low-end", reason };
    }

    return { mode: "3d", forced: false, source: "default" };
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
      if (mode === "auto") {
        sessionStorage.removeItem(FORCE_KEY);
        location.reload();
        return;
      }
      if (!isValidMode(mode)) return;
      sessionStorage.setItem(FORCE_KEY, mode);
      location.reload();
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
