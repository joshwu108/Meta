# Weave Design System — Meta-aligned theme

**Applies to:** every screen in workstreams 01–06. Workstream 01 ships the tokens and primitives; everyone else consumes them.
**Why this direction:** the hackathon track is sponsored by Meta ("Bringing People Closer Together with AI"). The product should feel at home next to Facebook, Messenger, and Meta AI: familiar surfaces, Meta blue for primary actions, and the Meta AI gradient reserved for anything the AI produced. Familiarity lowers the barrier for judges and for users who already live in Meta apps.

**Boundary:** Weave is *inspired by* Meta's visual language, not branded as Meta. Do not use the Meta or Facebook logos, wordmarks, the infinity mark, or copy that implies the product is made by Meta. Meta's proprietary typeface (Optimistic) is not available, so the system font stack Facebook itself ships is used instead.

---

## 1. Color tokens (`src/styles/tokens.css`)

Light is the default. Dark mode is supported through the same tokens (Meta apps are dark-mode first-class; the toggle is a P1 UI item, but tokens ship in P0 so nothing hardcodes a color).

```css
:root {
  /* Canvas and surfaces — Facebook's light palette */
  --color-canvas:        #F0F2F5;   /* page background */
  --color-surface:       #FFFFFF;   /* cards, sheets, nav */
  --color-surface-2:     #F7F8FA;   /* inset panels, table stripes */
  --color-hover:         #F2F2F2;
  --color-pressed:       #E4E6EB;
  --color-divider:       #CED0D4;
  --color-border-subtle: #E4E6EB;

  /* Text */
  --color-text:          #050505;
  --color-text-2:        #65676B;   /* secondary, metadata */
  --color-text-3:        #8A8D91;   /* placeholders, disabled */
  --color-text-on-brand: #FFFFFF;

  /* Brand — Meta blue */
  --color-brand:         #0866FF;   /* primary buttons, links, active nav, focus ring */
  --color-brand-hover:   #0A5BE0;
  --color-brand-pressed: #0953CC;
  --color-brand-soft:    #E7F0FF;   /* selected chips, info surfaces */
  --color-brand-soft-2:  #D0E2FF;

  /* Semantic */
  --color-success:       #31A24C;
  --color-success-soft:  #E6F4EA;
  --color-warning:       #F7B928;
  --color-warning-soft:  #FFF4D6;
  --color-warning-ink:   #8A5A00;   /* text on --color-warning-soft (#F7B928 fails AA there) */
  --color-danger:        #E41E3F;
  --color-danger-soft:   #FDE8EC;

  /* Meta AI gradient — reserved for AI-generated content markers only */
  --gradient-ai:         linear-gradient(135deg, #0866FF 0%, #6A5CFF 45%, #D946EF 75%, #FF6B6B 100%);
  --gradient-ai-soft:    linear-gradient(135deg, #E7F0FF 0%, #EEEBFF 50%, #FBE7FA 100%);
  --color-ai-ink:        #4B3DD6;   /* text on --gradient-ai-soft */

  /* Elevation (Facebook card shadows are soft and short) */
  --shadow-1: 0 1px 2px rgba(0,0,0,.20);
  --shadow-2: 0 2px 8px rgba(0,0,0,.15);
  --shadow-3: 0 12px 28px rgba(0,0,0,.20), 0 2px 4px rgba(0,0,0,.10);

  /* Radius */
  --radius-sm: 6px;     /* chips, inputs */
  --radius-md: 8px;     /* cards, buttons */
  --radius-lg: 12px;    /* sheets, modals */
  --radius-pill: 999px; /* pills, avatars, segmented controls */

  /* Spacing (4-pt grid) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px;
  --space-section: clamp(24px, 2vw + 16px, 48px);

  /* Motion */
  --duration-fast: 120ms;
  --duration-normal: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

:root[data-theme="dark"],
:root:not([data-theme="light"]) { /* under @media (prefers-color-scheme: dark) */
  --color-canvas:        #18191A;
  --color-surface:       #242526;
  --color-surface-2:     #3A3B3C;
  --color-hover:         #3A3B3C;
  --color-pressed:       #4E4F50;
  --color-divider:       #3E4042;
  --color-border-subtle: #3E4042;
  --color-text:          #E4E6EB;
  --color-text-2:        #B0B3B8;
  --color-text-3:        #8A8D91;
  --color-brand:         #2D88FF;
  --color-brand-hover:   #4A9AFF;
  --color-brand-pressed: #1877F2;
  --color-brand-soft:    #263951;
  --color-brand-soft-2:  #2E4A6B;
  --color-success:       #45BD62;
  --color-success-soft:  #1F3A27;
  --color-warning:       #F7B928;
  --color-warning-soft:  #3D3416;
  --color-warning-ink:   #F7B928;
  --color-danger:        #F3425F;
  --color-danger-soft:   #3F1F26;
  --gradient-ai-soft:    linear-gradient(135deg, #1F2E4D 0%, #2A2650 50%, #3D1F3D 100%);
  --color-ai-ink:        #B3A7FF;
  --shadow-1: 0 1px 2px rgba(0,0,0,.45);
  --shadow-2: 0 2px 8px rgba(0,0,0,.40);
  --shadow-3: 0 12px 28px rgba(0,0,0,.55), 0 2px 4px rgba(0,0,0,.30);
}
```

Color is used **semantically**: blue means "you can act on this", green means confirmed (RSVP confirmed, event published), amber means needs attention (reconfirm, pending proposal), red means destructive or cancelled, and the AI gradient means "an AI produced this and it is a suggestion". No other decorative color.

Contrast: every text/background pair above meets WCAG AA (text-2 on surface is 4.6:1 light, 7.1:1 dark). Gradient is never used behind body text; it is used for rings, 2px borders, tags, and short bold labels on `--gradient-ai-soft` with `--color-ai-ink`.

## 2. Typography

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; /* same stack facebook.com ships */
  --text-xs:   .75rem;   /* 12 — metadata */
  --text-sm:   .8125rem; /* 13 — secondary */
  --text-base: .9375rem; /* 15 — body (Facebook body size) */
  --text-md:   1.0625rem;/* 17 — card titles */
  --text-lg:   1.25rem;  /* 20 — section headings */
  --text-xl:   1.5rem;   /* 24 — page titles */
  --text-2xl:  clamp(1.75rem, 1.2rem + 1.5vw, 2.25rem); /* hero / lead card */
  --leading-tight: 1.2; --leading-normal: 1.34; --leading-relaxed: 1.5;
  --weight-regular: 400; --weight-medium: 500; --weight-semibold: 600; --weight-bold: 700;
}
```

One family, hierarchy by size and weight only. Page titles 24/700, card titles 17/600, body 15/400, metadata 13/400 in `--color-text-2`. No serif, no display face. Letter-spacing stays default.

## 3. Layout

- **Canvas + cards:** page background `--color-canvas`; content lives on `--color-surface` cards with `--radius-md` and `--shadow-1`. Cards get `--shadow-2` on hover only when the whole card is clickable.
- **App frame (consumer):** 56px top bar on all widths (logo-free wordmark "Weave" in `--color-text`, search, notification bell, avatar). ≥1024px adds a 280px left rail with nav items (icon + label, active item in `--color-brand-soft` with blue icon), and a 320px right rail for contextual content (agent suggestions on Discover, filters on Events). Center column max 680px like the Facebook feed. <768px: bottom tab bar with 5 items (Discover, Match, Groups, Events, Agent); Activity lives behind the bell.
- **App frame (business):** same top bar; left rail always present ≥768px with Dashboard, Proposals (badge count), Events, Insights; center column max 960px for tables.
- **Hierarchy, not uniformity:** every page has one lead element (lead event card, pending proposal, planner) at `--text-2xl`/full-width; supporting items are compact. Avoid equal-weight grids.
- **Density:** list rows 56–72px, 16px card padding, 12px between cards, 24px between sections.
- Gutters 16px on mobile, no horizontal scroll at 320px.

## 4. Components (`src/features/core/components/ui/`)

| Component | Spec |
|---|---|
| `Button` | variants `primary` (blue fill, white text), `secondary` (`--color-pressed` fill, text), `ghost`, `danger`; 36px / 40px heights; `--radius-md`; hover darkens, active scales to .98; focus ring 2px `--color-brand` offset 2px |
| `Chip` | pill, `--color-surface-2` default, selected = `--color-brand-soft` + blue text, removable with ✕ (keyboard: Backspace) |
| `AiTag` | **the one AI marker**: pill with a 2px `--gradient-ai` border (via background-clip), soft gradient fill, `--color-ai-ink` text "AI suggestion" / "AI inferred" / "Estimate", and a small ring glyph. Used on: inferred preference chips (02), match explanations (03), planner suggestions (03), proposal cards (05), recommended events and follow-up cards (06) |
| `AiRing` | 2px gradient ring around an avatar or card corner marking the user's agent (02 chat header, Discover agent strip) |
| `Avatar` | circle, sizes 24/32/40/56; stacked avatars for "friends going" |
| `Card`, `CardHeader`, `CardFooter` | surface, radius-md, shadow-1, 16px padding |
| `Sheet` / `Modal` | radius-lg, shadow-3, backdrop rgba(255,255,255,.8) light / rgba(0,0,0,.6) dark |
| `Switch` | iOS-style; on = `--color-brand`; all consent toggles |
| `Tabs` | underline style, active underline 3px `--color-brand`, text `--color-brand` |
| `StatusPill` | maps status → color: published/confirmed green, pending/awaiting amber, cancelled red, draft gray, full blue-soft |
| `CapacityMeter` | thin bar, blue fill, turns amber ≥ 80%, red at full |
| `Toast` | bottom-left ≥768px, bottom on mobile, 4s |
| `EmptyState` | icon + one line + one action |

Hover, focus, and active states are specified for every component; keyboard focus is always visible.

## 5. Motion

Short and functional, Meta-style: 120ms color/opacity on hover, 200ms `--ease-standard` for sheets and tab underline, cards fade+rise 8px on first paint of a feed (staggered 30ms, max 6 items). Capacity meter animates width once on mount. All motion respects `prefers-reduced-motion`. Only `transform` and `opacity` animate.

## 6. Iconography and imagery

- Icons: Lucide, 20px in nav and buttons, 16px inline, stroke 1.75.
- Event and business imagery: 16:9 cover on cards, 2:1 on the lead card, `object-fit: cover`, gray `--color-pressed` placeholder with category icon when missing.
- No stock gradient blobs, no 3D illustrations.

## 7. Theme checklist (reviewed on every UI PR)

- [ ] No hex values outside `tokens.css`
- [ ] Primary actions are blue; the AI gradient appears only on `AiTag` / `AiRing`
- [ ] Both themes render (Playwright screenshots at 320 / 768 / 1024 / 1440 in light and dark)
- [ ] Contrast AA on all text
- [ ] One lead element per page; no equal-weight card grids
- [ ] No Meta/Facebook logos or wordmarks anywhere in the UI
