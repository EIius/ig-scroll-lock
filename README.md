# IG DM Scroll Lock

Stops Instagram web DMs from yanking the chat to the bottom every time you reply
while you're scrolled up reading older messages.

Ships in two forms with identical logic:

| File | For |
|---|---|
| `ig-scroll-lock.user.js` | Safari (or any browser) via a userscript manager |
| `manifest.json` + `content.js` | Chrome, loaded as an unpacked MV3 extension |

## Why Instagram jumps to the bottom

The DM message list is a `flex-direction: column-reverse` container, which means
`scrollTop: 0` **is** the bottom and scrolling up produces *negative* `scrollTop`
values. Two separate mechanisms cause the jump (verified live against
instagram.com, July 2026):

1. **`scrollTo(0)` on the pane** — Instagram's code explicitly scrolls to the
   bottom after a message is sent or received.
2. **React pane rebuilds** — sometimes the entire scroll container is thrown
   away and re-created. A fresh element starts at `scrollTop 0` (= bottom)
   without any scroll call at all, so intercepting scroll APIs alone can't
   catch it.
3. **Native focus scrolling** — when Instagram refocuses the composer after a
   send, the browser itself can scroll the pane to the bottom. No JS scroll
   API is involved at all; the only observable is the resulting scroll event.

## How the fix works

- While you're scrolled up more than 150 px (`scrollTop < -150`), programmatic
  jumps toward the bottom (`scrollTo`/`scroll`/`scrollBy`/`scrollTop`/
  `scrollIntoView`) on the chat pane are swallowed.
- Your reading position is tracked from real scroll events, and if React
  rebuilds the pane you're put back within ~150 ms.
- A downward move only becomes your new tracked position if there was real
  wheel/touch/drag input in the previous 400 ms; any other downward motion
  (like native focus scrolling) is undone on the scroll event itself.
- Your own scrolling (wheel, trackpad, scrollbar, keys) is native browser
  behavior and never passes through the patched JS entry points, so it's never
  affected. Near the bottom, everything behaves like stock Instagram.
- Opening a thread still lands on the newest message. Only switching to a
  *different* thread (`/direct/t/<id>`) resets the saved position — detours to
  posts, reels, or the inbox keep it, so returning to the same thread puts you
  back where you were.

## Install

**Safari:** install [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
from the Mac App Store, enable it in Safari Settings → Extensions and allow it on
instagram.com, then add `ig-scroll-lock.user.js` in its editor. Reload Instagram.

**Chrome:** open `chrome://extensions`, enable Developer mode, *Load unpacked*,
select this folder. Reload Instagram.

## Usage

Nothing to do — it only kicks in while you're scrolled up in a DM thread.

- **Ctrl+Shift+L** toggles the guard (a toast confirms ON/OFF).
- `igScrollLock()` in the console does the same.
- Heads-up: Instagram's "jump to newest" arrow uses the same call being blocked,
  so while scrolled up just fling-scroll to the bottom instead.

## Caveats

Instagram ships new frontend code constantly; the pane detection
(wide + scrollable + `column-reverse`) is deliberately generic, but a future
redesign could still break it. If the chat starts jumping again, that's what
happened.
