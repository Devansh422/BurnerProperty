/**
 * hero-loader.js
 * Decides whether to load the heavy 3D hero or the lightweight video fallback.
 * Mobile is hard-locked to video. On desktop, score the device and only
 * fetch the 3D bundle when the score clears the threshold.
 */

(() => {
  const THREE_D_THRESHOLD = 60; // tune after testing on real devices
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

  // ---------- Device scoring ----------

  function scoreDevice() {
    const reasons = [];
    let score = 0;

    // 1. WebGL is non-negotiable
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 || canvas.getContext("webgl");
    if (!gl) return { score: 0, gpu: null, reasons: ["no WebGL"] };
    score += gl2 ? 30 : 20;

    // 2. GPU sniff
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
      score += 10; // unknown GPU, partial credit
    }

    // 3. RAM
    if ("deviceMemory" in navigator) {
      const m = navigator.deviceMemory;
      score += m >= 8 ? 15 : m >= 4 ? 10 : m >= 2 ? 3 : 0;
    } else {
      score += 8;
    }

    // 4. CPU cores
    const cores = navigator.hardwareConcurrency || 2;
    score += cores >= 8 ? 10 : cores >= 4 ? 7 : cores >= 2 ? 3 : 0;

    // 5. Network
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

    // 6. Mobile penalty (in addition to the hard mobile lock above)
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile && window.innerWidth < 768) {
      score -= 15;
      reasons.push("mobile");
    }

    // 7. Reduced motion -> always video
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { score: 0, gpu, reasons: ["prefers-reduced-motion"] };
    }

    return { score: Math.max(0, Math.min(100, score)), gpu, reasons };
  }

  // ---------- Decide & load ----------

  function decideMode() {
    // Mobile is hard-locked to video — no scoring, no override.
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

    const result = scoreDevice();
    return {
      mode: result.score >= THREE_D_THRESHOLD ? "3d" : "video",
      forced: false,
      source: "desktop-score",
      detail: result,
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

    // Optional: expose a toggle so users can switch
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
