---
name: worxmax
description: Nine connected workshop apps, presented as a fittings catalogue of numbered articles.
colors:
  yellow: "#F2C500"
  yellow-bright: "#FFD52E"
  yellow-soft: "#FFF3BF"
  olive-ink: "#3A3416"
  paper: "#FFFFFF"
  tray: "#F1F2F4"
  tray-deep: "#E6E8EB"
  ink: "#1E2124"
  ink-2: "#454B53"
  ink-3: "#646B74"
  rule: "#D8DCE0"
  rule-2: "#B4BAC2"
  steel: "#8D949D"
  ok: "#1E7F47"
  bad: "#B3261E"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(60px, 10vw, 96px)"
    fontWeight: 900
    lineHeight: 0.82
    letterSpacing: "-0.04em"
    fontVariation: "\"wdth\" 125"
  chapter-number:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(56px, 7.5vw, 96px)"
    fontWeight: 900
    lineHeight: 0.8
    letterSpacing: "-0.03em"
    fontVariation: "\"wdth\" 125"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(28px, 3.4vw, 46px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.02em"
    fontVariation: "\"wdth\" 115"
  headline-cover:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 3.6vw, 48px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.022em"
    fontVariation: "\"wdth\" 108"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.15
    fontVariation: "\"wdth\" 110"
  figure:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "60px"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.04em"
    fontVariation: "\"wdth\" 118"
    fontFeature: "\"tnum\""
  body:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "\"tnum\""
  lead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.07em"
    fontVariation: "\"wdth\" 112"
rounded:
  r: "2px"
  callout: "50%"
spacing:
  xs: "6px"
  sm: "12px"
  md: "18px"
  lg: "24px"
  gutter: "20px"
  section: "clamp(56px, 7vw, 96px)"
  container: "1240px"
  rail: "60px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "0 24px"
    height: "52px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.yellow-bright}"
  button-primary-on-yellow:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "0 24px"
    height: "52px"
  button-line:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "0 24px"
    height: "52px"
  button-line-hover:
    backgroundColor: "{colors.yellow-soft}"
  button-sm:
    padding: "0 16px"
    height: "42px"
  button-mini:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "0 13px"
    height: "36px"
  segment-selected:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    height: "36px"
  tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "3px 8px"
    typography: "{typography.label}"
  input:
    backgroundColor: "#FCFCFD"
    textColor: "{colors.ink}"
    rounded: "{rounded.r}"
    padding: "10px 12px"
    height: "48px"
  chapter-opener:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.ink}"
    padding: "26px 20px 24px"
  plate:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "18px"
  plan:
    backgroundColor: "{colors.paper}"
    padding: "24px"
  plan-featured:
    backgroundColor: "{colors.tray}"
---

# Design System: worxmax

## Overview

**Creative North Star: "The Fittings Catalogue"**

worxmax is shown the way a workshop already buys hinges and runners: a printed fittings catalogue. Coated white paper, graphite ink, steel-grey rules, and one signal yellow. The nine apps are articles WX-01 to WX-09, the live demo is "Fig. 1", chapters open on full-width yellow bands with a huge expanded-black number, and a thumb-index rail on the right edge lights the chapter in view. Facts sit in spec tables, prices are set like list prices, and every number is tabular.

Density is catalogue density: ruled rows, a lot of information per screen, held in order by heavy graphite rules and generous chapter breaks rather than by cards and whitespace. Hierarchy comes from Archivo's width axis and weight at committed scale, not from colour variety. The world rejects the SaaS hero-plus-feature-grid and the dark "industrial" costume; it also replaces an earlier cream-paper, blue-action look, which must not return.

The same world runs in the sign-in app (`app/index.html`) with restraint: grey tray page, white sheets with a 2px graphite outline, a thin yellow strip along the top edge, yellow only on the go button and selected tab.

**Key Characteristics:**
- One accent, signal yellow, reserved for what you press, what is selected, where you are, and chapter openers.
- Archivo variable throughout; the width axis (100% to 125%) carries the hierarchy.
- Graphite 2px rules for structure, 1px steel rules between rows, dashed rules for anything provisional.
- Near-square corners (2px) everywhere; circles only for numbered callouts and status dots.
- Catalogue apparatus as content: article numbers, Fig. numbers, spec tables, numbered callouts, plan-letter keys.

## Colors

A graphite-on-white catalogue palette with one signal yellow; everything else is a step of cool grey.

### Primary
- **Signal Yellow** (yellow): fills primary buttons, the selected segment or tab, the current header link underline, chapter-opener bands, the cover, the slider thumb, the focus halo, text selection, and the highlighted part in the demo drawings.
- **Lamp Yellow** (yellow-bright): hover state of every yellow fill. Never a resting colour.
- **Tissue Yellow** (yellow-soft): hover wash on outline buttons, rows, tabs and rail tabs; the highlighted row in the part list.
- **Olive Ink** (olive-ink): secondary text set on yellow (chapter-opener sentences, cover subline, results labels). Use it instead of ink-2 whenever text sits on yellow. It lives as a literal in the CSS today; treat it as this token.

### Neutral
- **Coated Paper** (paper): page background and every sheet-like surface: plates, plan cells, inputs on a sheet, the sign-in cards.
- **Tray Grey** (tray): the second surface: the demo's output column, the featured plan, the comparison band, sticky table heads, status notes; the sign-in app's page.
- **Deep Tray** (tray-deep): the thumb-index rail body and empty progress tracks.
- **Graphite** (ink): text, every structural rule, outlines of pressables, tags, dark buttons, the selected rail tab.
- **Graphite 2** (ink-2): secondary text, nav links at rest, descriptions under article names.
- **Graphite 3** (ink-3): tertiary text: article numbers, column labels, fine print.
- **Hairline** (rule): 1px dividers between rows inside a ruled list or table.
- **Steel Rule** (rule-2): input outlines, dashed provisional rules, inner panel outlines, row dividers on tray.
- **Steel** (steel): unavailable plan letters; the coldest grey, used only for "not included".

### Signal
- **Done Green** (ok): the "Live" indicator and finished progress steps.
- **Fault Red** (bad): form and sign-in error messages only.

### Named Rules
**The Pressable Yellow Rule.** Yellow means you can press it, it is selected, or it marks where you are; the only large yellow fields are chapter openers, the cover and the one computed result (the savings panel). Never yellow for decoration, illustration or emphasis of plain text.

**The Yellow Flip Rule.** On a yellow surface the primary button turns graphite with white text, and outline buttons go transparent with a graphite border. Yellow never sits on yellow.

**The One Accent Rule.** There is no secondary brand colour. Green and red are signals, not palette.

## Typography

**Display Font:** Archivo variable, self-hosted (wght 100 to 900, wdth 62% to 125%), with system-ui fallback
**Body Font:** Archivo at normal width
**Label/Mono Font:** none; labels are Archivo slightly expanded and uppercase

**Character:** One grotesque doing every job. Expanded black reads as catalogue headings and part numbers; normal width reads as plain instructions.

### Hierarchy
- **Display** (900, wdth 125%, clamp(60px, 10vw, 96px), 0.82): the "worxmax" wordmark on the cover only.
- **Chapter number** (900, wdth 125%, clamp(56px, 7.5vw, 96px), 0.8): the chapter numeral in each yellow opener. Stage numbers in catalogue rows use the same face at 1.9em.
- **Headline** (800, wdth 115%, clamp(28px, 3.4vw, 46px), 1.02, balanced): chapter titles in openers and the closing band.
- **Cover headline** (800, wdth 108%, clamp(30px, 3.6vw, 48px), 1.04, max 20ch): the cover's one sentence.
- **Title** (800, wdth 108 to 122%, 19 to 26px): article names (19 to 20px, 110%), job-stage heads (24px, 118%), plan names (26px, 122%).
- **Figure** (900, wdth 118 to 125%, 60px, 0.95): prices and the savings result; tabular.
- **Body** (400, 17px, 1.55): reading text; legal text at max 72ch, answers at 66ch. **Lead** (19px) for page intros, max 62ch.
- **Label** (800, wdth 112%, 11 to 13px, 0.05 to 0.07em, uppercase): column heads, spec-table captions, group heads, panel and plan sub-heads, tags.

### Named Rules
**The Width Axis Rule.** Hierarchy is set with font-stretch, not with a second family: 125% for numerals and the wordmark, 108 to 122% for heads, 100% for reading. Never introduce another face.

**The Tabular Rule.** Tabular figures are on for the whole body. Every price, size and count lines up.

**The Label Placement Rule.** Uppercase labels head columns, tables and panels. They never sit above a headline as an eyebrow.

## Layout

A single 1240px column with 20px side gutters (safe-area aware). From 1180px the fixed thumb-index rail (60px wide) docks to the right edge and the column's right padding grows by the rail width plus 28px so nothing slides under it. Sections breathe at clamp(56px, 7vw, 96px); a section straight after a chapter opener starts tighter, clamp(32px, 4vw, 52px).

Chapter openers are a three-column grid (numeral, title, sentence) aligned to the baseline end; below 860px the sentence drops to a full row. The cover is a 1.55 : 1 grid of message and spec table. The demo plate overlaps the cover by 96px, so Fig. 1 starts above the fold line.

Catalogue rows (`stage head | articles`) run 260px : 1fr; article rows are a fixed grid of number, icon, name and line, plan letters, arrow. The comparison table is five fixed columns that collapse to two below 860px. Plans are a 3-cell grid sharing one outer border, stacking below 920px; the three prices share one baseline, so badges go in the corner instead of in the flow. Below 620px article rows drop to number, name and arrow (no icon square or plan letters), and the O / W / C plan legend is hidden with them. The apps page is a 5 : 7 list-and-detail split with a sticky detail at top 84px, stacking below 980px. Below 760px a fixed bottom dock carries the trial buttons. Breakpoints in use: 460, 520, 560, 620, 640, 760, 860, 900, 920, 980, 1180px.

Internal rhythm is 6 / 12 / 18 / 24px: 6px inside label-and-control stacks, 12px between controls, 18px plate padding, 24px for plan and results panels.

## Elevation & Depth

Flat by default. Depth comes from graphite rules and from the tray step (paper on tray, tray on paper). One shadow exists, a soft lift with a 1px contact line, and it is reserved for objects that sit on the page rather than in it: the Fig. 1 demo plate, the order form, the screenshot frame on the apps page, and the mobile dock. The sticky header uses a 94% white with a blur instead of a shadow, and gains a hairline bottom rule once scrolled.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 0 rgba(30,33,36,.06), 0 22px 40px -26px rgba(30,33,36,.42)`): demo plate, order form, screenshot frame, mobile dock. Nothing else.
- **Focus halo** (`outline: 3px solid #1E2124; outline-offset: 2px; box-shadow: 0 0 0 6px #F2C500`): every focus-visible element. Form fields use a graphite border plus a 3px yellow ring instead.

### Named Rules
**The Plate Rule.** Only a figure, a form or a frame is lifted. Rows, cards and buttons never carry a shadow.

## Shapes

Near-square everywhere: a 2px corner on buttons, fields, plates, tags, chips and panels, so edges read as printed boxes, not app cards. Circles appear only for numbered callouts (the 26px "A / B" column marks, the 18px output numbers 1 to 4) and the live status dot.

Lines carry the structure. 2px graphite outlines frames, the rail, the plans grid, the form and catalogue-row separators; 2.5 to 3px graphite opens a table or list (comparison, FAQ, spec table, totals). 1.5px graphite outlines small controls (segments, tabs, mini buttons, icon squares). 1px hairlines divide rows. Dashed steel marks anything provisional or illustrative: the "sample" badge, a draft chip, the one-time licence box, the "more options" divider.

The logo is a graphite 32px square with a yellow thumb-index notch in its top-right corner and a white W stroke.

## Components

### Buttons
Firm and catalogue-plain: a 2px graphite outline on every size, bold slightly expanded text, a mask-drawn square-capped arrow that nudges 3px on hover.
- **Shape:** near-square (2px).
- **Primary:** signal yellow, graphite text, 52px tall, 24px side padding, 16px weight 700 at 108% width.
- **Hover / Focus:** primary goes to lamp yellow; outline goes to tissue yellow; dark goes to black. Focus uses the global graphite-plus-yellow halo. Transitions 0.15s.
- **Line:** paper fill with the same graphite outline. **Dark:** graphite fill, white text. **Small:** 42px, 16px padding, 15px text. **Mini:** 36px, 1.5px outline, 14px weight 650; the "go" mini is yellow.
- **On yellow:** see The Yellow Flip Rule. **On graphite (closing band):** outline buttons turn white-outlined.

### Segmented controls and output tabs
One graphite-outlined strip divided by 1.5px graphite rules. Unselected cells are transparent with ink-2 text and a tissue-yellow hover; the selected cell is signal yellow with graphite text at weight 800. Disabled cells drop to 38% opacity. Output tabs stack a numbered-callout label over a bold value; at 480px they become a 2-by-2 grid.

### Chips and tags
- **Tag:** graphite fill, white uppercase label, 12px, 3px 8px padding. Used for status in frame bars. On the featured plan it becomes a corner label ("Includes the shop floor"): pinned over the plan cell's top-right corner (top and right -2px, so it sits on the 2px outline), square except a 2px bottom-left corner, so it never pushes the plan's price off the shared baseline.
- **Chip:** paper, 1.5px steel outline, 13px weight 600, a swatch square and a small remove button; a draft chip is graphite-dashed.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** paper; tray for the featured or secondary cell.
- **Shadow Strategy:** flat except the lifted plates named under Elevation.
- **Border:** 2px graphite outer, with cells divided by 2px or 1px rules inside the same border rather than separated by gaps.
- **Internal Padding:** 18px (plate columns), 24px (plans, results), 16 to 18px (fact cells).

### Inputs / Fields
- **Style:** 48px tall, near-white fill (#FCFCFD), 1.5px steel outline, 2px corner, 16px regular text; 13.5px bold labels above at 6px.
- **Focus:** border turns graphite with a 3px signal-yellow ring; no outline.
- **Sliders:** 4px track filled graphite to the value, steel beyond; a 22px square yellow thumb with a graphite outline that scales slightly while dragged.
- **Error:** fault-red message text under the form; fields themselves do not turn red.

### Navigation
- **Header:** sticky, 64px, 94% white with blur, hairline rule once scrolled. Links 15px weight 600 in ink-2 with a 2px underline that is graphite on hover and yellow for the current page. The yellow small primary button ends the row. Below 900px only the kept link and the button stay; below 460px only the button.
- **Thumb-index rail:** from 1180px, a deep-tray strip of 62px-tall tabs on the right edge, each a bold numeral over an 11px uppercase word. Hover is tissue yellow; the chapter in view turns graphite with a yellow numeral.
- **Mobile dock:** below 760px, a fixed bottom bar with the lift shadow and two equal buttons; it slides in from below.

### Chapter opener (signature)
A full-width signal-yellow band: the chapter numeral in 125% black, the chapter title in 115% extra-bold, one olive-ink sentence capped at 46ch. Every chapter on the home page and the apps page opens with one. The apps page uses "WX" in the numeral slot.

### Catalogue article row (signature)
A ruled row: article number (WX-0n, ink-3, 112%), a 40px graphite-outlined icon square with a 1.6px line icon, the article name in 19px extra-bold over a 15px description, three plan-letter squares (O / W / C, graphite when included, steel outline when not), and the arrow. The whole row is the link; hover washes it tissue yellow. On the apps page the selected row turns signal yellow and its icon square inverts to graphite with a yellow line.

### Spec table and figures
Spec tables open with a 3px graphite rule and an uppercase caption, rows ruled at 28% graphite, keys in medium weight, values bold. Figure labels ("Fig. 1") are graphite tags at weight 900, 120% width. Totals rows close on a 2.5px graphite rule.

### Disclosure
FAQ and the savings calculator use native details. The marker is a 28 to 30px square with a drawn plus that rotates 45 degrees to a cross when open; open FAQ markers fill yellow.

## Do's and Don'ts

### Do:
- **Do** keep yellow (#F2C500) on things you press, select or jump to, plus chapter openers and the cover (The Pressable Yellow Rule).
- **Do** flip the primary button to graphite with white text whenever it sits on yellow.
- **Do** set hierarchy with Archivo's width axis: 125% numerals, 108 to 122% heads, 100% reading text.
- **Do** keep tabular figures on for every price, size and count.
- **Do** outline every pressable thing in graphite (2px for buttons, 1.5px for small controls) at a 2px corner.
- **Do** divide cells inside one shared border with rules instead of floating separate cards in gaps.
- **Do** use dashed steel rules for anything provisional, sample or illustrative.
- **Do** name things the catalogue way: article numbers WX-01 to WX-09, Fig. numbers, numbered callouts.
- **Do** draw icons as inline SVG line drawings or CSS-masked SVG shapes (square-capped arrows, chevrons, plus marks).

### Don't:
- **Don't** bring back the earlier cream paper, blue actions or yellow text highlights.
- **Don't** use a SaaS hero with a feature-card grid, or a dark "industrial" theme.
- **Don't** add a second accent colour; green and red are status only.
- **Don't** put an uppercase eyebrow or kicker above a headline.
- **Don't** add shadows to rows, cards or buttons; the lift is for plates, the form, the screenshot frame and the dock only. No hard offset shadows.
- **Don't** round corners beyond 2px; circles are only for numbered callouts and status dots.
- **Don't** use text glyphs (arrows, ticks, stars) as icons.
- **Don't** set grey ink-2 text on yellow; use olive ink.
