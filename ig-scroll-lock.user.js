// ==UserScript==
// @name         IG DM Scroll Lock
// @description  Stops Instagram web DMs from yanking you to the bottom while you're reading older messages. Ctrl+Shift+L toggles it.
// @version      4.0
// @match        https://www.instagram.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

// Verified against Instagram web (July 2026). The DM message list is a
// flex-direction: column-reverse container, so scrollTop 0 IS the bottom and
// "scrolled up" means a negative scrollTop. Three things yank you down on reply:
//   1. Instagram calls scrollTo(0) on the pane        -> blocked while reading up.
//   2. React sometimes rebuilds the pane; a fresh element starts at
//      scrollTop 0 (= bottom) with no scroll call     -> position restored ~150ms.
//   3. The browser natively scrolls the refocused composer into view — no JS
//      call at all, only a scroll event               -> undone on the event
//      itself: a downward move only counts as the user's if there was real
//      wheel/touch/drag input within the last 400ms.
// The saved position survives detours to posts/reels/inbox; only opening a
// DIFFERENT /direct/t/<id> thread resets it. Ctrl+Shift+L toggles the guard.

(() => {
  if (window.__igFix4) return;
  const olds = [window.__igFix, window.__igFix3].filter(Boolean);
  olds.forEach((o) => { o.enabled = false; }); // retire earlier layers

  const NEAR = 150;    // scrollTop below -150px counts as "reading older messages"
  const USER_MS = 400; // real input within this window legitimizes a downward move
  const st = { enabled: true, saved: 0, pane: null, thread: null, lastUser: 0, log: [] };
  window.__igFix4 = st;

  const note = (m) => { st.log.push([Date.now(), m]); if (st.log.length > 80) st.log.shift(); };

  const stDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  const getST = (el) => stDesc.get.call(el);
  const setST = (el, v) => stDesc.set.call(el, v);

  const isChatPane = (el) =>
    el instanceof Element &&
    el.clientWidth > 500 &&
    el.scrollHeight > el.clientHeight + 40 &&
    getComputedStyle(el).flexDirection === 'column-reverse';

  const readingUp = () => st.saved < -NEAR;
  const userActive = () => Date.now() - st.lastUser < USER_MS;

  ['wheel', 'touchmove', 'mousedown'].forEach((n) =>
    addEventListener(n, () => { st.lastUser = Date.now(); }, { capture: true, passive: true }));
  addEventListener('mousemove', (e) => {
    if (e.buttons) st.lastUser = Date.now(); // scrollbar drag
  }, { capture: true, passive: true });

  // Block programmatic jumps toward the bottom while reading up.
  const block = (el, top) =>
    st.enabled && readingUp() && isChatPane(el) &&
    (top === undefined || top > st.saved + 1);

  ['scrollTo', 'scroll', 'scrollBy'].forEach((name) => {
    const orig = Element.prototype[name];
    Element.prototype[name] = function (...a) {
      let top = typeof a[0] === 'object' && a[0] !== null ? a[0].top : a[1];
      if (name === 'scrollBy' && typeof top === 'number') top = getST(this) + top;
      if (block(this, typeof top === 'number' ? top : undefined)) { note('blocked ' + name); return; }
      return orig.apply(this, a);
    };
  });

  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get() { return stDesc.get.call(this); },
    set(v) {
      if (block(this, v)) { note('blocked scrollTop=' + Math.round(v)); return; }
      stDesc.set.call(this, v);
    }
  });

  const origSIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...a) {
    let p = this.parentElement;
    while (p && !isChatPane(p)) p = p.parentElement;
    if (p && st.enabled && readingUp()) { note('blocked scrollIntoView'); return; }
    return origSIV.apply(this, a);
  };

  // Position tracking. A downward move only becomes the new saved position if
  // the user actually produced input recently; otherwise it's a native yank
  // (e.g. Safari scrolling the refocused composer into view) and is undone.
  const onScroll = () => {
    if (!st.pane) return;
    const cur = getST(st.pane);
    if (!st.enabled || !readingUp() || cur <= st.saved + 1 || userActive()) {
      st.saved = cur;
      return;
    }
    note('snapback ' + Math.round(cur) + ' -> ' + Math.round(st.saved));
    setST(st.pane, st.saved);
  };

  setInterval(() => {
    // Only a genuine thread switch forgets the position; detours through
    // posts, reels, or the inbox keep it so returning restores your spot.
    const tid = (location.pathname.match(/\/direct\/t\/([^/]+)/) || [])[1] || null;
    if (tid && tid !== st.thread) {
      st.thread = tid;
      st.saved = 0;
      if (st.pane) st.pane.removeEventListener('scroll', onScroll);
      st.pane = null;
    }
    if (!tid) return;

    if (!st.pane || !st.pane.isConnected) {
      let found = null;
      document.querySelectorAll('div').forEach((e) => { if (isChatPane(e)) found = e; });
      if (st.pane) st.pane.removeEventListener('scroll', onScroll);
      st.pane = found;
      if (found) {
        found.addEventListener('scroll', onScroll, { passive: true });
        if (st.enabled && readingUp()) {
          note('remount restore -> ' + Math.round(st.saved));
          setST(found, st.saved);
        }
      }
    } else if (st.enabled && readingUp() && !userActive()) {
      const cur = getST(st.pane);
      if (cur > st.saved + 120) {
        note('drift restore ' + Math.round(cur) + ' -> ' + Math.round(st.saved));
        setST(st.pane, st.saved);
      }
    }
  }, 150);

  window.igScrollLock = (on) => {
    st.enabled = on ?? !st.enabled;
    toast('IG scroll lock ' + (st.enabled ? 'ON' : 'OFF'));
    return 'IG scroll lock ' + (st.enabled ? 'ON' : 'OFF');
  };
  if (olds.length === 0) {
    addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') window.igScrollLock();
    }, true);
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#262626;color:#fff;padding:8px 16px;border-radius:8px;' +
      'font:13px system-ui;z-index:999999;pointer-events:none;opacity:.95';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }

})();
