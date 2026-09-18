# Command Palette (⌘K)

**Status:** Shipped 2026-09-18.

## Problem

QA-Genius navigation is a fixed sidebar of 6 tabs — fine, but static compared to
the modern SaaS feel (Linear/Notion/Raycast-style ⌘K) the rest of the app aims for.
It's also the fastest, most visible piece of UX polish available: a recruiter
opening the live app and pressing ⌘K unprompted is a strong, immediate signal.

## Design

- `CommandPalette.tsx` — a generic, reusable overlay taking `items: CommandItem[]`
  (`{ id, label, description?, icon, keywords?, section, run() }`). Filtering is a
  simple case-insensitive substring match across label/description/keywords (no
  fuzzy-match library — the item count here is under a dozen, YAGNI). Items are
  grouped by `section` for display, preserving first-seen order.
- Mounted once inside `AppLayout` (not globally in `App.tsx`) so its items can call
  `selectTab`/`onLogout` directly instead of round-tripping through the existing
  `qa-genius:navigate-tab` window-event pattern used elsewhere for cross-component
  navigation.
- Items: the 6 workspace tabs (reusing `NAV_ITEMS`, so a new tab added to the
  sidebar automatically appears in the palette), "Source on GitHub", "Sign out".
- Keyboard: `⌘K`/`Ctrl+K` toggles it open from anywhere (global `keydown` listener
  in `AppLayout`, `preventDefault` to override the browser's own Ctrl+K/address-bar
  behavior — standard practice, same as GitHub/Linear/Notion). Inside: `↑`/`↓` to
  move selection, `Enter` to run, `Escape` to close.
- Discoverability: a visible "Search… ⌘K" pill in the desktop header, and a search
  icon button in the mobile header — a keyboard-only power feature nobody notices
  is a keyboard-only power feature nobody uses.

## Out of scope

- Fuzzy matching / scoring (substring match is enough at this item count).
- Deep-linking into a specific History item or Test Repository file from the
  palette — would need a richer command model; left for later if the item list
  grows enough to want it.
