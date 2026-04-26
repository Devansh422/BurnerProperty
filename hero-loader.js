(() => {
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

  // Strict high-end detection. Defaults to false; we only escalate to 3D
  // when *every* signal we can read says the device is comfortably capable.
  function checkHighEnd() {
    const reasons = [];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { highEnd: false, reasons: ["prefers-reduced-motion"] };
    }

    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (!gl2) {
      return { highEnd: false, reasons: ["no WebGL2"] };
    }

    let gpu = "";
    const dbg = gl2.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      gpu = (gl2.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase();

      // Hard reject only on software renderers and clearly antique mobile GPUs.
      // Note: we deliberately do NOT reject "intel hd"/"intel uhd" — Chrome routes
      // WebGL through ANGLE on the integrated GPU on many laptops that *also*
      // have a discrete GPU, so that string is not a reliable weakness signal.
      const blocked = [
        "swiftshader", "llvmpipe", "software",
        "mesa offscreen", "microsoft basic",
        "mali-4", "powervr sgx"
      ];
      if (blocked.some((s) => gpu.includes(s))) {
        return { highEnd: false, gpu, reasons: ["blocked GPU"] };
      }
    } else {
      reasons.push("gpu info hidden");
    }

    // CPU: high-end machines today have ≥8 logical cores. Some browsers cap this
    // at lower values for privacy; treat 0/undefined as "unknown" and accept it
    // rather than reject (Safari sometimes reports 0).
    const cores = navigator.hardwareConcurrency;
    if (typeof cores === "number" && cores > 0 && cores < 8) {
      return { highEnd: false, cores, reasons: [`cores ${cores} < 8`] };
    }

    // RAM: browsers cap deviceMemory at 8GB, and many (Firefox/Safari) don't
    // expose it at all. Require 8 when present, accept when missing.
    if ("deviceMemory" in navigator) {
      const memory = navigator.deviceMemory;
      if (typeof memory === "number" && memory > 0 && memory < 8) {
        return { highEnd: false, memory, reasons: [`memory ${memory}GB < 8`] };
      }
    }

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData) return { highEnd: false, gpu, reasons: ["data saver"] };
      if (["slow-2g", "2g", "3g"].includes(conn.effectiveType)) {
        return { highEnd: false, gpu, reasons: [`slow network: ${conn.effectiveType}`] };
      }
    }

    return { highEnd: true, gpu, cores, reasons };
  }

  function decideMode() {
    // Mobile is hard-locked to video: no detection, no query override.
    if (isMobileDevice()) {
      return { mode: "video", forced: false, source: "mobile" };
    }

    const params = new URLSearchParams(window.location.search);
    const forced = params.get("hero");
    if (isValidMode(forced)) {
      return { mode: forced, forced: true, source: "query" };
    }

    // Default: video. Only escalate to 3D on a confirmed high-end device.
    const profile = checkHighEnd();
    return {
      mode: profile.highEnd ? "3d" : "video",
      forced: false,
      source: "desktop-check",
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
