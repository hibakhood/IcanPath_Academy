/* ==========================================================================
   ICANPATH Academy — site behaviour
   Vanilla ES2018. No jQuery, no Owl Carousel, no WOW.js, no Magnific Popup.

   Replaces the previous stack:
     jquery-1.12.4  ->  native DOM APIs
     owl.carousel   ->  CSS scroll-snap + native <details>
     wow.min.js     ->  IntersectionObserver
     magnific-popup ->  click-to-load video facade
     jquery.inview  ->  IntersectionObserver
     scrolltopcontrol -> CSS

   --------------------------------------------------------------------------
   CONFIG — edit this block to change site-wide data. Contact details live in
   the HTML so they stay crawlable and copy-editable.
   ========================================================================== */

const SITE = {
  /* ICAN exam diets. Add future diets here, newest last, as ISO dates.
     The countdown auto-selects the next one that has not yet passed.
     Times are Nigeria time (WAT, UTC+1). */
  diets: [
    { name: 'November 2026', date: '2026-11-02T08:00:00+01:00' },
    { name: 'March 2027',     date: '2027-03-01T08:00:00+01:00' },
    { name: 'September 2027', date: '2027-09-01T08:00:00+01:00' },
    { name: 'November 2027',  date: '2027-11-01T08:00:00+01:00' }
  ]
};

(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Signals that JS is running, so CSS can safely hide things. */
  document.documentElement.classList.add('js');

  /* ==========================================================================
     1  STICKY HEADER SHADOW
     ========================================================================== */

  const initHeader = () => {
    const header = $('.site-header');
    if (!header) return;

    let ticking = false;
    const update = () => {
      header.classList.toggle('is-stuck', window.scrollY > 8);
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });

    update();
  };

  /* ==========================================================================
     2  MOBILE NAVIGATION DRAWER
     Accessible: aria-expanded, focus trap, Escape to close, scroll lock.
     ========================================================================== */

  const initNav = () => {
    const toggle  = $('.nav-toggle');
    const drawer  = $('.nav-mobile');
    const scrim   = $('.nav-scrim');
    const closeBtn = $('.nav-mobile__close');
    if (!toggle || !drawer) return;

    let lastFocused = null;

    const focusable = () => $$(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      drawer
    ).filter(el => el.offsetParent !== null);

    const open = () => {
      lastFocused = document.activeElement;
      drawer.classList.add('is-open');
      if (scrim) scrim.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('is-locked');
      const first = focusable()[0];
      if (first) first.focus();
      document.addEventListener('keydown', onKeydown);
    };

    const close = () => {
      drawer.classList.remove('is-open');
      if (scrim) scrim.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('is-locked');
      document.removeEventListener('keydown', onKeydown);
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;

      const first = items[0];
      const last  = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    toggle.addEventListener('click', () => {
      drawer.classList.contains('is-open') ? close() : open();
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (scrim)  scrim.addEventListener('click', close);

    /* Close on navigation so the new page starts at the top. */
    $$('a', drawer).forEach(a => a.addEventListener('click', close));

    /* Reset state if the viewport grows past the mobile breakpoint. */
    const desktop = window.matchMedia('(min-width: 992px)');
    desktop.addEventListener('change', e => { if (e.matches) close(); });

    /* Accordion sub-menus inside the drawer. */
    $$('.top-link[aria-expanded]', drawer).forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = document.getElementById(btn.getAttribute('aria-controls'));
        if (!panel) return;
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        panel.classList.toggle('is-open', !expanded);
      });
    });
  };

  /* ==========================================================================
     3  SCROLL REVEAL
     ========================================================================== */

  const initReveal = () => {
    const items = $$('[data-reveal]');
    if (!items.length) return;

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-revealed'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const delay = Number(entry.target.dataset.reveal) || 0;
        setTimeout(() => entry.target.classList.add('is-revealed'), delay * 70);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    items.forEach(el => io.observe(el));
  };

  /* ==========================================================================
     4  ANIMATED COUNTERS
     Reads the target from data-count so the markup stays readable.
     ========================================================================== */

  const initCounters = () => {
    const counters = $$('[data-count]');
    if (!counters.length) return;

    const run = (el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target)) return;

      if (reduceMotion.matches) {
        el.textContent = target.toLocaleString('en-NG');
        return;
      }

      const duration = 1400;
      const start = performance.now();

      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        /* easeOutExpo — fast start, gentle settle. */
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = Math.round(target * eased).toLocaleString('en-NG');
        if (p < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
      counters.forEach(run);
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.5 });

    counters.forEach(el => io.observe(el));
  };

  /* ==========================================================================
     5  ICAN DIET COUNTDOWN
     ========================================================================== */

  const initCountdown = () => {
    const root = $('[data-diet]');
    if (!root) return;

    const now = new Date();
    const upcoming = SITE.diets
      .map(d => ({ ...d, at: new Date(d.date) }))
      .filter(d => !Number.isNaN(d.at.getTime()) && d.at > now)
      .sort((a, b) => a.at - b.at)[0];

    const nameEl = $('[data-diet-name]', root);

    /* No future diet configured — degrade gracefully, never show 00:00:00:00. */
    if (!upcoming) {
      if (nameEl) nameEl.textContent = 'Dates to be announced';
      const cells = $$('[data-diet-cell]', root);
      cells.forEach(c => { c.textContent = '—'; });
      const foot = $('[data-diet-foot]', root);
      if (foot) foot.textContent = "Contact us to ask about upcoming exam dates.";
      return;
    }

    if (nameEl) nameEl.textContent = upcoming.name;

    const cells = {
      d: $('[data-diet-cell="days"]',    root),
      h: $('[data-diet-cell="hours"]',   root),
      m: $('[data-diet-cell="minutes"]', root),
      s: $('[data-diet-cell="seconds"]', root)
    };

    const pad = (n) => String(n).padStart(2, '0');

    const render = () => {
      const diff = upcoming.at - Date.now();
      if (diff <= 0) {
        Object.values(cells).forEach(c => { if (c) c.textContent = '00'; });
        return;
      }
      const secs = Math.floor(diff / 1000);
      if (cells.d) cells.d.textContent = pad(Math.floor(secs / 86400));
      if (cells.h) cells.h.textContent = pad(Math.floor(secs % 86400 / 3600));
      if (cells.m) cells.m.textContent = pad(Math.floor(secs % 3600 / 60));
      if (cells.s) cells.s.textContent = pad(secs % 60);
    };

    render();
    /* 1s interval is fine here; the tab is throttled when backgrounded anyway. */
    setInterval(render, 1000);
  };

  /* ==========================================================================
     6  COURSE FILTERING
     Pure client-side, no dependencies. Filters are AND-combined.
     ========================================================================== */

  const initFilters = () => {
    const form = $('[data-filter-form]');
    if (!form) return;

    const items    = $$('[data-course]', form.parentElement);
    const countEl  = $('[data-result-count]');
    const emptyEl  = $('[data-empty]');
    const controls = $$('[data-filter]', form);

    const apply = () => {
      const active = {};
      controls.forEach(c => {
        if (!c.value) return;
        (active[c.dataset.filter] ||= []).push(c.value);
      });

      let visible = 0;

      items.forEach(item => {
        const level   = (item.dataset.level   || '').split(' ');
        const plan    = (item.dataset.plan    || '').split(' ');
        const format  = (item.dataset.format  || '').split(' ');
        const free    = item.dataset.free === 'true';

        const matches =
          Object.entries(active).every(([key, vals]) => {
            if (key === 'price') return free ? vals.includes('free') : vals.includes('paid');
            const bag = { level, plan, format }[key] || [];
            return vals.some(v => bag.includes(v));
          });

        item.classList.toggle('is-hidden', !matches);
        if (matches) visible++;
      });

      if (countEl) {
        countEl.textContent = `${visible} ${visible === 1 ? 'course' : 'courses'} available`;
      }
      if (emptyEl) emptyEl.classList.toggle('is-hidden', visible > 0);
    };

    const clearAll = () => {
      controls.forEach(c => { c.value = ''; });
      apply();
      // drop the query string so a cleared filter does not linger in history
      history.replaceState(null, '', location.pathname);
    };

    /* Deep links:  course.html?level=foundation&plan=premium
       Every level CTA across the site links this way, so the incoming query
       has to preselect the matching controls before the first paint.        */
    const incoming = new URLSearchParams(location.search);
    controls.forEach(c => {
      const want = incoming.get(c.dataset.filter);
      if (!want) return;
      const values = want.split(',').map(v => v.trim()).filter(Boolean);
      const allowed = $$('option', c).map(o => o.value);
      if (values.every(v => allowed.includes(v))) c.value = values[0];
    });

    /* Keep the address bar in step so a filtered view can be copied or shared */
    const syncUrl = () => {
      const params = new URLSearchParams();
      controls.forEach(c => { if (c.value) params.set(c.dataset.filter, c.value); });
      const qs = params.toString();
      history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
    };

    form.addEventListener('change', () => { apply(); syncUrl(); });
    form.addEventListener('submit', e => e.preventDefault());

    // two clear affordances: inside the panel and in the results header
    $$('[data-filter-reset], [data-filter-clear]').forEach(btn => {
      btn.addEventListener('click', clearAll);
    });

    apply();
    syncUrl();
  };

  /* ==========================================================================
     7  FORM VALIDATION
     Replaces the old `onsubmit="return validation()"` which called a
     function that did not exist anywhere in the project.
     ========================================================================== */

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE = /^[+()\d][\d\s()-]{6,}$/;

  const initForms = () => {
    $$('[data-validate]').forEach(form => {
      const status = $('[data-form-status]', form);

      const showStatus = (type, msg) => {
        if (!status) return;
        status.className = `form-status is-visible form-status--${type}`;
        status.textContent = msg;
      };

      const validateField = (field) => {
        const wrap = field.closest('.field');
        const value = field.value.trim();
        let ok = true;

        /* required checkbox (the consent tick) has no value to be empty */
        if (field.type === 'checkbox') ok = !field.required || field.checked;
        else {
          if (field.required && !value) ok = false;
          if (ok && value && field.type === 'email' && !EMAIL.test(value)) ok = false;
          if (ok && value && field.type === 'tel' && !PHONE.test(value)) ok = false;
        }

        if (wrap) wrap.classList.toggle('has-error', !ok);
        field.setAttribute('aria-invalid', ok ? 'false' : 'true');
        return ok;
      };

      const fields = $$('input, select, textarea', form)
        .filter(f => !['hidden', 'submit', 'button', 'reset'].includes(f.type));

      fields.forEach(f => {
        const revalidate = () => validateField(f);
        f.addEventListener('blur', revalidate);
        f.addEventListener('input', revalidate);
        f.addEventListener('change', revalidate);   // checkboxes only fire this
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        /* Honeypot: a bot filled a field humans cannot see. Pretend it worked. */
        const honeypot = form.querySelector('input[name="company_website"]');
        if (honeypot && honeypot.value) { form.reset(); return; }

        const invalid = fields.filter(f => !validateField(f));
        if (invalid.length) {
          showStatus('err', 'Please correct the highlighted fields and try again.');
          invalid[0].focus();
          return;
        }

        const submit = $('[type="submit"]', form);
        const original = submit ? submit.innerHTML : '';
        if (submit) { submit.disabled = true; submit.innerHTML = 'Sending…'; }

        try {
          const res = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
          });

          const receipt = await res.json();
          if (!res.ok || !receipt.ok) throw new Error(receipt.message || 'Request failed');

          form.reset();
          showStatus('ok', receipt.message || "Thank you. We have received your message.");
          toast(receipt.message || 'Enquiry received.', 'ok');
        } catch (err) {
          showStatus('err', "We could not send your message. Try again in a moment or email us directly.");
          toast('Could not send your message.', 'err');
        } finally {
          if (submit) { submit.disabled = false; submit.innerHTML = original; }
        }
      });
    });
  };

  /* ==========================================================================
     8  VIDEO FACADE
     Click-to-load. No third-party iframe until the user asks for it, which
     keeps ~1MB of YouTube JS off the initial page load.
     ========================================================================== */

  const initVideoFacades = () => {
    $$('[data-video]').forEach(facade => {
      const load = () => {
        const src = facade.dataset.video;
        if (!src) return;

        const frame = document.createElement('iframe');
        frame.src = src;
        frame.title = facade.dataset.videoTitle || 'Video player';
        frame.loading = 'lazy';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';

        facade.replaceChildren(frame);
        facade.style.pointerEvents = 'auto';
        /* hand focus to the player so keyboard users are not stranded */
        frame.focus();
      };

      facade.addEventListener('click', (e) => {
        if (e.target.closest('a')) return; /* let real links through */
        load();
      });

      /* the facade is a div[role=button][tabindex=0], so it owes the user
         Enter and Space as well as a click */
      facade.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        load();
      });
    });
  };

  /* ==========================================================================
     9  TOAST
     ========================================================================== */

  let toastEl = null;
  let toastTimer = null;

  function toast(message, kind = 'ok') {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }

    clearTimeout(toastTimer);
    toastEl.className = `toast is-visible toast--${kind}`;
    toastEl.textContent = message;

    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 5000);
  }

  /* ==========================================================================
     10  BOOTSTRAP COMPONENT ENHANCEMENTS
     Bootstrap 5 has no jQuery dependency, but it needs its data-API to be
     initialised. We only use Collapse / Tab, so the non-bundle build is fine.
     ========================================================================== */

  const initBootstrap = () => {
    if (typeof window.bootstrap === 'undefined') return;

    /* Auto-collapse the mobile drawer if a nested accordion is opened. */
    $$('[data-bs-toggle="collapse"]').forEach(btn => {
      btn.addEventListener('shown.bs.collapse', () => {
        const drawer = btn.closest('.nav-mobile');
        if (drawer && window.innerWidth < 992) {
          drawer.dispatchEvent(new CustomEvent('drawer:keep-open', { bubbles: false }));
        }
      });
    });
  };

  /* ==========================================================================
     BOOT
     ========================================================================== */

  const boot = () => {
    initHeader();
    initNav();
    initCountdown();
    initFilters();
    initForms();
    initVideoFacades();
    initCounters();
    initReveal();
    initBootstrap();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

/* Scrub the supplied portrait instead of relying on unsupported reverse playback. */
(() => {
  const video = document.querySelector('[data-hero-video]');
  const hero = video?.closest('.hero');
  if (!video || !hero) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let target = 0, frame = 0, ready = false, previousTime = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(tick); };
  const tick = timestamp => {
    frame = 0;
    if (!ready || reduced.matches) { previousTime = 0; return; }
    const elapsed = previousTime ? Math.min((timestamp - previousTime) / 1000, .05) : 1 / 60;
    previousTime = timestamp;
    const difference = target - video.currentTime;
    if (Math.abs(difference) < .018) { previousTime = 0; return; }
    if (!video.seeking) {
      // Frame-rate independent damping plus a speed limit gives the turn weight.
      const easedStep = difference * (1 - Math.exp(-elapsed / .9));
      const limit = video.duration * .18 * elapsed;
      video.currentTime += Math.max(-limit, Math.min(limit, easedStep));
    }
    schedule();
  };
  const initialize = () => {
    ready = Number.isFinite(video.duration) && video.duration > 0;
    if (!ready) return;
    target = video.duration / 2;
    video.currentTime = target;
    video.pause();
  };
  video.addEventListener('loadedmetadata', initialize);
  if (video.readyState >= 1) initialize();
  hero.addEventListener('pointermove', event => {
    if (!ready || reduced.matches || event.pointerType !== 'mouse') return;
    const rect = hero.getBoundingClientRect();
    const horizontal = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    // Left advances the timeline; right reverses it. Avoid seeking beyond the final frame.
    const rotation = horizontal * horizontal * (3 - 2 * horizontal);
    target = (.1 + (1 - rotation) * .8) * Math.max(0, video.duration - .04);
    schedule();
  }, {passive:true});
})();
