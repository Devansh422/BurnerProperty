/* ==========================================================
   Burner Properties — shared app.js
   Lenis + GSAP + ScrollTrigger + SplitText
   ========================================================== */

const splitTextLoaded = typeof window.SplitText !== 'undefined';
let fontsReadyPromise = null;

gsap.registerPlugin(ScrollTrigger);
if (splitTextLoaded) {
  gsap.registerPlugin(SplitText);
}

function waitForFontsReady() {
  if (!document.fonts || typeof document.fonts.ready === 'undefined') {
    return Promise.resolve('unsupported');
  }

  if (!fontsReadyPromise) {
    /* Prevent startup from hanging forever if font loading stalls unexpectedly. */
    const readyPromise = document.fonts.ready
      .then(() => 'ready')
      .catch(() => 'error');
    const timeoutPromise = new Promise((resolve) => {
      window.setTimeout(() => resolve('timeout'), 6000);
    });

    fontsReadyPromise = Promise.race([readyPromise, timeoutPromise]);
  }

  return fontsReadyPromise;
}

function runSafe(stepName, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`[animations] ${stepName} failed`, error);
  }
}

function splitTextSafe(el, options = {}) {
  if (!el || !splitTextLoaded || typeof SplitText.create !== 'function') return null;
  try {
    if (el.__splitInstance && typeof el.__splitInstance.revert === 'function') {
      el.__splitInstance.revert();
      el.__splitInstance = null;
    }

    const split = SplitText.create(el, {
      type: 'lines, words',
      linesClass: 'split-line',
      wordsClass: 'split-word',
      mask: 'lines',
      ...options,
    });

    el.__splitInstance = split;
    return split;
  } catch (error) {
    console.warn('[animations] SplitText fallback used', error);
    return null;
  }
}

function splitHeroTitleWords(titleEl) {
  if (!titleEl) return [];

  const existingWords = titleEl.querySelectorAll('.hero-word');
  if (existingWords.length) return Array.from(existingWords);

  const sourceText = (titleEl.dataset.heroTitleSource || titleEl.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!sourceText) return [];

  titleEl.dataset.heroTitleSource = sourceText;
  titleEl.textContent = '';

  const words = sourceText.split(' ');
  const fragment = document.createDocumentFragment();

  words.forEach((word, index) => {
    const mask = document.createElement('span');
    mask.className = 'hero-word-mask';

    const text = document.createElement('span');
    text.className = 'hero-word';
    text.textContent = word;

    mask.appendChild(text);
    fragment.appendChild(mask);

    if (index < words.length - 1) {
      fragment.appendChild(document.createTextNode(' '));
    }
  });

  titleEl.appendChild(fragment);
  return Array.from(titleEl.querySelectorAll('.hero-word'));
}

function primeAnimationStates() {
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    el.classList.add('is-reveal-hidden');
  });

  document.querySelectorAll('.card, .blog-card, .team__member, .value').forEach((el) => {
    el.classList.add('is-card-hidden');
  });

  document.querySelectorAll('.step').forEach((el) => {
    el.classList.add('is-step-hidden');
  });

  document.querySelectorAll('[data-split]').forEach((el) => {
    el.classList.add('split-hidden');
  });

  const big = document.querySelector('.footer .big');
  if (big) big.classList.add('split-hidden');
}

primeAnimationStates();

/* -----------------------------------------------------------
   LENIS smooth scroll  (integrated with ScrollTrigger)
   ----------------------------------------------------------- */
let lenis = null;
let lenisVelocity = 0;

if (typeof window.Lenis !== 'undefined') {
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    smoothTouch: false,
  });

  lenis.on('scroll', (e) => {
    lenisVelocity = typeof e?.velocity === 'number' ? e.velocity : 0;
    ScrollTrigger.update();
  });

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);
} else {
  console.warn('[animations] Lenis not detected. Running with native scroll.');
}

/* -----------------------------------------------------------
   MOBILE NAV
   ----------------------------------------------------------- */
function setupNav() {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  const mobile = document.querySelector('.nav-mobile');
  const hero = document.querySelector('.hero');

  if (nav) {
    const navLinks = nav.querySelector('.nav-links');
    const navCta = nav.querySelector('.nav-cta');
    const desktopMq = window.matchMedia('(min-width: 861px)');

    let navScrolled = false;
    let navCompactRequested = false;
    let navExpandedByHover = false;
    let resizeRaf = 0;

    const animateNavState = (instant = false) => {
      if (!desktopMq.matches) {
        nav.classList.remove('is-compact');
        nav.classList.toggle('is-scrolled', navScrolled);

        gsap.killTweensOf([nav, navLinks, navCta]);
        gsap.set(nav, {
          clearProps: 'width,paddingLeft,paddingRight,gap,backgroundColor,borderColor,boxShadow',
        });
        if (navLinks) {
          gsap.set(navLinks, { clearProps: 'opacity,x,maxWidth,pointerEvents' });
        }
        if (navCta) {
          gsap.set(navCta, {
            clearProps: 'opacity,x,maxWidth,paddingLeft,paddingRight,pointerEvents',
          });
        }
        return;
      }

      const compact = navCompactRequested && !navExpandedByHover;
      const duration = instant ? 0 : 0.68;
      const navWidthExpanded = Math.min(1180, window.innerWidth - 24);
      const navWidthCompact = gsap.utils.clamp(300, 430, window.innerWidth * 0.34);

      nav.classList.toggle('is-scrolled', navScrolled);
      nav.classList.toggle('is-compact', compact);

      gsap.to(nav, {
        width: compact ? navWidthCompact : navWidthExpanded,
        paddingLeft: compact ? 12 : 18,
        paddingRight: compact ? 12 : 10,
        gap: compact ? 8 : 12,
        backgroundColor: compact
          ? 'rgba(232, 222, 201, 0.84)'
          : navScrolled
            ? 'rgba(232, 222, 201, 0.9)'
            : 'rgba(232, 222, 201, 0.72)',
        borderColor: navScrolled || compact
          ? 'rgba(10, 50, 43, 0.24)'
          : 'rgba(10, 50, 43, 0.18)',
        boxShadow: compact
          ? '0 8px 24px -18px rgba(4, 18, 16, 0.18)'
          : navScrolled
            ? '0 10px 30px -15px rgba(4, 18, 16, 0.2)'
            : '0 0 0 rgba(4, 18, 16, 0)',
        duration,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (navLinks) {
        navLinks.style.pointerEvents = compact ? 'none' : 'auto';
        gsap.to(navLinks, {
          opacity: compact ? 0 : 1,
          x: compact ? 12 : 0,
          maxWidth: compact ? 0 : 760,
          duration: instant ? 0 : 0.62,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (navCta) {
        navCta.style.pointerEvents = 'auto';
        gsap.to(navCta, {
          opacity: 1,
          x: 0,
          maxWidth: 220,
          paddingLeft: 16,
          paddingRight: 16,
          duration: instant ? 0 : 0.62,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    };

    const setNavScrolled = (nextValue, instant = false) => {
      if (navScrolled === nextValue) return;
      navScrolled = nextValue;
      animateNavState(instant);
    };

    const setNavCompactRequested = (nextValue, instant = false) => {
      if (navCompactRequested === nextValue) {
        if (instant) animateNavState(true);
        return;
      }
      navCompactRequested = nextValue;
      if (!navCompactRequested) {
        navExpandedByHover = false;
      }
      animateNavState(instant);
    };

    const setNavExpanded = (nextValue, instant = false) => {
      const expanded = desktopMq.matches && navCompactRequested ? nextValue : false;
      if (navExpandedByHover === expanded) return;
      navExpandedByHover = expanded;
      animateNavState(instant);
    };

    ScrollTrigger.create({
      start: 20,
      end: 99999,
      onUpdate: (self) => {
        setNavScrolled(self.scroll() > 20);
      },
    });

    if (hero) {
      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        onEnter: () => setNavCompactRequested(false),
        onEnterBack: () => setNavCompactRequested(false),
        onLeave: () => setNavCompactRequested(true),
        onLeaveBack: () => setNavCompactRequested(false),
        onUpdate: (self) => {
          setNavCompactRequested(self.progress >= 0.88);
        },
        onRefresh: (self) => {
          setNavCompactRequested(self.progress >= 0.88, true);
        },
      });

      setNavCompactRequested(hero.getBoundingClientRect().bottom <= 80, true);
    } else {
      setNavCompactRequested(false, true);
    }

    nav.addEventListener('mouseenter', () => setNavExpanded(true));
    nav.addEventListener('mouseleave', () => setNavExpanded(false));
    nav.addEventListener('focusin', () => setNavExpanded(true));
    nav.addEventListener('focusout', () => {
      if (!nav.contains(document.activeElement)) {
        setNavExpanded(false);
      }
    });

    const onDesktopModeChanged = () => {
      if (!desktopMq.matches) {
        navExpandedByHover = false;
      }
      animateNavState(true);
    };

    if (typeof desktopMq.addEventListener === 'function') {
      desktopMq.addEventListener('change', onDesktopModeChanged);
    } else if (typeof desktopMq.addListener === 'function') {
      desktopMq.addListener(onDesktopModeChanged);
    }

    window.addEventListener('resize', () => {
      window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(() => {
        if (!hero) {
          animateNavState(true);
          return;
        }
        const compactFromLayout = hero.getBoundingClientRect().bottom <= 80;
        if (compactFromLayout !== navCompactRequested) {
          setNavCompactRequested(compactFromLayout, true);
          return;
        }
        animateNavState(true);
      });
    });

    animateNavState(true);
  }

  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      const open = mobile.classList.toggle('is-open');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mobile.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        mobile.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });
  }
}

/* -----------------------------------------------------------
   PAGE REVEAL — curtain of columns lifts off, then hero enters
   ----------------------------------------------------------- */
function pageReveal() {
  const cols = document.querySelectorAll('.page-reveal__col');
  const brand = document.querySelector('.page-reveal__brand');
  const reveal = document.querySelector('.page-reveal');

  if (!cols.length) return Promise.resolve();

  if (lenis) lenis.stop();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safetyTimer);
      if (reveal) reveal.remove();
      if (brand) brand.remove();
      if (lenis) lenis.start();
      resolve();
    };

    const tl = gsap.timeline({ onComplete: finish });
    const safetyTimer = window.setTimeout(() => {
      console.warn('[animations] pageReveal safety timeout reached; forcing completion');
      tl.kill();
      finish();
    }, 2600);

    gsap.set(cols, { transformOrigin: 'bottom' });
    if (brand) {
      gsap.set(brand, { opacity: 0, y: 20 });
      tl.to(brand, {
        opacity: 1,
        y: 0,
        duration: 0.55,
        ease: 'power3.out',
      }).to(brand, {
        opacity: 0,
        y: -14,
        duration: 0.4,
        ease: 'power2.in',
      }, '+=0.35');
    }

    tl.to(cols, {
        scaleY: 0,
        duration: 1.05,
        stagger: { each: 0.06, from: 'start' },
        ease: 'expo.inOut',
      }, brand ? '-=0.15' : 0);
  });
}

/* -----------------------------------------------------------
   HERO reveal — entrance timeline + scroll scrub (kept separate
   so the scrub never fights the entrance).
   ----------------------------------------------------------- */
function heroReveal() {
  const title = document.querySelector('[data-hero-title]');
  if (!title) return;

  const heroWords = splitHeroTitleWords(title);
  if (heroWords.length) {
    gsap.fromTo(
      heroWords,
      { yPercent: 115, opacity: 0 },
      {
        yPercent: 0,
        opacity: 1,
        stagger: 0.045,
        duration: 1,
        ease: 'expo.out',
      }
    );
  } else {
    gsap.fromTo(
      title,
      { y: 36, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.95, ease: 'expo.out' }
    );
  }
}

/* -----------------------------------------------------------
   HOVER MICROINTERACTIONS — magnetic buttons, card tilt,
   image zoom, link underline, cursor-follow on cards
   ----------------------------------------------------------- */
function microInteractions() {
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const d = {
    pressDown: 0.16,
    pressUp: 0.38,
    fieldFocusIn: 0.28,
    fieldFocusOut: 0.34,
    buttonHoverIn: 0.48,
    buttonHoverOut: 0.62,
    magnetic: 0.58,
    spotlight: 0.38,
    cardHoverIn: 0.66,
    cardHoverOut: 0.84,
    cardShadowOut: 0.22,
    cardBodyIn: 0.66,
    cardBodyOut: 0.84,
    cardTagIn: 0.66,
    cardTagOut: 0.84,
    cardMediaFilterIn: 0.66,
    cardMediaFilterOut: 0.84,
    cardTilt: 0.88,
    cardMediaIn: 0.86,
    cardMediaOut: 0.84,
    blogCardIn: 0.58,
    blogCardOut: 0.74,
    blogShadowOut: 0.2,
    blogMediaIn: 0.72,
    blogMediaOut: 0.86,
    valueCardIn: 0.54,
    valueCardOut: 0.7,
    stepIn: 0.42,
    stepOut: 0.52,
    linkIn: 0.42,
    linkOut: 0.56,
  };

  const rootStyles = getComputedStyle(document.documentElement);
  const palette = {
    base: rootStyles.getPropertyValue('--base').trim() || '#E8DEC9',
    base2: rootStyles.getPropertyValue('--base-2').trim() || '#efe7d6',
    text: rootStyles.getPropertyValue('--text').trim() || '#041210',
    color1: rootStyles.getPropertyValue('--color1').trim() || '#0A322B',
    color1Line: rootStyles.getPropertyValue('--color1-line').trim() || 'rgba(10, 50, 43, 0.18)',
  };

  const shadows = {
    cardBase: '0 0 0 0 rgba(0, 0, 0, 0), 0 0 0 0 rgba(114, 236, 203, 0)',
    cardHover: '0 42px 66px -36px rgba(0, 0, 0, 0.8), 0 8px 24px -16px rgba(114, 236, 203, 0.48)',
    blogBase: '0 0 0 0 rgba(4, 18, 16, 0)',
    blogHover: '0 20px 40px -25px rgba(4, 18, 16, 0.35)',
  };

  /* Tap/click feedback for interactive controls */
  document
    .querySelectorAll('.btn, .nav-cta, .nav-toggle, .step__arrow, .blog-tabs button')
    .forEach((el) => {
      const release = () => {
        gsap.to(el, {
          scale: 1,
          duration: d.pressUp,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      };

      el.addEventListener('pointerdown', () => {
        gsap.to(el, {
          scale: 0.96,
          duration: d.pressDown,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      });

      el.addEventListener('pointerup', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('blur', release);
    });

  /* Inputs rise subtly on focus */
  document
    .querySelectorAll('.form input, .form textarea, .form select')
    .forEach((field) => {
      field.addEventListener('focus', () =>
        gsap.to(field, {
          y: -1,
          duration: d.fieldFocusIn,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      );
      field.addEventListener('blur', () =>
        gsap.to(field, {
          y: 0,
          duration: d.fieldFocusOut,
          ease: 'power2.out',
          overwrite: 'auto',
        })
      );
    });

  if (!finePointer) return;

  /* Smooth duration-based hover animation for buttons */
  document.querySelectorAll('.btn, .nav-cta').forEach((btn) => {
    btn.addEventListener('mouseenter', () => {
      gsap.to(btn, {
        scale: 1.02,
        duration: d.buttonHoverIn,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, {
        scale: 1,
        duration: d.buttonHoverOut,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    });
  });

  /* Magnetic pull on key CTAs */
  const magnets = document.querySelectorAll(
    '.btn-primary, .btn-ghost, .nav-cta, .step__arrow, .form__submit'
  );
  magnets.forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: d.magnetic, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: d.magnetic, ease: 'power3.out' });

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);
      xTo(relX * 0.22);
      yTo(relY * 0.3);
    });
    el.addEventListener('mouseleave', () => {
      xTo(0);
      yTo(0);
    });
  });

  /* Pointer spotlight on cards/value tiles */
  document.querySelectorAll('.card, .blog-card, .value').forEach((item) => {
    const spotOpacityTo = gsap.quickTo(item, '--spot-opacity', {
      duration: d.spotlight,
      ease: 'power2.out',
    });

    item.addEventListener('mousemove', (e) => {
      const rect = item.getBoundingClientRect();
      item.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
      item.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
      spotOpacityTo(1);
    });
    item.addEventListener('mouseleave', () => {
      spotOpacityTo(0);
    });
  });

  /* Property card tilt + image zoom */
  document.querySelectorAll('.card').forEach((card) => {
    const media = card.querySelector('.card__media');
    const body = card.querySelector('.card__body');
    const tag = card.querySelector('.card__tag');
    const mediaScaleTo = media
      ? gsap.quickTo(media, 'scale', { duration: d.cardMediaIn, ease: 'power3.out' })
      : null;
    const rxTo = gsap.quickTo(card, 'rotationY', {
      duration: d.cardTilt,
      ease: 'power3.out',
    });
    const ryTo = gsap.quickTo(card, 'rotationX', {
      duration: d.cardTilt,
      ease: 'power3.out',
    });

    gsap.set(card, {
      '--card-sheen-opacity': 0,
      '--card-sheen-x': '-36%',
      boxShadow: shadows.cardBase,
    });

    card.addEventListener('mouseenter', () => {
      gsap.to(card, {
        borderColor: 'rgba(167, 248, 225, 0.48)',
        boxShadow: shadows.cardHover,
        filter: 'saturate(1.05)',
        '--card-sheen-opacity': 0.8,
        '--card-sheen-x': '26%',
        duration: d.cardHoverIn,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (body) {
        gsap.to(body, {
          y: -4,
          borderColor: 'rgba(179, 246, 227, 0.32)',
          duration: d.cardBodyIn,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (tag) {
        gsap.to(tag, {
          y: -1,
          borderColor: 'rgba(185, 250, 230, 0.58)',
          duration: d.cardTagIn,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (media) {
        gsap.to(media, {
          filter: 'saturate(1.14) contrast(1.05)',
          duration: d.cardMediaFilterIn,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      rxTo(px * 3.2);
      ryTo(-py * 3.2);
      if (mediaScaleTo) {
        mediaScaleTo(1.03);
      }
    });

    card.addEventListener('mouseleave', () => {
      rxTo(0);
      ryTo(0);

      gsap.to(card, {
        boxShadow: shadows.cardBase,
        duration: d.cardShadowOut,
        ease: 'power2.out',
        overwrite: 'auto',
      });

      gsap.to(card, {
        borderColor: 'rgba(232, 222, 201, 0.2)',
        filter: 'saturate(1)',
        '--card-sheen-opacity': 0,
        '--card-sheen-x': '-36%',
        duration: d.cardHoverOut,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (body) {
        gsap.to(body, {
          y: 0,
          borderColor: 'rgba(232, 222, 201, 0.16)',
          duration: d.cardBodyOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (tag) {
        gsap.to(tag, {
          y: 0,
          borderColor: 'rgba(232, 222, 201, 0.34)',
          duration: d.cardTagOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (mediaScaleTo) {
        gsap.to(media, {
          scale: 1,
          duration: d.cardMediaOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
        gsap.to(media, {
          filter: 'saturate(1) contrast(1)',
          duration: d.cardMediaFilterOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });

    gsap.set(card, { transformPerspective: 900, transformStyle: 'preserve-3d' });
  });

  /* Blog cards — smooth hover elevation + media zoom */
  document.querySelectorAll('.blog-card').forEach((card) => {
    const media = card.querySelector('.blog-card__media');
    gsap.set(card, { boxShadow: shadows.blogBase });

    card.addEventListener('mouseenter', () => {
      gsap.to(card, {
        y: -4,
        boxShadow: shadows.blogHover,
        borderColor: 'rgba(10, 50, 43, 0.3)',
        duration: d.blogCardIn,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (media) {
        gsap.to(media, {
          scale: 1.08,
          duration: d.blogMediaIn,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        boxShadow: shadows.blogBase,
        duration: d.blogShadowOut,
        ease: 'power2.out',
        overwrite: 'auto',
      });

      gsap.to(card, {
        y: 0,
        borderColor: palette.color1Line,
        duration: d.blogCardOut,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (media) {
        gsap.to(media, {
          scale: 1,
          duration: d.blogMediaOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });
  });

  /* Value cards — GSAP hover states instead of CSS snap */
  document.querySelectorAll('.value').forEach((valueCard) => {
    const heading = valueCard.querySelector('h3');
    const number = valueCard.querySelector('.value__num');

    valueCard.addEventListener('mouseenter', () => {
      gsap.to(valueCard, {
        y: -4,
        backgroundColor: palette.color1,
        color: palette.base,
        borderColor: 'rgba(10, 50, 43, 0.34)',
        duration: d.valueCardIn,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (heading) {
        gsap.to(heading, {
          color: palette.base,
          duration: d.valueCardIn,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (number) {
        gsap.to(number, {
          color: palette.base,
          duration: d.valueCardIn,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });

    valueCard.addEventListener('mouseleave', () => {
      gsap.to(valueCard, {
        y: 0,
        backgroundColor: palette.base2,
        color: palette.text,
        borderColor: palette.color1Line,
        duration: d.valueCardOut,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      if (heading) {
        gsap.to(heading, {
          color: palette.color1,
          duration: d.valueCardOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }

      if (number) {
        gsap.to(number, {
          color: palette.color1,
          duration: d.valueCardOut,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    });
  });

  /* Step row hover highlight */
  document.querySelectorAll('.step').forEach((step) => {
    const num = step.querySelector('.step__num');
    step.addEventListener('mouseenter', () => {
      if (num) gsap.to(num, { x: 8, opacity: 1, duration: d.stepIn, ease: 'power3.out' });
    });
    step.addEventListener('mouseleave', () => {
      if (num) gsap.to(num, { x: 0, opacity: 0.5, duration: d.stepOut, ease: 'power3.out' });
    });
  });

  /* Gentle hover drift on key text links */
  document
    .querySelectorAll('.nav-links a, .footer ul a, .info-block a, .blog-card__more')
    .forEach((a) => {
      a.addEventListener('mouseenter', () =>
        gsap.to(a, { y: -2, x: 1, duration: d.linkIn, ease: 'power3.out' })
      );
      a.addEventListener('mouseleave', () =>
        gsap.to(a, { y: 0, x: 0, duration: d.linkOut, ease: 'power3.out' })
      );
    });
}

/* -----------------------------------------------------------
   MARQUEE — GSAP-driven so timeScale can be modulated
   ----------------------------------------------------------- */
let marqueeTweens = [];
let marqueeTracks = [];
let marqueeResetCall = null;
let marqueeSmoothedVelocity = 0;
let marqueeLastBoost = 1;
let marqueeLastSkew = 0;

function resetMarqueeMotion() {
  if (!marqueeTweens.length || !marqueeTracks.length) return;
  marqueeSmoothedVelocity = 0;
  marqueeLastBoost = 1;
  marqueeLastSkew = 0;

  marqueeTweens.forEach((tween) => {
    gsap.to(tween, {
      timeScale: 1,
      duration: 0.9,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  });

  marqueeTracks.forEach((track) => {
    gsap.to(track, {
      skewX: 0,
      duration: 0.9,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  });
}

function nudgeMarquee(rawVelocity) {
  if (!marqueeTweens.length || !marqueeTracks.length) return;

  const raw = Number(rawVelocity) || 0;
  const clamped = gsap.utils.clamp(-1.6, 1.6, raw);
  marqueeSmoothedVelocity = gsap.utils.interpolate(marqueeSmoothedVelocity, clamped, 0.1);

  const absV = Math.abs(marqueeSmoothedVelocity);
  const boost = gsap.utils.clamp(1, 1.5, 1 + absV * 0.36);
  const skew = gsap.utils.clamp(-2.2, 2.2, marqueeSmoothedVelocity * -1.05);

  if (Math.abs(boost - marqueeLastBoost) > 0.02) {
    marqueeLastBoost = boost;
    marqueeTweens.forEach((tween) => {
      gsap.to(tween, {
        timeScale: boost,
        duration: 0.48,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    });
  }

  if (Math.abs(skew - marqueeLastSkew) > 0.08) {
    marqueeLastSkew = skew;
    marqueeTracks.forEach((track) => {
      gsap.to(track, {
        skewX: skew,
        duration: 0.5,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    });
  }

  if (marqueeResetCall) {
    marqueeResetCall.kill();
  }
  marqueeResetCall = gsap.delayedCall(0.7, resetMarqueeMotion);
}

function marqueeInit() {
  const tracks = gsap.utils.toArray('.marquee__track');
  if (!tracks.length) return;
  marqueeTracks = tracks;

  if (marqueeTweens.length) {
    marqueeTweens.forEach((tween) => tween.kill());
    marqueeTweens = [];
  }

  if (marqueeResetCall) {
    marqueeResetCall.kill();
    marqueeResetCall = null;
  }

  marqueeTracks.forEach((track) => {
    /* disable the CSS keyframe; drive with GSAP instead */
    track.style.animation = 'none';
    gsap.set(track, { xPercent: 0, skewX: 0, transformOrigin: 'center center' });

    const tween = gsap.to(track, {
      xPercent: -50,
      duration: 36,
      ease: 'none',
      repeat: -1,
    });

    marqueeTweens.push(tween);
  });

  marqueeTweens.forEach((tween) => tween.timeScale(1));
  marqueeSmoothedVelocity = 0;
  marqueeLastBoost = 1;
  marqueeLastSkew = 0;
}

function marqueeOnScroll() {
  if (!marqueeTracks.length || !marqueeTweens.length) return;

  const existingSpeedTrigger = ScrollTrigger.getById('marquee-speed-control');
  if (existingSpeedTrigger) existingSpeedTrigger.kill();

  /* Native-scroll fallback for pages/sessions where Lenis is not active */
  ScrollTrigger.create({
    id: 'marquee-speed-control',
    trigger: document.documentElement,
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      nudgeMarquee(self.getVelocity() / 2600);
    },
  });
}

/* -----------------------------------------------------------
   HOME CAROUSEL — 4-slide, infinite loop, 3s autoplay
   ----------------------------------------------------------- */
function homeCarousel() {
  const root = document.querySelector('[data-home-carousel]');
  if (!root) return;

  const slides = Array.from(root.querySelectorAll('[data-carousel-slide]'));
  const dots = Array.from(root.querySelectorAll('[data-carousel-dot]'));
  const prevBtn = root.querySelector('[data-carousel-prev]');
  const nextBtn = root.querySelector('[data-carousel-next]');

  if (slides.length < 2) return;

  const INTERVAL_MS = 3000;
  const TRANSITION_S = 0.82;
  let index = slides.findIndex((slide) => slide.classList.contains('is-active'));
  let timerId = null;
  let animating = false;

  if (index < 0) index = 0;

  const setActiveDot = () => {
    dots.forEach((dot, i) => {
      const active = i === index;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', String(active));
      dot.tabIndex = active ? 0 : -1;
    });
  };

  const prepInitialState = () => {
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
      gsap.set(slide, {
        autoAlpha: i === index ? 1 : 0,
        xPercent: 0,
        scale: i === index ? 1 : 1.03,
        zIndex: i === index ? 2 : 1,
      });
    });
    setActiveDot();
  };

  const goTo = (targetIndex, direction = 1) => {
    const nextIndex = (targetIndex + slides.length) % slides.length;
    if (animating || nextIndex === index) return;

    const currentSlide = slides[index];
    const nextSlide = slides[nextIndex];
    animating = true;

    currentSlide.classList.remove('is-active');
    nextSlide.classList.add('is-active');

    gsap.killTweensOf([currentSlide, nextSlide]);

    gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        index = nextIndex;
        animating = false;
        setActiveDot();
      },
    })
      .set(nextSlide, {
        zIndex: 3,
        autoAlpha: 0,
        xPercent: direction > 0 ? 8 : -8,
        scale: 1.04,
      }, 0)
      .to(currentSlide, {
        autoAlpha: 0,
        xPercent: direction > 0 ? -8 : 8,
        scale: 0.98,
        duration: TRANSITION_S,
        ease: 'power3.inOut',
      }, 0)
      .to(nextSlide, {
        autoAlpha: 1,
        xPercent: 0,
        scale: 1,
        duration: TRANSITION_S,
        ease: 'power3.inOut',
      }, 0)
      .set(currentSlide, { zIndex: 1, xPercent: 0, scale: 1.03 }, '>-0.01');
  };

  const next = () => goTo(index + 1, 1);
  const prev = () => goTo(index - 1, -1);

  const stopAutoPlay = () => {
    if (!timerId) return;
    window.clearInterval(timerId);
    timerId = null;
  };

  const startAutoPlay = () => {
    stopAutoPlay();
    timerId = window.setInterval(() => {
      if (document.hidden) return;
      next();
    }, INTERVAL_MS);
  };

  nextBtn?.addEventListener('click', () => {
    next();
    startAutoPlay();
  });

  prevBtn?.addEventListener('click', () => {
    prev();
    startAutoPlay();
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      const direction = i > index ? 1 : -1;
      goTo(i, direction);
      startAutoPlay();
    });
  });

  root.addEventListener('mouseenter', stopAutoPlay);
  root.addEventListener('mouseleave', startAutoPlay);
  root.addEventListener('focusin', stopAutoPlay);
  root.addEventListener('focusout', () => {
    if (!root.contains(document.activeElement)) {
      startAutoPlay();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  });

  prepInitialState();
  startAutoPlay();
}

/* -----------------------------------------------------------
   PROCESS STEP — scroll-scrub arrow drift
   ----------------------------------------------------------- */
function processScrub() {
  document.querySelectorAll('.step').forEach((step) => {
    const arrow = step.querySelector('.step__arrow');
    if (!arrow) return;
    gsap.fromTo(
      arrow,
      { x: -20, y: 10, opacity: 0.6 },
      {
        x: 0,
        y: 0,
        opacity: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: step,
          start: 'top 85%',
          end: 'top 40%',
          scrub: 0.6,
        },
      }
    );
  });
}

/* -----------------------------------------------------------
   TESTIMONIAL — scrub scale / parallax
   ----------------------------------------------------------- */
function testimonialScrub() {
  const testi = document.querySelector('.testi');
  if (!testi) return;
  gsap.fromTo(
    testi,
    { scale: 0.95, borderRadius: '4px' },
    {
      scale: 1,
      borderRadius: '18px',
      ease: 'none',
      scrollTrigger: {
        trigger: testi,
        start: 'top 90%',
        end: 'top 50%',
        scrub: 0.7,
      },
    }
  );
}

/* -----------------------------------------------------------
   CTA banner — scrub expand
   ----------------------------------------------------------- */
function ctaScrub() {
  const cta = document.querySelector('.cta-banner h2');
  if (!cta) return;
  gsap.fromTo(
    cta,
    { letterSpacing: '-0.04em', scale: 0.9 },
    {
      letterSpacing: '-0.02em',
      scale: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: cta,
        start: 'top 90%',
        end: 'top 40%',
        scrub: 0.8,
      },
    }
  );
}

/* -----------------------------------------------------------
   SECTION HEADINGS — split-text reveal on scroll
   ----------------------------------------------------------- */
function splitHeadings() {
  document.querySelectorAll('[data-split]').forEach((el) => {
    const split = splitTextSafe(el);

    if (split) {
      gsap.set(split.lines, { y: '1.1em' });
      gsap.set(split.words, { y: '118%', opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          invalidateOnRefresh: true,
          once: true,
        },
        onComplete: () => {
          el.classList.remove('split-hidden');
        },
      });

      tl.to(
        split.lines,
        {
          y: 0,
          duration: 0.86,
          stagger: 0.06,
          ease: 'power3.out',
        },
        0
      ).to(
        split.words,
        {
          y: 0,
          opacity: 1,
          stagger: 0.04,
          duration: 0.92,
          ease: 'expo.out',
        },
        0.02
      );
    } else {
      gsap.fromTo(
        el,
        { y: 36, marginTop: '0.7rem', opacity: 0 },
        {
          y: 0,
          marginTop: 0,
          opacity: 1,
          duration: 0.92,
          ease: 'expo.out',
          clearProps: 'transform,marginTop,opacity',
          scrollTrigger: {
            trigger: el,
            start: 'top 85%',
            invalidateOnRefresh: true,
            once: true,
          },
        }
      );
    }
  });
}

/* -----------------------------------------------------------
   GENERIC REVEAL — fade/rise for [data-reveal] elements
   ----------------------------------------------------------- */
function genericReveal() {
  const items = gsap.utils.toArray('[data-reveal]');
  if (!items.length) return;

  items.forEach((el) => {
    if (!el || !el.isConnected) return;

    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'expo.out',
          overwrite: 'auto',
          onStart: () => el.classList.add('is-in'),
          onComplete: () => el.classList.remove('is-reveal-hidden'),
        });
      },
    });
  });
}

/* -----------------------------------------------------------
   STEP LIST (process) — scroll reveal (fromTo keeps end state fixed)
   ----------------------------------------------------------- */
function processReveal() {
  const steps = gsap.utils.toArray('.step');
  if (!steps.length) return;

  gsap.to(
    steps,
    {
      y: 0,
      opacity: 1,
      duration: 0.9,
      ease: 'expo.out',
      stagger: 0.08,
      scrollTrigger: {
        trigger: '.process__list',
        start: 'top 85%',
        once: true,
      },
      onComplete: () => {
        steps.forEach((el) => el.classList.remove('is-step-hidden'));
      },
    }
  );
}

/* -----------------------------------------------------------
   CARDS (properties / blogs / team / values) — stagger reveal
   ----------------------------------------------------------- */
function cardsReveal() {
  const selectors = ['.card', '.blog-card', '.team__member', '.value'];
  selectors.forEach((sel) => {
    const items = gsap.utils.toArray(sel);
    if (!items.length) return;

    items.forEach((el) => {
      if (!el || !el.isConnected) return;

      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'expo.out',
            overwrite: 'auto',
            onComplete: () => {
              el.classList.remove('is-card-hidden');
            },
          });
        },
      });
    });
  });
}

/* -----------------------------------------------------------
   PARALLAX VISUALS — subtle y-translate on scroll
   ----------------------------------------------------------- */
function parallaxMedia() {
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    const amount = parseFloat(el.dataset.parallax) || 60;
    gsap.to(el, {
      y: -amount,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });
}

/* -----------------------------------------------------------
   FOOTER "big" text — scroll reveal
   ----------------------------------------------------------- */
function footerReveal() {
  const big = document.querySelector('.footer .big');
  if (!big) return;
  const split = splitTextSafe(big);

  if (split) {
    gsap.set(split.lines, { y: '1.1em' });
    gsap.set(split.words, { y: '118%', opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.footer',
        start: 'top 80%',
        invalidateOnRefresh: true,
      },
      onComplete: () => {
        big.classList.remove('split-hidden');
      },
    });

    tl.to(
      split.lines,
      {
        y: 0,
        duration: 0.9,
        stagger: 0.06,
        ease: 'power3.out',
      },
      0
    ).to(
      split.words,
      {
        y: 0,
        opacity: 1,
        stagger: 0.05,
        duration: 0.9,
        ease: 'expo.out',
      },
      0.02
    );
  } else {
    gsap.fromTo(
      big,
      { y: 40, marginTop: '0.8rem', opacity: 0 },
      {
        y: 0,
        marginTop: 0,
        opacity: 1,
        duration: 0.9,
        ease: 'expo.out',
        clearProps: 'transform,marginTop,opacity',
        scrollTrigger: {
          trigger: '.footer',
          start: 'top 80%',
          invalidateOnRefresh: true,
        },
      }
    );
  }
}

/* -----------------------------------------------------------
   INIT
   ----------------------------------------------------------- */
window.addEventListener('load', () => {
  setupNav();
  let animationSuiteStarted = false;
  let initSafetyTimer = null;

  const runAnimationSuite = () => {
    runSafe('heroReveal', heroReveal);
    runSafe('splitHeadings', splitHeadings);
    runSafe('genericReveal', genericReveal);
    runSafe('processReveal', processReveal);
    runSafe('processScrub', processScrub);
    runSafe('cardsReveal', cardsReveal);
    runSafe('parallaxMedia', parallaxMedia);
    runSafe('footerReveal', footerReveal);
    runSafe('marqueeInit', marqueeInit);
    runSafe('marqueeOnScroll', marqueeOnScroll);
    runSafe('homeCarousel', homeCarousel);
    runSafe('testimonialScrub', testimonialScrub);
    runSafe('ctaScrub', ctaScrub);
    runSafe('microInteractions', microInteractions);
    ScrollTrigger.refresh();
  };

  const startAnimationSuite = () => {
    waitForFontsReady()
      .then((fontState) => {
        if (fontState === 'timeout') {
          console.warn('[animations] font readiness timed out; continuing with fallback-safe reveal');
        }
        runAnimationSuite();
      })
      .catch((error) => {
        console.warn('[animations] font readiness check failed; continuing', error);
        runAnimationSuite();
      })
      .finally(() => {
        if (initSafetyTimer) {
          window.clearTimeout(initSafetyTimer);
          initSafetyTimer = null;
        }
      });
  };

  const startAnimationSuiteOnce = () => {
    if (animationSuiteStarted) return;
    animationSuiteStarted = true;
    startAnimationSuite();
  };

  initSafetyTimer = window.setTimeout(() => {
    if (animationSuiteStarted) return;
    console.warn('[animations] global init safety timeout reached; forcing startup');
    const reveal = document.querySelector('.page-reveal');
    const brand = document.querySelector('.page-reveal__brand');
    if (reveal) reveal.remove();
    if (brand) brand.remove();
    if (lenis) lenis.start();
    startAnimationSuiteOnce();
  }, 9000);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    console.info('[animations] prefers-reduced-motion detected; running motion-safe init without page reveal');
    const reveal = document.querySelector('.page-reveal');
    const brand = document.querySelector('.page-reveal__brand');
    if (reveal) reveal.remove();
    if (brand) brand.remove();
    startAnimationSuiteOnce();
    return;
  }

  pageReveal()
    .then(() => {
      startAnimationSuiteOnce();
    })
    .catch((error) => {
      console.error('[animations] pageReveal failed, running fallback init', error);
      startAnimationSuiteOnce();
    });
});
