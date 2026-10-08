/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/* ==========================================================================
   Wireframe Layout Engine

   Turns a wireframe spec into greyscale low-fidelity primitives inside a
   device frame (phone, tablet or browser). A screen is built in three layers:

   1. Shell (layoutStructure.screenLayout): how panes sit on the screen. Based
      on the Material 3 canonical layouts (list-detail, supporting pane, feed)
      and Apple's split views, plus the full-screen shells common app types
      need: centered auth/checkout, split image, editor canvas, map, media.
   2. Chrome: header, navigation (sidebar, rail, top tabs, header links,
      drawer, bottom tab bar), sticky action bar, footer, floating button,
      and an optional sheet or dialog over the screen.
   3. Blocks (section contentType): content patterns such as cards, lists,
      tables, forms, chat, calendar, kanban, pricing and a media player.

   Every block reads the width it is given, so the same spec works in a phone,
   a narrow list pane or a wide desktop column (a table becomes a list when
   narrow). Heights are computed so nothing overlaps.
   ========================================================================== */

/** A primitive drawn inside a screen frame, positioned relative to the frame */
export interface WireElement {
  kind: "rect" | "ellipse" | "text" | "line";
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Line end point (lines only) */
  x2?: number;
  y2?: number;
  fill?: string;
  stroke?: string;
  strokeWeight?: number;
  radius?: number;
  dash?: boolean;
  opacity?: number;
  text?: string;
  size?: number;
  weight?: "Regular" | "Medium" | "Semi Bold" | "Bold";
  color?: string;
  align?: "LEFT" | "CENTER" | "RIGHT";
  maxLines?: number;
}

/** A part of the screen that design notes can point at with a numbered marker */
export interface WireRegion {
  label: string;
  text: string;
  y: number;
}

export const WF = {
  ink: "#1E293B",
  muted: "#64748B",
  faint: "#94A3B8",
  line: "#CBD5E1",
  fill: "#F1F5F9",
  fill2: "#E2E8F0",
  white: "#FFFFFF",
  primary: "#334155",
  onDark: "#CBD5E1",
  marker: "#F97316",
};

export const lineH = (size: number) => Math.ceil(size * 1.3);
export const str = (v: any) => (v === undefined || v === null ? "" : String(v));
/** Rough wrapped line count for Inter, used to size blocks before FigJam measures the text */
export const estLines = (value: any, size: number, width: number, max: number) =>
  Math.max(1, Math.min(max, Math.ceil((str(value).length * size * 0.55) / Math.max(1, width))));

/* ==========================================================================
   Catalogs. The generator builds its schema descriptions from these, so the
   AI is offered exactly the options this engine can draw.
   ========================================================================== */
export const SCREEN_LAYOUTS: Record<string, string> = {
  standard: "one scrolling column (home, feed, dashboard, search results, settings, most phone screens)",
  split:
    "list-detail: list pane on the left, the selected item's detail on the right from pane=secondary sections (email, chat, files, CRM, admin records). Stacks on phones",
  aside:
    "supporting pane: wide main column plus a right rail from pane=secondary sections (product page with buy box, article with related links, document with comments). Stacks on phones",
  centered: "one narrow centered column, in a card on desktop (sign in, sign up, checkout, payment, single form, confirmation)",
  "split-image": "large image on one half and the content on the other; image on top on phones (sign in, onboarding, marketing sign-up)",
  canvas:
    "editor: tool bar, canvas in the middle, left panel from pane=primary sections, right inspector from pane=secondary sections (design, whiteboard, photo or video editing, site builders)",
  map: "full-screen map with content in a floating panel (desktop) or bottom sheet (phone) (ride hailing, delivery tracking, travel, property search, store finder)",
  immersive:
    "full-screen media with content in a side panel (desktop) or caption and bottom sheet (phone) (video, stories, reels, camera, photo viewer)",
};

export const NAV_STYLES: Record<string, string> = {
  sidebar: "left menu (SaaS, admin, dashboards); tablet shows a rail and phone a tab bar",
  rail: "narrow icon rail at the left (desktop or tablet; phone shows a tab bar)",
  top: "tabs under the header on desktop, scrolling chips under the app bar on phones",
  header: "links inside the header bar (websites, landing pages); phones show a menu button",
  tabbar: "bottom tab bar with 3-5 items (most phone apps); desktop shows top tabs",
  drawer: "menu button that opens a drawer",
  none: "no navigation (sign in, checkout, onboarding, detail pages and other flows)",
};

export const HEADER_STYLES: Record<string, string> = {
  standard: "logo or large title with action buttons",
  back: "back arrow with the page title (detail pages, sub-pages, steps in a flow)",
  search: "a search field is the main header element (search, shopping, maps)",
  none: "no header (immersive media, onboarding, splash)",
};

export const HERO_STYLES: Record<string, string> = {
  stats: "boxed summary with stat cards and an image (dashboards)",
  banner: "large image with the title below (content, promotions, events)",
  compact: "plain page title with an inline row of numbers (most app pages)",
  centered: "big centered headline, text and hero.actions buttons (landing page, onboarding step, welcome, success)",
  split: "headline and buttons on one side, image on the other (marketing, product launch)",
  profile: "cover, avatar, name, bio, stats and actions (user, creator, company or team profile)",
  card: "dark card with a big number (bank balance, wallet, loyalty card, weather, today's summary)",
  none: "no hero",
};

export const OVERLAYS: Record<string, string> = {
  none: "nothing over the screen",
  sheet: "bottom sheet on phones, side drawer on desktop, holding pane=overlay sections (filters, share, cart, quick view)",
  dialog: "centered dialog holding pane=overlay sections (confirm, alert, sign-in prompt)",
};

export const SECTION_TYPES: Record<string, string> = {
  cards: "grid of image cards (products, courses, listings, projects); item.value = price or number, item.action = button",
  carousel: "horizontal row of cards that scrolls (featured, recommended, continue watching)",
  gallery: "grid of image tiles without text (photos, portfolio, product images, profile posts)",
  feed: "rows with thumbnail, title, subtitle and value, badge or button at the right (transactions, notifications, search results, contacts, inbox)",
  posts: "social posts with author, text, image and like/comment/share (social feed, community)",
  avatars: "row of round avatars (stories, people, team members)",
  table: "data table; section.columns sets the headings; becomes a list on phones (admin, orders, users, reports)",
  form: "labelled inputs; the input type comes from the label (email, password, date, select, message, upload, 'I agree' checkbox, 'Enable' toggle); an item titled with a verb and no subtitle (Sign in, Continue, Pay) becomes the submit button",
  settings: "grouped setting rows with a toggle (item.badge On/Off) or a value and chevron",
  detail: "one item in depth: large image, title and description, then key-value rows (product, listing, record)",
  summary: "key-value rows (item.value) with a bold total and an optional button (order summary, receipt, invoice, transfer review)",
  cart: "line items with thumbnail, price (item.value) and quantity stepper",
  chart: "chart placeholder; a title with trend/over time draws a line chart, share/breakdown a donut, else bars; items are the data points",
  stats: "KPI tiles: label (title), number (value), change (badge)",
  kanban: "board columns; each item is a column, item.value = number of cards (tasks, sales pipeline, hiring)",
  calendar: "month grid; items are events with the time in item.value; agenda list below on phones (booking, scheduling, planner)",
  timeline: "vertical steps with dots; item.badge 'current' marks progress (order tracking, activity, history, itinerary)",
  chat: "message bubbles and a composer; item.title = message, item.subtitle = time, item.badge 'me' = sent by the user",
  media: "media player; the first item is the video or track (value = duration), other items are 'up next'",
  map: "map with pins; items are places",
  pricing: "plan cards: title = plan, value = price, subtitle = comma-separated features, badge 'Popular' highlights a plan",
  features: "icon, title and text grid (landing page features, benefits)",
  steps: "progress stepper; item.badge 'current' marks the active step (checkout, sign-up wizard, onboarding)",
  tabs: "segmented control or tab row that switches the content below",
  chips: "wrapping chips (filters, categories, tags, time slots, sizes); item.badge 'selected' fills a chip",
  checklist: "tasks with checkboxes and a progress bar; item.badge 'done' checks a task (to-do, onboarding, course lessons)",
  accordion: "expandable rows (FAQ, help, course syllabus)",
  article: "long text; items are paragraphs (title = subheading, subtitle = paragraph) (blog, news, docs, terms)",
  reviews: "ratings and quotes, item.value = stars 1-5 (reviews, testimonials)",
  cta: "call-to-action band: section title, item text and item.action buttons (upgrade, newsletter, promotion)",
  keypad: "amount display and number pad; first item value = amount (payments, transfers, PIN)",
  shortcuts: "round quick-action buttons with labels (send, request, scan, top up)",
  buttons: "stack of full-width buttons (social sign-in, choose the next step)",
  alert: "inline notice with title, text and action (warning, error, info, success)",
  empty: "empty state with icon, message and button (no data yet, no results, error, success)",
};

const TYPE_ALIASES: Record<string, string> = {
  list: "feed",
  rows: "feed",
  notifications: "feed",
  grid: "gallery",
  photos: "gallery",
  kpi: "stats",
  kpis: "stats",
  metrics: "stats",
  board: "kanban",
  messages: "chat",
  conversation: "chat",
  player: "media",
  video: "media",
  audio: "media",
  faq: "accordion",
  testimonials: "reviews",
  banner: "cta",
  activity: "timeline",
  tracking: "timeline",
  tasks: "checklist",
  todo: "checklist",
  segmented: "tabs",
  filters: "chips",
  tags: "chips",
  stepper: "steps",
  progress: "steps",
  plans: "pricing",
  "quick-actions": "shortcuts",
  actions: "shortcuts",
  schedule: "calendar",
  agenda: "calendar",
  receipt: "summary",
  "order-summary": "summary",
  notice: "alert",
  callout: "alert",
  text: "article",
  body: "article",
  products: "cards",
  stories: "avatars",
};

const has = (o: Record<string, string>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const pick = (v: any, allowed: Record<string, string>, fallback: string) => {
  const k = str(v).toLowerCase().trim();
  return has(allowed, k) ? k : fallback;
};
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const sectionType = (v: any) => {
  const k = str(v).toLowerCase().trim();
  if (has(SECTION_TYPES, k)) return k;
  return TYPE_ALIASES[k] || "feed";
};

/** Blocks that carry their own heading, or need none */
const NO_HEADING = new Set(["tabs", "steps", "keypad", "buttons", "cta", "shortcuts", "alert"]);
const SEE_ALL = new Set(["cards", "carousel", "gallery", "feed", "posts", "avatars", "reviews"]);
const SUBMIT =
  /^(sign in|sign up|log in|login|register|create account|continue|next|submit|save|send|pay|place order|book|confirm|checkout|get started|reset password|verify|apply|done|update)\b/i;

export function buildWireframeScreen(data: any) {
  const layout = data.layoutStructure || {};
  const screenType = str(data.screenType || "mobile").toLowerCase();
  const isDesktop = screenType.includes("desktop") || screenType === "web";
  const isTablet = !isDesktop && screenType.includes("tablet");
  const isMobile = !isDesktop && !isTablet;
  const wide = !isMobile;
  const W = isDesktop ? 1280 : isTablet ? 768 : 390;
  const pad = isDesktop ? 32 : isTablet ? 24 : 16;
  const gap = 12;
  const minH = isDesktop ? 800 : isTablet ? 1024 : 844;
  const frameRadius = isDesktop ? 12 : isTablet ? 28 : 44;

  const els: WireElement[] = [];
  const regions: WireRegion[] = [];
  // Panels that run to the bottom of the screen (or to the bottom bars); sized once the height is known
  const toBottom: WireElement[] = [];
  const toBars: WireElement[] = [];
  const afterSize: Array<(H: number) => void> = [];

  /* ---------- Primitives ---------- */
  const add = (e: WireElement) => {
    els.push(e);
    return e;
  };
  const rect = (x: number, y: number, w: number, h: number, o: Partial<WireElement> = {}) => add({ kind: "rect", x, y, w, h, ...o });
  const ellipse = (x: number, y: number, d: number, o: Partial<WireElement> = {}) => add({ kind: "ellipse", x, y, w: d, h: d, ...o });
  const text = (x: number, y: number, w: number, value: any, size = 14, o: Partial<WireElement> = {}) => {
    const maxLines = o.maxLines || 1;
    return add({ kind: "text", x, y, w: Math.max(1, w), h: lineH(size) * maxLines, text: str(value), size, color: WF.ink, maxLines, ...o });
  };
  const line = (x: number, y: number, x2: number, y2: number, o: Partial<WireElement> = {}) =>
    add({ kind: "line", x, y, x2, y2, w: 0, h: 0, stroke: WF.line, strokeWeight: 1, ...o });
  /** Wrapped text; returns the height it takes */
  const para = (x: number, y: number, w: number, value: any, size: number, max: number, o: Partial<WireElement> = {}) => {
    if (!str(value)) return 0;
    const n = estLines(value, size, w, max);
    text(x, y, w, value, size, { ...o, maxLines: n });
    return lineH(size) * n;
  };
  /** Moves everything `draw` adds to index `at`, so it sits behind what was drawn after `at` */
  const behind = (at: number, draw: () => void) => {
    const start = els.length;
    draw();
    els.splice(at, 0, ...els.splice(start));
  };
  /** Moves elements and regions drawn since the given indexes */
  const shiftSince = (fromEl: number, fromRegion: number, dy: number) => {
    for (let i = fromEl; i < els.length; i++) {
      els[i].y += dy;
      if (els[i].y2 !== undefined) els[i].y2! += dy;
    }
    for (let i = fromRegion; i < regions.length; i++) regions[i].y += dy;
  };

  // Grey box with a cross: the standard wireframe image placeholder
  const image = (x: number, y: number, w: number, h: number, radius = 8, fill = WF.fill2) => {
    rect(x, y, w, h, { fill, radius, name: "Image placeholder" });
    line(x, y, x + w, y + h, { stroke: WF.faint });
    line(x, y + h, x + w, y, { stroke: WF.faint });
  };
  const btnW = (label: any, size = 13) => Math.min(260, 32 + str(label).length * size * 0.62);
  const button = (x: number, y: number, w: number, h: number, label: any, primary = true, size = 13) => {
    rect(x, y, w, h, {
      fill: primary ? WF.primary : WF.white,
      stroke: primary ? undefined : WF.primary,
      strokeWeight: 1.5,
      radius: 8,
      name: `Button: ${str(label)}`,
    });
    text(x + 6, y + (h - lineH(size)) / 2, w - 12, label, size, {
      color: primary ? WF.white : WF.primary,
      weight: "Semi Bold",
      align: "CENTER",
    });
  };
  const pillW = (label: any) => Math.min(120, 16 + str(label).length * 6.5);
  const pill = (x: number, y: number, label: any, filled = false) => {
    const w = pillW(label);
    rect(x, y, w, 20, { fill: filled ? WF.ink : WF.white, stroke: WF.ink, radius: 10, name: `Badge: ${str(label)}` });
    text(x + 4, y + 3, w - 8, label, 10, { weight: "Semi Bold", align: "CENTER", color: filled ? WF.white : WF.ink });
    return w;
  };
  const icon = (x: number, y: number, d = 24, color = WF.ink) => ellipse(x, y, d, { stroke: color, strokeWeight: 1.5, name: "Icon" });
  const glyph = (x: number, y: number, d = 24, o: Partial<WireElement> = {}) =>
    rect(x, y, d, d, { stroke: WF.ink, strokeWeight: 1.5, radius: d / 4, name: "Icon", ...o });
  const bar = (x: number, y: number, w: number, h = 8) => rect(x, y, Math.max(8, w), h, { fill: WF.fill2, radius: h / 2 });
  const avatar = (x: number, y: number, d: number) => ellipse(x, y, d, { fill: WF.fill2, stroke: WF.line, name: "Avatar" });
  const chevron = (x: number, y: number, dir: "left" | "right" | "down" = "right", s = 8, color = WF.muted) => {
    const o = { stroke: color, strokeWeight: 1.5 };
    if (dir === "right") {
      line(x, y, x + s / 2, y + s / 2, o);
      line(x + s / 2, y + s / 2, x, y + s, o);
    } else if (dir === "left") {
      line(x + s / 2, y, x, y + s / 2, o);
      line(x, y + s / 2, x + s / 2, y + s, o);
    } else {
      line(x, y, x + s / 2, y + s / 2, o);
      line(x + s / 2, y + s / 2, x + s, y, o);
    }
  };
  const check = (x: number, y: number, s: number, color = WF.white) => {
    const o = { stroke: color, strokeWeight: 2 };
    line(x, y + s * 0.5, x + s * 0.38, y + s * 0.85, o);
    line(x + s * 0.38, y + s * 0.85, x + s, y + s * 0.15, o);
  };
  const play = (x: number, y: number, s: number, color = WF.white) => {
    const o = { stroke: color, strokeWeight: 2 };
    line(x, y, x, y + s, o);
    line(x, y + s, x + s * 0.87, y + s / 2, o);
    line(x + s * 0.87, y + s / 2, x, y, o);
  };
  const toggle = (x: number, y: number, on: boolean) => {
    rect(x, y, 44, 26, { fill: on ? WF.ink : WF.fill2, radius: 13, name: on ? "Toggle on" : "Toggle off" });
    ellipse(x + (on ? 20 : 2), y + 2, 22, { fill: WF.white });
  };
  const checkbox = (x: number, y: number, on: boolean, s = 20) => {
    rect(x, y, s, s, { fill: on ? WF.ink : WF.white, stroke: WF.ink, strokeWeight: 1.5, radius: 4, name: "Checkbox" });
    if (on) check(x + 4, y + 5, s - 8);
  };
  const hamburger = (x: number, y: number) => [0, 6, 12].forEach((d) => rect(x, y + d, 20, 2, { fill: WF.ink, radius: 1 }));
  const searchGlyph = (x: number, y: number) => {
    ellipse(x, y, 13, { stroke: WF.muted, strokeWeight: 1.5 });
    line(x + 11, y + 11, x + 16, y + 16, { stroke: WF.muted, strokeWeight: 1.5 });
  };
  const stars = (x: number, y: number, n: number) => {
    for (let i = 0; i < 5; i++) rect(x + i * 14, y, 11, 11, { fill: i < n ? WF.ink : WF.fill2, radius: 2 });
  };
  /** `clearLeft` keeps pins out of the left part of the map, where a floating panel sits */
  const mapArt = (x: number, y: number, w: number, h: number, pins: number, radius = 12, clearLeft = 0) => {
    rect(x, y, w, h, { fill: WF.fill2, radius, name: "Map" });
    rect(x + w * 0.72, y + h * 0.1, w * 0.2, h * 0.22, { fill: WF.line, radius: 8, name: "Park" });
    const road = { stroke: WF.white, strokeWeight: isMobile ? 6 : 10 };
    line(x, y + h * 0.32, x + w, y + h * 0.32, road);
    line(x, y + h * 0.7, x + w, y + h * 0.7, road);
    line(x + w * 0.24, y, x + w * 0.24, y + h, road);
    line(x + w * 0.62, y, x + w * 0.62, y + h, road);
    line(x + w * 0.05, y + h * 0.95, x + w * 0.5, y + h * 0.05, { ...road, strokeWeight: road.strokeWeight / 2 });
    const spots = [[0.3, 0.48], [0.66, 0.24], [0.5, 0.82], [0.84, 0.56], [0.14, 0.18]];
    const pts = spots.slice(0, clamp(pins, 1, 5)).map(([fx, fy]) => ({ x: x + w * (clearLeft + fx * (1 - clearLeft)), y: y + h * fy }));
    if (pts.length > 1) line(pts[0].x, pts[0].y, pts[1].x, pts[1].y, { stroke: WF.ink, strokeWeight: 3, dash: true, name: "Route" });
    pts.forEach((p, i) => {
      ellipse(p.x - 11, p.y - 11, 22, { fill: i === 0 ? WF.ink : WF.primary, stroke: WF.white, strokeWeight: 2, name: "Pin" });
      ellipse(p.x - 4, p.y - 4, 8, { fill: WF.white });
    });
    return pts;
  };
  const artboard = (x: number, y: number, w: number, h: number) => {
    rect(x, y, w, h, { fill: WF.white, stroke: WF.line, name: "Artboard" });
    const sx = x + w * 0.08;
    const sy = y + h * 0.1;
    const sw = w * 0.84;
    const sh = h * 0.45;
    image(sx, sy, sw, sh, 6);
    bar(sx, y + h * 0.64, w * 0.5, 14);
    bar(sx, y + h * 0.64 + 28, w * 0.7);
    bar(sx, y + h * 0.64 + 44, w * 0.6);
    // Selected layer with resize handles
    rect(sx - 2, sy - 2, sw + 4, sh + 4, { stroke: WF.ink, strokeWeight: 1.5, name: "Selection" });
    [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]].forEach(([hx, hy]) =>
      rect(hx - 5, hy - 5, 10, 10, { fill: WF.white, stroke: WF.ink, strokeWeight: 1.5 })
    );
  };
  /** A row of buttons, or a stack of full-width buttons; returns the height */
  const buttonRow = (x: number, y: number, w: number, labels: string[], o: { center?: boolean; stack?: boolean; light?: boolean } = {}) => {
    if (labels.length === 0) return 0;
    if (o.stack) {
      labels.forEach((l, i) => button(x, y + i * 58, w, 48, l, !o.light && i === 0, 15));
      return labels.length * 58 - 10;
    }
    const widths = labels.map((l) => btnW(l, 14) + 16);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (labels.length - 1);
    let bx = o.center ? x + (w - total) / 2 : x;
    labels.forEach((l, i) => {
      button(bx, y, widths[i], 44, l, !o.light && i === 0, 14);
      bx += widths[i] + gap;
    });
    return 44;
  };

  /* ---------- Spec ---------- */
  const header = layout.header || {};
  const titleText = str(header.title || data.screenTitle || "App");
  const headerActions: string[] = arr(header.actions).map(str);
  const searchAction = headerActions.find((a) => /search|find/i.test(a));
  const iconActions = headerActions.filter((a) => a !== searchAction);
  const nav: string[] = arr(layout.sidebarOrNav).map(str);
  const footerActions: string[] = arr(layout.footerOrBottomBar?.actions).map(str);
  const sections = arr(layout.mainSections).filter((sec) => sec && typeof sec === "object");
  const hero = layout.heroOrSummary && (layout.heroOrSummary.title || layout.heroOrSummary.subtitle) ? layout.heroOrSummary : null;

  const shell = pick(layout.screenLayout, SCREEN_LAYOUTS, "standard");
  const onMedia = shell === "map" || shell === "immersive";
  const headerStyle = pick(layout.headerStyle, HEADER_STYLES, shell === "immersive" ? "none" : "standard");
  // A phone has no room for a sidebar and a desktop has no bottom tab bar, so styles map to the nearest one
  const navStyle = (() => {
    if (nav.length === 0) return "none";
    const s = pick(layout.navStyle, NAV_STYLES, isDesktop ? "sidebar" : "tabbar");
    if (isDesktop) return s === "tabbar" ? "top" : s;
    if (isTablet) return s === "sidebar" ? "rail" : s === "header" ? "drawer" : s;
    return s === "sidebar" || s === "rail" ? "tabbar" : s === "header" ? "drawer" : s;
  })();
  const heroStyle = pick(layout.heroStyle, HERO_STYLES, ["centered", "split-image", "map"].includes(shell) ? "compact" : "stats");
  const overlay = pick(layout.overlay, OVERLAYS, "none");
  const paneOf = (sec: any) => pick(sec?.pane, { primary: "", secondary: "", overlay: "" }, "primary");
  const overlaySecs = overlay === "none" ? [] : sections.filter((s) => paneOf(s) === "overlay");
  const flowSecs = sections.filter((s) => overlaySecs.indexOf(s) === -1);
  const primarySecs = flowSecs.filter((s) => paneOf(s) !== "secondary");
  const secondarySecs = flowSecs.filter((s) => paneOf(s) === "secondary");

  let y = 0;
  let contentX = pad;
  let contentW = W - pad * 2;

  /* ---------- Bottom bars (sizes are needed before the shells are laid out) ---------- */
  let bottomH = 0;
  const bottomDraws: Array<(top: number) => void> = [];
  if (isDesktop) {
    if (footerActions.length > 0) {
      // Websites get a full footer with link columns; apps get a slim status row
      const rich = footerActions.length >= 4 && (navStyle === "header" || heroStyle === "centered" || heroStyle === "split");
      const fh = rich ? 180 : 56;
      bottomH = fh;
      bottomDraws.push((top) => {
        regions.push({ label: "Footer", text: footerActions.join(" "), y: top });
        rect(0, top, W, fh, { fill: WF.fill, name: "Footer" });
        if (rich) {
          rect(pad, top + 32, 28, 28, { fill: WF.fill2, radius: 6, name: "Logo" });
          text(pad + 40, top + 36, 220, titleText, 15, { weight: "Bold" });
          const cols = footerActions.slice(0, 5);
          const cw = (W - pad * 2 - 320) / cols.length;
          cols.forEach((a, i) => {
            const cx = pad + 320 + i * cw;
            text(cx, top + 32, cw - 16, a, 13, { weight: "Semi Bold" });
            [0, 1, 2].forEach((k) => bar(cx, top + 62 + k * 22, cw * 0.55 - k * 12));
          });
          line(pad, top + fh - 44, W - pad, top + fh - 44);
          text(pad, top + fh - 30, 400, `© ${titleText}`, 11, { color: WF.muted });
        } else {
          let fx = pad;
          footerActions.slice(0, 5).forEach((a) => {
            const w = Math.min(260, 20 + a.length * 7);
            text(fx, top + 19, w, a, 12, { color: WF.muted });
            fx += w + 24;
          });
        }
      });
    }
  } else {
    const tabs = navStyle === "tabbar" ? nav : nav.length === 0 && footerActions.length >= 3 ? footerActions : [];
    const ctas = tabs === footerActions ? [] : footerActions.slice(0, 2);
    if (ctas.length > 0) {
      const ctaH = 76;
      const offset = bottomH;
      bottomH += ctaH;
      bottomDraws.push((top) => {
        const cy = top + offset;
        regions.push({ label: "Action bar", text: ctas.join(" "), y: cy });
        rect(0, cy, W, ctaH, { fill: WF.white, name: "Sticky action bar" });
        line(0, cy, W, cy);
        const bw = (W - pad * 2 - gap * (ctas.length - 1)) / ctas.length;
        ctas.forEach((a, i) => button(pad + i * (bw + gap), cy + 14, bw, 48, a, i === ctas.length - 1, 15));
      });
    }
    if (tabs.length > 0) {
      const tabH = 84;
      const offset = bottomH;
      bottomH += tabH;
      bottomDraws.push((top) => {
        const ty = top + offset;
        regions.push({ label: "Tab bar", text: tabs.join(" "), y: ty });
        rect(0, ty, W, tabH, { fill: WF.white, name: "Tab bar" });
        line(0, ty, W, ty);
        const shown = tabs.slice(0, 5);
        const tw = W / shown.length;
        shown.forEach((t, i) => {
          const active = i === 0;
          rect(i * tw + tw / 2 - 12, ty + 12, 24, 24, { fill: active ? WF.ink : undefined, stroke: WF.ink, strokeWeight: 1.5, radius: 6 });
          text(i * tw + 4, ty + 42, tw - 8, t, 10, { align: "CENTER", weight: active ? "Semi Bold" : "Regular", color: active ? WF.ink : WF.muted });
        });
        rect(W / 2 - 67, ty + tabH - 12, 134, 5, { fill: WF.ink, radius: 3, name: "Home indicator" });
      });
    }
  }

  /* ---------- Top chrome: browser or status bar, header, navigation ---------- */
  // Horizontal nav: underlined tabs on desktop, chips on phones and tablets
  const navStrip = (top: number) => {
    if (isDesktop) {
      rect(0, top, W, 48, { fill: WF.white, name: "Top navigation" });
      line(0, top + 48, W, top + 48);
      let nx = pad;
      nav.slice(0, 8).forEach((item, i) => {
        const w = 24 + item.length * 7.5;
        text(nx, top + 15, w, item, 13, { weight: i === 0 ? "Semi Bold" : "Regular", color: i === 0 ? WF.ink : WF.muted });
        if (i === 0) rect(nx, top + 45, w - 24, 3, { fill: WF.ink, radius: 2 });
        nx += w + 8;
      });
      return 48;
    }
    let nx = pad;
    nav.slice(0, 8).forEach((item, i) => {
      const w = 28 + item.length * 7;
      if (nx + w > W - pad) return;
      rect(nx, top, w, 32, { fill: i === 0 ? WF.ink : onMedia ? WF.white : WF.fill, radius: 16, name: `Chip: ${item}` });
      text(nx + 6, top + 9, w - 12, item, 12, { align: "CENTER", weight: "Medium", color: i === 0 ? WF.white : WF.ink });
      nx += w + 8;
    });
    return 32 + 16;
  };
  const sideRail = (top: number) => {
    toBottom.push(rect(0, top, 80, 10, { fill: WF.fill, name: "Navigation rail" }));
    nav.slice(0, 7).forEach((item, i) => {
      const iy = top + 20 + i * 68;
      if (i === 0) rect(16, iy - 4, 48, 32, { fill: WF.fill2, radius: 16 });
      glyph(28, iy, 24);
      text(4, iy + 34, 72, item, 10, { align: "CENTER", color: i === 0 ? WF.ink : WF.muted, weight: i === 0 ? "Semi Bold" : "Regular" });
    });
    regions.push({ label: "Navigation rail", text: nav.join(" "), y: top });
    return 80;
  };

  let contentLeft = 0;
  let contentTop = 0;

  if (isDesktop) {
    rect(0, 0, W, 40, { fill: WF.fill, name: "Browser bar" });
    [0, 1, 2].forEach((i) => ellipse(16 + i * 20, 14, 12, { fill: WF.line }));
    rect(120, 8, W - 240, 24, { fill: WF.white, radius: 12 });
    text(136, 13, 400, "https://", 11, { color: WF.faint });
    y = 40;

    if (headerStyle !== "none") {
      rect(0, y, W, 64, { fill: WF.white, name: "Header" });
      line(0, y + 64, W, y + 64);
      let lx = pad;
      if (navStyle === "drawer") {
        hamburger(lx, y + 25);
        lx += 40;
      }
      if (headerStyle === "back") {
        chevron(lx + 2, y + 24, "left", 16, WF.ink);
        lx += 28;
      } else {
        rect(lx, y + 18, 28, 28, { fill: WF.fill2, radius: 6, name: "Logo" });
        lx += 40;
      }
      let ax = W - pad;
      [...iconActions].slice(0, 4).reverse().forEach((a, i) => {
        const w = Math.min(180, 28 + a.length * 7);
        ax -= w;
        button(ax, y + 14, w, 36, a, i === 0, 12);
        ax -= 12;
      });
      const titleW = Math.min(320, 24 + titleText.length * 11);
      let afterTitle = lx + titleW + 24;
      if (navStyle === "header") {
        let nx = afterTitle;
        nav.slice(0, 6).forEach((item, i) => {
          const w = 16 + item.length * 7.5;
          if (nx + w > ax - 24) return;
          text(nx, y + 23, w, item, 14, { color: i === 0 ? WF.ink : WF.muted, weight: i === 0 ? "Semi Bold" : "Regular" });
          nx += w + 20;
        });
        afterTitle = nx;
      }
      if (searchAction || headerStyle === "search") {
        const label = (searchAction || "Search").replace(/[.…\s]+$/, "") + "…";
        const sw = Math.min(headerStyle === "search" ? 560 : 360, ax - afterTitle);
        if (sw > 160) {
          const sx = headerStyle === "search" ? Math.max(afterTitle, Math.min((W - sw) / 2, ax - sw)) : ax - sw;
          rect(sx, y + 14, sw, 36, { fill: WF.fill, radius: 18, name: "Search field" });
          searchGlyph(sx + 14, y + 25);
          text(sx + 38, y + 23, sw - 52, label, 13, { color: WF.muted });
        }
      }
      text(lx, y + 21, titleW, titleText, 18, { weight: "Bold" });
      regions.push({ label: "Header", text: [titleText, ...headerActions, ...(navStyle === "header" ? nav : [])].join(" "), y });
      y += 64;
    }

    if (navStyle === "top") {
      regions.push({ label: "Top navigation", text: nav.join(" "), y });
      y += navStrip(y);
    }
    contentTop = y;

    if (navStyle === "sidebar") {
      const sideW = 232;
      toBottom.push(rect(0, y, sideW, 10, { fill: WF.fill, name: "Sidebar" }));
      nav.slice(0, 10).forEach((item, i) => {
        const iy = y + 24 + i * 44;
        if (i === 0) rect(12, iy - 6, sideW - 24, 36, { fill: WF.fill2, radius: 8 });
        rect(28, iy + 4, 16, 16, { stroke: WF.ink, radius: 4 });
        text(56, iy + 3, sideW - 72, item, 13, { weight: i === 0 ? "Semi Bold" : "Regular" });
      });
      regions.push({ label: "Sidebar navigation", text: nav.join(" "), y });
      contentLeft = sideW;
    } else if (navStyle === "rail") {
      contentLeft = sideRail(y);
    }
  } else {
    // Status bar
    text(pad + 8, 14, 60, "9:41", 14, { weight: "Semi Bold" });
    rect(W - pad - 64, 18, 18, 10, { fill: WF.ink, radius: 2 });
    rect(W - pad - 40, 18, 14, 10, { fill: WF.ink, radius: 2 });
    rect(W - pad - 20, 17, 24, 12, { stroke: WF.ink, radius: 3 });
    y = 44;

    const fieldFill = { fill: onMedia ? WF.white : WF.fill, stroke: onMedia ? WF.line : undefined };
    if (headerStyle === "back") {
      chevron(pad + 2, y + 16, "left", 18, WF.ink);
      text(pad + 40, y + 15, W - pad * 2 - 80, titleText, 17, { weight: "Semi Bold", align: "CENTER" });
      if (iconActions[0]) icon(W - pad - 24, y + 14);
      regions.push({ label: "App bar", text: [titleText, ...headerActions].join(" "), y });
      y += 52;
    } else if (headerStyle === "search") {
      const right = iconActions.length > 0 ? 52 : 0;
      const sw = W - pad * 2 - right;
      rect(pad, y + 8, sw, 44, { ...fieldFill, radius: 22, name: "Search field" });
      searchGlyph(pad + 16, y + 23);
      text(pad + 42, y + 21, sw - 60, (searchAction || "Search").replace(/[.…\s]+$/, "") + "…", 14, { color: WF.muted });
      if (right) avatar(W - pad - 40, y + 10, 40);
      regions.push({ label: "Search", text: [searchAction || "Search", ...headerActions].join(" "), y });
      y += 64;
    } else if (headerStyle === "standard") {
      // App bar: title left, action icons right (labelled underneath)
      let tx = pad;
      if (navStyle === "drawer") {
        hamburger(pad, y + 24);
        tx += 36;
      }
      const visibleIcons = iconActions.slice(0, isTablet ? 4 : 3);
      const slotW = 52;
      const titleW = W - tx - pad - visibleIcons.length * slotW - 8;
      text(tx, y + 14, titleW, titleText, 22, { weight: "Bold" });
      visibleIcons.forEach((a, i) => {
        const sx = W - pad - (visibleIcons.length - i) * slotW;
        icon(sx + (slotW - 24) / 2, y + 8);
        text(sx, y + 36, slotW, a, 9, { color: WF.muted, align: "CENTER" });
      });
      regions.push({ label: "App bar", text: [titleText, ...headerActions].join(" "), y });
      y += 60;

      if (searchAction) {
        const sw = W - pad * 2;
        rect(pad, y, sw, 44, { ...fieldFill, radius: 22, name: "Search field" });
        searchGlyph(pad + 16, y + 15);
        text(pad + 42, y + 13, sw - 60, searchAction.replace(/[.…\s]+$/, "") + "…", 14, { color: WF.muted });
        regions.push({ label: "Search", text: searchAction, y });
        y += 44 + 16;
      }
    }
    if (navStyle === "top") {
      regions.push({ label: "Navigation chips", text: nav.join(" "), y });
      y += navStrip(y);
    }
    contentTop = y;
    if (navStyle === "rail") contentLeft = sideRail(y);
  }

  /* ---------- Hero ---------- */
  const drawHero = (x: number, w: number, top: number): number => {
    if (!hero || heroStyle === "none") return top;
    const roomy = w >= 560;
    const actions = arr(hero.actions).map(str).slice(0, 2);
    const stats = arr(hero.stats).slice(0, roomy ? 4 : 3);
    let hy = top;

    if (heroStyle === "banner") {
      const ih = roomy ? 240 : 180;
      image(x, hy, w, ih, 12);
      hy += ih + 16;
      const size = roomy ? 28 : 22;
      hy += para(x, hy, w, hero.title, size, 2, { weight: "Bold" }) + 4;
      hy += para(x, hy, w, hero.subtitle, 14, 2, { color: WF.muted });
      if (actions.length) hy += 16 + buttonRow(x, hy + 16, w, actions);
    } else if (heroStyle === "compact") {
      const aw = roomy && actions.length ? actions.reduce((s, a) => s + btnW(a, 14) + 16 + gap, -gap) : 0;
      const size = roomy ? 28 : 22;
      if (aw) buttonRow(x + w - aw, hy, aw, actions);
      hy += para(x, hy, w - (aw ? aw + 24 : 0), hero.title, size, 2, { weight: "Bold" }) + 4;
      hy += para(x, hy, w - (aw ? aw + 24 : 0), hero.subtitle, 13, 2, { color: WF.muted });
      if (stats.length > 0) {
        hy += 16;
        const sw = w / stats.length;
        stats.forEach((s: any, i: number) => {
          const sx = x + i * sw;
          if (i > 0) line(sx - 12, hy, sx - 12, hy + 44);
          text(sx, hy, sw - 24, s.value, roomy ? 22 : 18, { weight: "Bold" });
          text(sx, hy + 30, sw - 24, s.label, 11, { color: WF.muted });
        });
        hy += 44;
      }
      if (actions.length && !aw) hy += 16 + buttonRow(x, hy + 16, w, actions);
    } else if (heroStyle === "centered") {
      if (roomy) {
        const tw = Math.min(w, 760);
        hy += 24 + para(x + (w - tw) / 2, hy + 24, tw, hero.title, 40, 3, { weight: "Bold", align: "CENTER" }) + 12;
        const sw = Math.min(w, 620);
        hy += para(x + (w - sw) / 2, hy, sw, hero.subtitle, 17, 3, { color: WF.muted, align: "CENTER" });
        if (actions.length) hy += 28 + buttonRow(x, hy + 28, w, actions, { center: true });
        hy += 40;
        image(x + w * 0.08, hy, w * 0.84, 340, 16);
        hy += 340;
      } else {
        // Onboarding step: illustration, message, page dots, stacked buttons
        const iw = w * 0.8;
        image(x + (w - iw) / 2, hy + 8, iw, iw * 0.85, 24);
        hy += 8 + iw * 0.85 + 28;
        hy += para(x, hy, w, hero.title, 26, 3, { weight: "Bold", align: "CENTER" }) + 8;
        hy += para(x, hy, w, hero.subtitle, 15, 3, { color: WF.muted, align: "CENTER" });
        hy += 24;
        [0, 1, 2].forEach((i) => rect(x + w / 2 - 26 + i * 20 + (i > 0 ? 12 : 0), hy, i === 0 ? 20 : 8, 8, { fill: i === 0 ? WF.ink : WF.line, radius: 4 }));
        hy += 8;
        if (actions.length) hy += 28 + buttonRow(x, hy + 28, w, actions, { stack: true });
      }
    } else if (heroStyle === "split" && roomy) {
      const lw = w * 0.5;
      let ly = hy + 24;
      ly += para(x, ly, lw, hero.title, 40, 3, { weight: "Bold" }) + 12;
      ly += para(x, ly, lw, hero.subtitle, 17, 3, { color: WF.muted });
      if (actions.length) ly += 28 + buttonRow(x, ly + 28, lw, actions);
      const ih = Math.max(320, ly - hy + 24);
      image(x + w * 0.56, hy, w * 0.44, ih, 16);
      hy += ih;
    } else if (heroStyle === "split") {
      hy += para(x, hy, w, hero.title, 26, 3, { weight: "Bold" }) + 8;
      hy += para(x, hy, w, hero.subtitle, 15, 3, { color: WF.muted });
      if (actions.length) hy += 20 + buttonRow(x, hy + 20, w, actions, { stack: true });
      hy += 24;
      image(x, hy, w, w * 0.7, 16);
      hy += w * 0.7;
    } else if (heroStyle === "profile") {
      const coverH = roomy ? 180 : 120;
      const d = roomy ? 112 : 96;
      image(x, hy, w, coverH, 12);
      if (roomy) {
        ellipse(x + 24, hy + coverH - d / 2, d, { fill: WF.fill2, stroke: WF.white, strokeWeight: 4, name: "Avatar" });
        if (actions.length) buttonRow(x + w - actions.reduce((s, a) => s + btnW(a, 14) + 16 + gap, -gap), hy + coverH + 16, w, actions);
        hy += coverH + d / 2 + 16;
        hy += para(x + 24, hy, w - 48, hero.title, 26, 1, { weight: "Bold" }) + 4;
        hy += para(x + 24, hy, Math.min(w - 48, 640), hero.subtitle, 14, 2, { color: WF.muted });
        if (stats.length) {
          hy += 16;
          stats.forEach((s: any, i: number) => {
            text(x + 24 + i * 140, hy, 130, s.value, 18, { weight: "Bold" });
            text(x + 24 + i * 140, hy + 26, 130, s.label, 12, { color: WF.muted });
          });
          hy += 44;
        }
      } else {
        ellipse(x + (w - d) / 2, hy + coverH - d / 2, d, { fill: WF.fill2, stroke: WF.white, strokeWeight: 4, name: "Avatar" });
        hy += coverH + d / 2 + 12;
        hy += para(x, hy, w, hero.title, 22, 1, { weight: "Bold", align: "CENTER" }) + 4;
        hy += para(x, hy, w, hero.subtitle, 13, 2, { color: WF.muted, align: "CENTER" });
        if (stats.length) {
          hy += 16;
          const sw = w / stats.length;
          stats.forEach((s: any, i: number) => {
            text(x + i * sw, hy, sw, s.value, 18, { weight: "Bold", align: "CENTER" });
            text(x + i * sw, hy + 26, sw, s.label, 11, { color: WF.muted, align: "CENTER" });
          });
          hy += 44;
        }
        if (actions.length) {
          hy += 16;
          const bw = (w - gap * (actions.length - 1)) / actions.length;
          actions.forEach((a, i) => button(x + i * (bw + gap), hy, bw, 40, a, i === 0, 14));
          hy += 40;
        }
      }
    } else if (heroStyle === "card") {
      const cw = roomy ? Math.min(w, 520) : w;
      const at = els.length;
      const inner = 20;
      let cy = hy + inner;
      text(x + inner, cy, cw - inner * 2, hero.subtitle, 13, { color: WF.onDark });
      cy += lineH(13) + 6;
      cy += para(x + inner, cy, cw - inner * 2, hero.title, roomy ? 36 : 30, 2, { weight: "Bold", color: WF.white });
      if (stats.length) {
        cy += 16;
        const sw = (cw - inner * 2) / stats.length;
        stats.forEach((s: any, i: number) => {
          text(x + inner + i * sw, cy, sw - 8, s.value, 15, { weight: "Semi Bold", color: WF.white });
          text(x + inner + i * sw, cy + 22, sw - 8, s.label, 11, { color: WF.onDark });
        });
        cy += 40;
      }
      if (actions.length) cy += 16 + buttonRow(x + inner, cy + 16, cw - inner * 2, actions, { light: true });
      cy += inner;
      behind(at, () => rect(x, hy, cw, cy - hy, { fill: WF.primary, radius: 20, name: "Hero card" }));
      hy = cy;
    } else {
      // stats: boxed summary with stat cards and an image on wide screens
      const inner = 16;
      const showImage = w >= 700;
      const textW = showImage ? w * 0.55 : w - inner * 2;
      const at = els.length;
      hy += inner;
      const size = roomy ? 24 : 18;
      hy += para(x + inner, hy, textW, hero.title, size, 2, { weight: "Bold" }) + 4;
      hy += para(x + inner, hy, textW, hero.subtitle, 13, 2, { color: WF.muted });
      hy += 12;
      if (stats.length > 0) {
        const sw = (textW - gap * (stats.length - 1)) / stats.length;
        stats.forEach((s: any, i: number) => {
          const sx = x + inner + i * (sw + gap);
          rect(sx, hy, sw, 60, { fill: WF.white, stroke: WF.line, radius: 8 });
          text(sx + 10, hy + 10, sw - 20, s.value, 16, { weight: "Bold" });
          text(sx + 10, hy + 34, sw - 20, s.label, 11, { color: WF.muted });
        });
        hy += 60 + 12;
      }
      if (actions.length) hy += buttonRow(x + inner, hy, textW, actions) + 12;
      const heroH = hy - top + inner - 12;
      behind(at, () => rect(x, top, w, heroH, { fill: WF.fill, radius: 12, name: "Hero / summary" }));
      if (showImage) image(x + w * 0.62, top + inner, w * 0.38 - inner, heroH - inner * 2);
      hy = top + heroH;
    }

    regions.push({ label: "Hero", text: [hero.title, hero.subtitle, ...actions, ...stats.map((s: any) => s.label)].join(" "), y: top });
    return hy;
  };

  /* ---------- Blocks. Each draws at (contentX, y) within contentW and moves y down ---------- */
  type Block = (items: any[], sec: any) => void;
  const blocks: Record<string, Block> = {
    cards: (items) => {
      const x0 = contentX;
      const w = contentW;
      const cols = clamp(Math.floor((w + gap) / ((isMobile ? 150 : 200) + gap)), 1, 4);
      const shown = items.slice(0, cols * 2);
      const cw = (w - gap * (cols - 1)) / cols;
      const imgH = Math.round(cw * 0.7);
      const hasAction = shown.some((it) => it.action);
      const hasValue = shown.some((it) => it.value);
      const titleLines = Math.max(...shown.map((it) => estLines(it.title, 13, cw - 20, 2)));
      const ch = 8 + imgH + 8 + lineH(13) * titleLines + 2 + lineH(11) + (hasValue ? 4 + lineH(15) : 0) + (hasAction ? 8 + 32 : 0) + 10;
      shown.forEach((it, i) => {
        const cx = x0 + (i % cols) * (cw + gap);
        const cy = y + Math.floor(i / cols) * (ch + gap);
        rect(cx, cy, cw, ch, { fill: WF.white, stroke: WF.line, radius: 12, name: `Card: ${str(it.title)}` });
        image(cx + 8, cy + 8, cw - 16, imgH);
        if (it.badge) pill(cx + 14, cy + 14, it.badge);
        let ty = cy + 8 + imgH + 8;
        text(cx + 10, ty, cw - 20, it.title, 13, { weight: "Medium", maxLines: titleLines });
        ty += lineH(13) * titleLines + 2;
        text(cx + 10, ty, cw - 20, it.subtitle || "", 11, { color: WF.muted });
        ty += lineH(11);
        if (hasValue) {
          text(cx + 10, ty + 4, cw - 20, it.value || "", 15, { weight: "Bold" });
          ty += 4 + lineH(15);
        }
        if (it.action) button(cx + 10, ty + 8, cw - 20, 32, it.action, false, 12);
      });
      y += Math.ceil(shown.length / cols) * (ch + gap) - gap;
    },

    carousel: (items) => {
      const x0 = contentX;
      const w = contentW;
      const cw = isMobile ? Math.round(w * 0.72) : Math.round((w - gap * 3) / 3.4);
      const imgH = Math.round(cw * 0.6);
      const hasValue = items.some((it) => it.value);
      const ch = imgH + 8 + lineH(14) + 2 + lineH(12) + (hasValue ? 2 + lineH(14) : 0);
      let cx = x0;
      for (const it of items.slice(0, 8)) {
        const visible = Math.min(cw, x0 + w - cx);
        if (visible < 40) break;
        if (visible < cw) {
          // Card cut by the screen edge shows the row scrolls
          image(cx, y, visible, imgH, 12);
          break;
        }
        image(cx, y, cw, imgH, 12);
        if (it.badge) pill(cx + 8, y + 8, it.badge);
        let ty = y + imgH + 8;
        text(cx, ty, cw, it.title, 14, { weight: "Medium" });
        ty += lineH(14) + 2;
        if (it.subtitle) {
          text(cx, ty, cw, it.subtitle, 12, { color: WF.muted });
          ty += lineH(12) + 2;
        }
        if (it.value) text(cx, ty, cw, it.value, 14, { weight: "Bold" });
        cx += cw + gap;
      }
      y += ch;
    },

    gallery: (items) => {
      const x0 = contentX;
      const w = contentW;
      const g = 4;
      const cols = isMobile ? 3 : clamp(Math.floor((w + g) / (160 + g)), 3, 6);
      const tile = (w - g * (cols - 1)) / cols;
      const n = clamp(items.length, isMobile ? cols * 3 : cols, cols * 3);
      for (let i = 0; i < n; i++) {
        const tx = x0 + (i % cols) * (tile + g);
        const ty = y + Math.floor(i / cols) * (tile + g);
        image(tx, ty, tile, tile, isMobile ? 2 : 8);
        if (items[i]?.badge) pill(tx + 6, ty + 6, items[i].badge);
      }
      y += Math.ceil(n / cols) * (tile + g) - g;
    },

    feed: (items, sec) => {
      const x0 = contentX;
      const w = contentW;
      const people = /message|inbox|chat|people|member|contact|friend|follower|team|user|notification|comment|conversation|guest|patient|student|candidate/i.test(
        str(sec.sectionTitle)
      );
      const rows = items.slice(0, 8);
      rows.forEach((it, i) => {
        const rh = 72;
        if (people) avatar(x0, y + 12, 48);
        else image(x0, y + 10, 52, 52, 8);
        const right = Math.min(w * 0.4, it.action ? btnW(it.action, 12) : it.value ? 110 : it.badge ? pillW(it.badge) : 0);
        const tx = x0 + 64;
        const tw = w - 64 - right - 8;
        text(tx, y + 14, tw, it.title, 14, { weight: "Medium" });
        text(tx, y + 37, tw, it.subtitle || "", 12, { color: WF.muted });
        if (it.action) button(x0 + w - right, y + 20, right, 32, it.action, false, 12);
        else if (it.value) {
          text(x0 + w - right, y + 14, right, it.value, 14, { weight: "Semi Bold", align: "RIGHT" });
          if (it.badge) text(x0 + w - right, y + 37, right, it.badge, 11, { color: WF.muted, align: "RIGHT" });
        } else if (it.badge) pill(x0 + w - right, y + 26, it.badge);
        y += rh;
        if (i < rows.length - 1) line(tx, y, x0 + w, y);
      });
    },

    posts: (items) => {
      const pw = contentW >= 560 ? Math.min(contentW, 600) : contentW;
      const px = contentX;
      const shown = items.slice(0, isMobile ? 2 : 3);
      shown.forEach((it, i) => {
        avatar(px, y, 40);
        text(px + 52, y + 2, pw - 100, it.title, 14, { weight: "Semi Bold" });
        text(px + 52, y + 22, pw - 100, it.badge || "2h", 12, { color: WF.muted });
        text(px + pw - 30, y + 8, 30, "···", 14, { color: WF.muted, align: "RIGHT" });
        y += 52;
        const cap = para(px, y, pw, it.subtitle, 14, 3);
        y += cap ? cap + 10 : 0;
        const ih = Math.round(Math.min(pw * 0.75, 360));
        image(px, y, pw, ih, 12);
        y += ih + 12;
        const acts = ["Like", "Comment", it.action || "Share"];
        const slot = Math.min(100, pw / 3);
        acts.forEach((a, k) => {
          icon(px + k * slot, y, 20);
          text(px + k * slot + 26, y + 2, slot - 30, a, 12, { color: WF.muted });
        });
        y += 24;
        if (i < shown.length - 1) {
          y += 16;
          line(px, y, px + pw, y);
          y += 16;
        }
      });
    },

    avatars: (items) => {
      const d = isMobile ? 64 : 72;
      const slot = d + 16;
      const n = Math.max(1, Math.min(Math.max(items.length, 4), Math.floor((contentW + 16) / slot)));
      for (let i = 0; i < n; i++) {
        const ax = contentX + i * slot;
        ellipse(ax, y, d, { stroke: i === 0 ? WF.line : WF.ink, strokeWeight: 2, name: "Avatar ring" });
        ellipse(ax + 4, y + 4, d - 8, { fill: WF.fill2 });
        if (i === 0 && /story|stories/i.test(str(items[0]?.title))) text(ax, y + d / 2 - 12, d, "+", 20, { align: "CENTER", color: WF.muted });
        text(ax - 6, y + d + 6, d + 12, items[i]?.title || "", 11, { align: "CENTER" });
      }
      y += d + 6 + lineH(11);
    },

    table: (items, sec) => {
      const x0 = contentX;
      const w = contentW;
      const rows = items.slice(0, 8);
      if (w < 560) {
        // Narrow: each row becomes a list item
        rows.forEach((it, i) => {
          const right = it.value ? 100 : it.badge ? pillW(it.badge) : 0;
          text(x0, y + 12, w - right - 28, it.title, 14, { weight: "Medium" });
          text(x0, y + 34, w - right - 28, it.subtitle || "", 12, { color: WF.muted });
          if (it.value) text(x0 + w - right - 20, y + 12, right, it.value, 14, { weight: "Semi Bold", align: "RIGHT" });
          if (it.badge) pill(x0 + w - pillW(it.badge) - 20, it.value ? y + 34 : y + 22, it.badge);
          chevron(x0 + w - 8, y + 26, "right", 8);
          y += 64;
          if (i < rows.length - 1) line(x0, y, x0 + w, y);
        });
        return;
      }
      const keys = ["title", "subtitle"];
      if (rows.some((it) => it.value)) keys.push("value");
      if (rows.some((it) => it.badge)) keys.push("badge");
      if (rows.some((it) => it.action)) keys.push("action");
      const share: Record<string, number> = { title: 0.32, subtitle: 0.3, value: 0.16, badge: 0.14, action: 0.12 };
      const total = keys.reduce((s, k) => s + share[k], 0);
      const colW = keys.map((k) => (share[k] / total) * w);
      const colX = colW.map((_, i) => x0 + colW.slice(0, i).reduce((a, b) => a + b, 0));
      const defaults: Record<string, string> = { title: "Name", subtitle: "Details", value: "Value", badge: "Status", action: "" };
      const headings = arr(sec.columns).map(str);
      rect(x0, y, w, 36, { fill: WF.fill, radius: 6, name: "Table header" });
      keys.forEach((k, i) =>
        text(colX[i] + 10, y + 10, colW[i] - 20, headings[i] ?? defaults[k], 11, { weight: "Semi Bold", color: WF.muted, align: k === "action" ? "RIGHT" : "LEFT" })
      );
      y += 36;
      rows.forEach((it) => {
        keys.forEach((k, i) => {
          const cx = colX[i] + 10;
          const cw = colW[i] - 20;
          if (k === "badge") {
            if (it.badge) pill(colX[i] + 6, y + 14, it.badge);
          } else if (k === "action") text(cx, y + 17, cw, it.action || "", 12, { weight: "Semi Bold", align: "RIGHT" });
          else
            text(cx, y + 16, cw, it[k] || (k === "subtitle" ? "—" : ""), k === "title" ? 13 : 12, {
              weight: k === "title" ? "Medium" : k === "value" ? "Semi Bold" : "Regular",
              color: k === "subtitle" ? WF.muted : WF.ink,
            });
        });
        y += 48;
        line(x0, y, x0 + w, y);
      });
    },

    form: (items) => {
      const x0 = contentX;
      const w = contentW;
      items.slice(0, 8).forEach((it, i) => {
        const label = str(it.title);
        const hint = `${label} ${str(it.subtitle)} ${str(it.action)}`;
        if (i > 0) y += 14;
        if (SUBMIT.test(label) && !it.subtitle) {
          button(x0, y, w, 48, label, true, 15);
          y += 48;
          return;
        }
        if (/agree|accept|remember me|keep me|terms|subscribe|opt in|newsletter/i.test(label)) {
          checkbox(x0, y, i % 2 === 0);
          y += Math.max(22, para(x0 + 30, y + 1, w - 30, label, 13, 2));
          return;
        }
        if (/^(enable|allow|turn on)\b|notifications?$|dark mode/i.test(label)) {
          text(x0, y + 3, w - 60, label, 14);
          toggle(x0 + w - 44, y, true);
          y += 26;
          return;
        }
        text(x0, y, w, label, 12, { weight: "Medium" });
        y += lineH(12) + 6;
        const isUpload = /upload|drop|attach|photo|file/i.test(hint);
        const isArea = !isUpload && /message|description|notes?\b|comment|bio|feedback|details|about/i.test(label);
        const fh = isUpload || isArea ? 96 : 44;
        rect(x0, y, w, fh, { fill: WF.white, stroke: WF.faint, radius: 8, dash: isUpload, name: `Input: ${label}` });
        const btn = it.action ? btnW(it.action, 12) : 0;
        const isPassword = /password|passcode|\bpin\b/i.test(label);
        const placeholder = isPassword ? "••••••••" : it.subtitle || `Enter ${label.toLowerCase()}`;
        text(x0 + 14, y + (fh > 44 ? 14 : 13), w - 28 - btn - 28, placeholder, 13, { color: WF.faint, maxLines: fh > 44 ? 2 : 1 });
        if (it.action) button(x0 + w - btn - 6, y + fh - 38, btn, 32, it.action, false, 12);
        else if (/select|choose|country|region|category|type\b|size|plan|language|currency|role|gender|state/i.test(label))
          chevron(x0 + w - 28, y + 19, "down", 10);
        else if (/date|time\b|when|birthday|birth|expiry|check-in|check-out/i.test(label))
          rect(x0 + w - 32, y + 13, 18, 18, { stroke: WF.muted, strokeWeight: 1.5, radius: 3, name: "Calendar icon" });
        else if (isPassword) icon(x0 + w - 34, y + 12, 20, WF.muted);
        y += fh;
        if (it.badge) {
          text(x0, y + 4, w, it.badge, 11, { color: WF.muted });
          y += lineH(11) + 4;
        }
      });
    },

    settings: (items) => {
      const x0 = contentX;
      const w = contentW;
      const rows = items.slice(0, 8);
      const rowH = (it: any) => (it.subtitle ? 64 : 52);
      rect(x0, y, w, rows.reduce((s, it) => s + rowH(it), 0), { fill: WF.white, stroke: WF.line, radius: 12, name: "Settings group" });
      rows.forEach((it, i) => {
        const h = rowH(it);
        if (i > 0) line(x0 + 56, y, x0 + w, y);
        glyph(x0 + 16, y + (h - 24) / 2, 24, { stroke: WF.muted });
        const badge = str(it.badge);
        const isToggle =
          /^(on|off|enabled|disabled|toggle|switch)$/i.test(badge) ||
          (!badge && !it.value && !it.action && /notification|dark mode|enable|allow|sync|location|face id|touch id|biometric|auto/i.test(str(it.title)));
        const rightW = isToggle ? 56 : Math.min(w * 0.4, it.action ? btnW(it.action, 12) : 150);
        const tx = x0 + 56;
        const tw = w - 56 - rightW - 16;
        if (it.subtitle) {
          text(tx, y + 12, tw, it.title, 14);
          text(tx, y + 34, tw, it.subtitle, 12, { color: WF.muted });
        } else text(tx, y + 16, tw, it.title, 14);
        if (isToggle) toggle(x0 + w - 60, y + (h - 26) / 2, !/off|disabled/i.test(badge));
        else if (it.action) text(x0 + w - rightW - 16, y + (h - 17) / 2, rightW, it.action, 13, { weight: "Semi Bold", align: "RIGHT" });
        else {
          const v = it.value || badge;
          if (v) text(x0 + w - 36 - (rightW - 30), y + (h - 17) / 2, rightW - 30, v, 13, { color: WF.muted, align: "RIGHT" });
          chevron(x0 + w - 24, y + h / 2 - 4, "right", 8);
        }
        y += h;
      });
    },

    detail: (items) => {
      const x0 = contentX;
      const w = contentW;
      const roomy = w >= 560;
      const [main, ...rest] = items;
      const ih = roomy ? 280 : 200;
      image(x0, y, w, ih, 12);
      if (main.badge) pill(x0 + 12, y + 12, main.badge);
      y += ih + 14;
      y += para(x0, y, w, main.title, 20, 2, { weight: "Bold" }) + 4;
      if (main.value) {
        text(x0, y, w, main.value, 20, { weight: "Bold" });
        y += lineH(20) + 4;
      }
      if (main.subtitle) y += para(x0, y, w, main.subtitle, 13, 3, { color: WF.muted }) + 8;
      rest.slice(0, 5).forEach((it) => {
        text(x0, y + 10, w * 0.5, it.title, 13, { color: WF.muted });
        text(x0 + w * 0.5, y + 10, w * 0.5, it.value || it.subtitle || it.badge || "—", 13, { weight: "Medium", align: "RIGHT" });
        y += 40;
        line(x0, y, x0 + w, y);
      });
      if (main.action) {
        y += 14;
        button(x0, y, w, 48, main.action, true, 15);
        y += 48;
      }
    },

    summary: (items) => {
      const x0 = contentX;
      const w = contentW;
      const at = els.length;
      const top = y;
      const inner = 16;
      y += inner - 4;
      const isTotal = (it: any) => !/sub-?total/i.test(str(it.title)) && /\btotal\b|amount due|balance due|you pay|to pay/i.test(str(it.title));
      const action = [...items].reverse().find((it) => it.action)?.action;
      items.slice(0, 10).forEach((it) => {
        const big = isTotal(it);
        if (big) {
          y += 6;
          line(x0 + inner, y, x0 + w - inner, y);
          y += 10;
        }
        const size = big ? 16 : 13;
        text(x0 + inner, y + 8, w * 0.6 - inner, it.title, size, { color: big ? WF.ink : WF.muted, weight: big ? "Bold" : "Regular" });
        text(x0 + w * 0.4, y + 8, w * 0.6 - inner, it.value || it.subtitle || it.badge || "", size, { weight: big ? "Bold" : "Medium", align: "RIGHT" });
        y += big ? 40 : 34;
      });
      if (action) {
        y += 8;
        button(x0 + inner, y, w - inner * 2, 48, action, true, 15);
        y += 48;
      }
      y += inner;
      behind(at, () => rect(x0, top, w, y - top, { fill: WF.white, stroke: WF.line, radius: 12, name: "Summary" }));
    },

    cart: (items) => {
      const x0 = contentX;
      const w = contentW;
      const rows = items.slice(0, 5);
      const thumb = w < 320 ? 48 : 72;
      rows.forEach((it, i) => {
        image(x0, y, thumb, thumb, 8);
        const tw = w - thumb - 12 - 108;
        text(x0 + thumb + 12, y + 2, tw, it.title, 14, { weight: "Medium", maxLines: 2 });
        text(x0 + thumb + 12, y + 42, tw, it.subtitle || "", 12, { color: WF.muted });
        text(x0 + w - 100, y + 2, 100, it.value || "", 15, { weight: "Bold", align: "RIGHT" });
        const sx = x0 + w - 100;
        rect(sx, y + 40, 100, 32, { stroke: WF.line, radius: 16, name: "Quantity stepper" });
        text(sx + 8, y + 46, 24, "-", 15, { align: "CENTER" });
        text(sx + 38, y + 47, 24, it.badge || "1", 14, { align: "CENTER", weight: "Semi Bold" });
        text(sx + 68, y + 46, 24, "+", 15, { align: "CENTER" });
        y += 72;
        if (i < rows.length - 1) {
          y += 14;
          line(x0, y, x0 + w, y);
          y += 14;
        }
      });
    },

    chart: (items, sec) => {
      const x0 = contentX;
      const w = contentW;
      const title = `${str(sec.sectionTitle)} ${items.map((it) => str(it.title)).join(" ")}`;
      const kind = /share|split|breakdown|mix|allocation|distribution|composition|portfolio|\bby (plan|category|channel|region|source|type|segment|device|country|product|status|team)/i.test(title)
        ? "donut"
        : /trend|over time|growth|history|daily|weekly|monthly|line/i.test(title)
          ? "line"
          : "bar";
      const ch = w >= 560 ? 240 : 200;
      rect(x0, y, w, ch, { fill: WF.white, stroke: WF.line, radius: 12, name: `Chart (${kind})` });
      const pts = items.slice(0, 8);
      if (kind === "donut") {
        const d = ch - 56;
        ellipse(x0 + 28 + 12, y + 28 + 12, d - 24, { stroke: WF.fill2, strokeWeight: 24, name: "Donut" });
        text(x0 + 28, y + 28 + d / 2 - 14, d, pts[0]?.value || "", 18, { weight: "Bold", align: "CENTER" });
        const shades = [WF.ink, WF.primary, WF.muted, WF.faint, WF.line];
        pts.slice(0, 5).forEach((it, i) => {
          const ly = y + 32 + i * 30;
          const lx = x0 + d + 64;
          rect(lx, ly + 3, 12, 12, { fill: shades[i], radius: 3 });
          text(lx + 20, ly, w - d - 180, it.title, 13);
          text(x0 + w - 100, ly, 80, it.value || "", 13, { weight: "Semi Bold", align: "RIGHT" });
        });
      } else {
        const ax = x0 + 40;
        const plotW = w - 60;
        const base = y + ch - 36;
        const plotH = ch - 60;
        line(ax, y + 20, ax, base);
        line(ax, base, ax + plotW, base);
        [0.33, 0.66].forEach((f) => line(ax, base - plotH * f, ax + plotW, base - plotH * f, { stroke: WF.fill2 }));
        const heights = [0.55, 0.8, 0.4, 0.95, 0.65, 0.75, 0.5, 0.85];
        const slot = plotW / Math.max(1, pts.length);
        let prev: { x: number; y: number } | null = null;
        pts.forEach((it, i) => {
          const hgt = plotH * heights[i % heights.length];
          if (kind === "bar") {
            const bw = Math.min(48, slot * 0.6);
            rect(ax + i * slot + (slot - bw) / 2, base - hgt, bw, hgt, { fill: i === 0 ? WF.primary : WF.fill2, radius: 4 });
          } else {
            const p = { x: ax + i * slot + slot / 2, y: base - hgt };
            if (prev) line(prev.x, prev.y, p.x, p.y, { stroke: WF.ink, strokeWeight: 2 });
            prev = p;
          }
          text(ax + i * slot, base + 8, slot, it.title, 10, { color: WF.muted, align: "CENTER" });
        });
        if (kind === "line") pts.forEach((_, i) => ellipse(ax + i * slot + slot / 2 - 4, base - plotH * heights[i % heights.length] - 4, 8, { fill: WF.white, stroke: WF.ink, strokeWeight: 2 }));
      }
      y += ch;
    },

    stats: (items) => {
      const x0 = contentX;
      const w = contentW;
      const cols = isMobile ? 2 : clamp(Math.floor((w + gap) / (200 + gap)), 2, 4);
      const shown = items.slice(0, cols * 2);
      const tw = (w - gap * (cols - 1)) / cols;
      const th = 100;
      shown.forEach((it, i) => {
        const tx = x0 + (i % cols) * (tw + gap);
        const ty = y + Math.floor(i / cols) * (th + gap);
        rect(tx, ty, tw, th, { fill: WF.white, stroke: WF.line, radius: 12, name: `Stat: ${str(it.title)}` });
        text(tx + 14, ty + 14, tw - 28, it.title, 12, { color: WF.muted });
        text(tx + 14, ty + 36, tw - 28, it.value || it.subtitle || "—", 22, { weight: "Bold" });
        if (it.badge) pill(tx + 14, ty + 68, it.badge);
        if (tw >= 180) {
          // Sparkline
          const sx = tx + tw - 74;
          const ys = [0.6, 0.3, 0.5, 0.2, 0.35, 0.1];
          for (let k = 0; k < ys.length - 1; k++) line(sx + k * 12, ty + 66 + ys[k] * 24, sx + (k + 1) * 12, ty + 66 + ys[k + 1] * 24, { stroke: WF.ink, strokeWeight: 1.5 });
        }
      });
      y += Math.ceil(shown.length / cols) * (th + gap) - gap;
    },

    kanban: (items) => {
      const x0 = contentX;
      const w = contentW;
      const cols = items.slice(0, 5);
      const colW = w >= 560 ? Math.max(220, (w - gap * (cols.length - 1)) / cols.length) : Math.round(w * 0.8);
      const counts = cols.map((it, i) => clamp(parseInt(str(it.value), 10) || [3, 2, 4, 2, 1][i], 1, 4));
      const cardH = 76;
      const colH = 44 + Math.max(...counts) * (cardH + 8) + 36;
      cols.forEach((it, i) => {
        const cx = x0 + i * (colW + gap);
        const visible = Math.min(colW, x0 + w - cx);
        if (visible < 40) return;
        rect(cx, y, visible, colH, { fill: WF.fill, radius: 12, name: `Column: ${str(it.title)}` });
        text(cx + 12, y + 12, visible - 60, it.title, 13, { weight: "Semi Bold" });
        if (visible < colW) return;
        text(cx + colW - 44, y + 13, 32, String(counts[i]), 12, { color: WF.muted, align: "RIGHT" });
        for (let k = 0; k < counts[i]; k++) {
          const ky = y + 44 + k * (cardH + 8);
          rect(cx + 8, ky, colW - 16, cardH, { fill: WF.white, stroke: WF.line, radius: 8, name: "Task card" });
          bar(cx + 20, ky + 14, (colW - 40) * (0.8 - (k % 3) * 0.12), 10);
          bar(cx + 20, ky + 32, (colW - 40) * 0.5);
          if (k === 0 && it.badge) pill(cx + 20, ky + 48, it.badge);
          avatar(cx + colW - 44, ky + cardH - 32, 20);
        }
        text(cx + 12, y + colH - 28, colW - 24, "+ Add card", 12, { color: WF.muted });
      });
      y += colH;
    },

    calendar: (items) => {
      const x0 = contentX;
      const w = contentW;
      const roomy = w >= 560;
      chevron(x0 + w - 44, y + 4, "left", 12, WF.ink);
      chevron(x0 + w - 14, y + 4, "right", 12, WF.ink);
      y += 24;
      const cell = w / 7;
      ["M", "T", "W", "T", "F", "S", "S"].forEach((d, i) => text(x0 + i * cell, y, cell, d, 11, { color: WF.muted, align: "CENTER", weight: "Semi Bold" }));
      y += 24;
      const offset = 2;
      const today = 14;
      const eventDays = [3, 8, 9, 14, 17, 22, 24, 28];
      const events = items.slice(0, 8);
      const cellH = roomy ? 92 : 44;
      for (let i = 0; i < 35; i++) {
        const day = i - offset + 1;
        const cx = x0 + (i % 7) * cell;
        const cy = y + Math.floor(i / 7) * cellH;
        if (roomy) {
          rect(cx, cy, cell, cellH, { stroke: WF.line, fill: day === today ? WF.fill : undefined });
          if (day >= 1 && day <= 31) text(cx + 8, cy + 6, 30, String(day), 12, { weight: day === today ? "Bold" : "Regular", color: day === today ? WF.ink : WF.muted });
          const ev = eventDays.indexOf(day);
          if (ev !== -1 && events[ev]) {
            rect(cx + 4, cy + 30, cell - 8, 22, { fill: ev === 0 ? WF.primary : WF.fill2, radius: 4, name: "Event" });
            text(cx + 8, cy + 34, cell - 16, events[ev].title, 10, { color: ev === 0 ? WF.white : WF.ink });
          }
        } else if (day >= 1 && day <= 31) {
          if (day === today) ellipse(cx + cell / 2 - 17, cy + 2, 34, { fill: WF.ink });
          text(cx, cy + 10, cell, String(day), 14, { align: "CENTER", color: day === today ? WF.white : WF.ink, weight: day === today ? "Semi Bold" : "Regular" });
          if (eventDays.slice(0, events.length).includes(day) && day !== today) ellipse(cx + cell / 2 - 2, cy + 34, 4, { fill: WF.ink });
        }
      }
      y += 5 * cellH;
      if (!roomy) {
        // Agenda for the selected day
        y += 16;
        events.slice(0, 4).forEach((it) => {
          text(x0, y + 4, 56, it.value || it.badge || "9:00", 12, { color: WF.muted });
          rect(x0 + 64, y, w - 64, 56, { fill: WF.fill, radius: 10, name: `Event: ${str(it.title)}` });
          rect(x0 + 64, y, 4, 56, { fill: WF.ink, radius: 2 });
          text(x0 + 80, y + 9, w - 96, it.title, 14, { weight: "Medium" });
          text(x0 + 80, y + 31, w - 96, it.subtitle || "", 12, { color: WF.muted });
          y += 64;
        });
        y -= 8;
      }
    },

    timeline: (items) => {
      const x0 = contentX;
      const w = contentW;
      const rows = items.slice(0, 7);
      const cur = rows.findIndex((it) => /current|now|in progress|active|today|on the way/i.test(str(it.badge)));
      const at = els.length;
      const top = y;
      let lastDot = y;
      rows.forEach((it, i) => {
        const done = cur === -1 ? i === 0 : i <= cur;
        lastDot = y;
        ellipse(x0, y + 2, 16, { fill: done ? WF.ink : WF.white, stroke: done ? WF.ink : WF.faint, strokeWeight: 2, name: "Step dot" });
        const timeW = w >= 400 ? 110 : 0;
        text(x0 + 32, y, w - 32 - timeW, it.title, 14, { weight: i === cur ? "Bold" : "Medium" });
        if (timeW) text(x0 + w - timeW, y + 1, timeW, it.value || (i === cur ? "" : it.badge) || "", 12, { color: WF.muted, align: "RIGHT" });
        let ry = y + lineH(14) + 2;
        ry += para(x0 + 32, ry, w - 32 - timeW, it.subtitle, 12, 2, { color: WF.muted });
        if (!timeW && it.value) {
          text(x0 + 32, ry, w - 32, it.value, 11, { color: WF.faint });
          ry += lineH(11);
        }
        y = ry + 20;
      });
      y -= 20;
      // Connecting line goes behind the dots
      if (rows.length > 1) behind(at, () => rect(x0 + 7, top + 10, 2, lastDot - top, { fill: WF.line, name: "Timeline" }));
    },

    chat: (items) => {
      const x0 = contentX;
      const w = contentW;
      text(x0, y, w, "Today", 11, { color: WF.muted, align: "CENTER" });
      y += 28;
      const marked = items.some((it) => /\b(me|you|sent|outgoing|user)\b/i.test(str(it.badge)));
      const maxW = Math.min(w * 0.75, 440);
      items.slice(0, 8).forEach((it, i) => {
        const mine = marked ? /\b(me|you|sent|outgoing|user)\b/i.test(str(it.badge)) : i % 2 === 1;
        const msg = str(it.title);
        const bw = clamp(msg.length * 14 * 0.55 + 28, 64, maxW);
        const n = estLines(msg, 14, bw - 28, 6);
        const bh = n * lineH(14) + 20;
        const bx = mine ? x0 + w - bw : x0 + 36;
        if (!mine) avatar(x0, y + bh - 28, 28);
        rect(bx, y, bw, bh, { fill: mine ? WF.primary : WF.fill, radius: 16, name: mine ? "Sent message" : "Received message" });
        text(bx + 14, y + 10, bw - 28, msg, 14, { color: mine ? WF.white : WF.ink, maxLines: n });
        y += bh;
        if (it.subtitle) {
          text(bx, y + 4, bw, it.subtitle, 10, { color: WF.muted, align: mine ? "RIGHT" : "LEFT" });
          y += 18;
        }
        y += 10;
      });
      // Composer
      y += 6;
      icon(x0, y + 10, 24, WF.muted);
      rect(x0 + 36, y, w - 36 - 52, 44, { fill: WF.fill, radius: 22, name: "Message input" });
      text(x0 + 52, y + 13, w - 150, "Message…", 14, { color: WF.faint });
      ellipse(x0 + w - 44, y, 44, { fill: WF.ink, name: "Send" });
      play(x0 + w - 27, y + 15, 14);
      y += 44;
    },

    media: (items, sec) => {
      const x0 = contentX;
      const w = contentW;
      const roomy = w >= 560;
      const [main, ...rest] = items;
      const about = `${titleText} ${str(sec.sectionTitle)} ${str(main.title)} ${str(main.subtitle)} ${str(main.badge)}`;
      const audio =
        /audio|song|track|music|podcast|album|episode|playlist|radio|artist|listen|now playing/i.test(about) &&
        !/video|watch|movie|film|lesson|course|trailer|stream|webinar/i.test(about);
      const mw = audio ? Math.min(w, roomy ? 360 : w - 32) : w;
      const mh = audio ? mw : Math.round(Math.min(mw * 0.5625, 480));
      const mx = x0 + (w - mw) / 2;
      image(mx, y, mw, mh, 12);
      if (!audio) {
        ellipse(mx + mw / 2 - 32, y + mh / 2 - 32, 64, { fill: WF.white, opacity: 0.9, name: "Play" });
        play(mx + mw / 2 - 8, y + mh / 2 - 12, 24, WF.ink);
      }
      y += mh + 16;
      const align = audio ? "CENTER" : "LEFT";
      y += para(x0, y, w, main.title, 18, 2, { weight: "Bold", align }) + 2;
      y += para(x0, y, w, main.subtitle, 13, 2, { color: WF.muted, align });
      y += 16;
      rect(x0, y, w, 4, { fill: WF.fill2, radius: 2, name: "Progress" });
      rect(x0, y, w * 0.35, 4, { fill: WF.ink, radius: 2 });
      ellipse(x0 + w * 0.35 - 6, y - 4, 12, { fill: WF.ink });
      text(x0, y + 12, 60, "1:24", 11, { color: WF.muted });
      text(x0 + w - 60, y + 12, 60, main.value || "3:45", 11, { color: WF.muted, align: "RIGHT" });
      y += 36;
      if (audio || !roomy) {
        const cx = x0 + w / 2;
        if (w >= 300) {
          icon(cx - 132, y + 22, 20, WF.muted);
          icon(cx + 112, y + 22, 20, WF.muted);
        }
        icon(cx - 76, y + 18, 28);
        ellipse(cx - 32, y, 64, { fill: WF.ink, name: "Play" });
        play(cx - 7, y + 20, 24);
        icon(cx + 48, y + 18, 28);
        y += 64;
      } else if (main.action) {
        button(x0, y, btnW(main.action, 14) + 16, 40, main.action, true, 14);
        y += 40;
      }
      if (rest.length) {
        y += 24;
        text(x0, y, w, "Up next", 14, { weight: "Semi Bold" });
        y += lineH(14) + 8;
        rest.slice(0, 4).forEach((it) => {
          const tw = audio ? 48 : 96;
          image(x0, y, tw, 48 * (audio ? 1 : 0.6) + (audio ? 0 : 6), 6);
          text(x0 + tw + 12, y + 4, w - tw - 80, it.title, 13, { weight: "Medium" });
          text(x0 + tw + 12, y + 24, w - tw - 80, it.subtitle || "", 11, { color: WF.muted });
          text(x0 + w - 60, y + 4, 60, it.value || "", 11, { color: WF.muted, align: "RIGHT" });
          y += 60;
        });
        y -= 8;
      }
    },

    map: (items) => {
      const mh = contentW >= 560 ? 320 : 220;
      const pts = mapArt(contentX, y, contentW, mh, items.length);
      items.slice(0, 3).forEach((it, i) => {
        const p = pts[i];
        if (p) {
          const lw = pillW(it.title);
          const lx = clamp(p.x + 14, contentX + 4, contentX + contentW - lw - 4);
          pill(lx, p.y - 26, it.title, i === 0);
        }
      });
      y += mh;
    },

    pricing: (items) => {
      const x0 = contentX;
      const w = contentW;
      const plans = items.slice(0, 4);
      const roomy = w >= 560;
      const cols = roomy ? plans.length : 1;
      const pg = 16;
      const pw = (w - pg * (cols - 1)) / cols;
      const feats = plans.map((it) =>
        str(it.subtitle)
          .split(/[,;•\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 5)
      );
      const ph = 24 + lineH(16) + 8 + lineH(30) + 16 + Math.max(...feats.map((f) => f.length), 1) * 26 + 16 + 44 + 24;
      plans.forEach((it, i) => {
        const px = roomy ? x0 + i * (pw + pg) : x0;
        const py = roomy ? y : y + i * (ph + pg);
        const popular = /popular|recommended|best|most/i.test(str(it.badge));
        rect(px, py, pw, ph, { fill: WF.white, stroke: popular ? WF.ink : WF.line, strokeWeight: popular ? 2 : 1, radius: 16, name: `Plan: ${str(it.title)}` });
        let cy = py + 24;
        text(px + 20, cy, pw - 40 - (it.badge ? 100 : 0), it.title, 16, { weight: "Semi Bold" });
        if (it.badge) pill(px + pw - 20 - pillW(it.badge), cy, it.badge, popular);
        cy += lineH(16) + 8;
        text(px + 20, cy, pw - 40, it.value || "", 30, { weight: "Bold" });
        cy += lineH(30) + 16;
        feats[i].forEach((f) => {
          check(px + 20, cy + 3, 12, WF.ink);
          text(px + 42, cy, pw - 62, f, 13);
          cy += 26;
        });
        button(px + 20, py + ph - 24 - 44, pw - 40, 44, it.action || "Choose plan", popular, 14);
      });
      y += roomy ? ph : plans.length * (ph + pg) - pg;
    },

    features: (items) => {
      const x0 = contentX;
      const w = contentW;
      const shown = items.slice(0, 9);
      if (w >= 560) {
        const cols = Math.min(shown.length === 4 ? 2 : 3, clamp(Math.floor((w + 24) / (240 + 24)), 1, 4));
        const cw = (w - 24 * (cols - 1)) / cols;
        const ch = 44 + 14 + lineH(16) + 6 + lineH(13) * 3;
        shown.forEach((it, i) => {
          const cx = x0 + (i % cols) * (cw + 24);
          const cy = y + Math.floor(i / cols) * (ch + 28);
          glyph(cx, cy, 44, { fill: WF.fill2, stroke: undefined });
          text(cx, cy + 58, cw, it.title, 16, { weight: "Semi Bold" });
          para(cx, cy + 58 + lineH(16) + 6, cw, it.subtitle, 13, 3, { color: WF.muted });
        });
        y += Math.ceil(shown.length / cols) * (ch + 28) - 28;
      } else {
        shown.forEach((it, i) => {
          glyph(x0, y, 40, { fill: WF.fill2, stroke: undefined });
          text(x0 + 56, y, w - 56, it.title, 15, { weight: "Semi Bold" });
          const h = para(x0 + 56, y + lineH(15) + 4, w - 56, it.subtitle, 13, 3, { color: WF.muted });
          y += Math.max(40, lineH(15) + 4 + h);
          if (i < shown.length - 1) y += 20;
        });
      }
    },

    steps: (items) => {
      const x0 = contentX;
      const w = contentW;
      const n = Math.min(items.length, 6);
      const found = items.findIndex((it) => /current|active|now|in progress/i.test(str(it.badge)));
      const cur = found === -1 ? 0 : found;
      if (w < 560 && n > 4) {
        text(x0, y, w * 0.5, `Step ${cur + 1} of ${n}`, 12, { color: WF.muted });
        text(x0 + w * 0.4, y, w * 0.6, items[cur].title, 13, { weight: "Semi Bold", align: "RIGHT" });
        y += lineH(13) + 8;
        rect(x0, y, w, 6, { fill: WF.fill2, radius: 3, name: "Progress" });
        rect(x0, y, (w * (cur + 1)) / n, 6, { fill: WF.ink, radius: 3 });
        y += 6;
        return;
      }
      const slot = w / n;
      items.slice(0, n).forEach((it, i) => {
        const cx = x0 + slot * i + slot / 2 - 14;
        if (i < n - 1) line(cx + 34, y + 14, cx + slot - 6, y + 14, { stroke: i < cur ? WF.ink : WF.line, strokeWeight: 2 });
        if (i < cur) {
          ellipse(cx, y, 28, { fill: WF.ink, name: "Step done" });
          check(cx + 8, y + 9, 12);
        } else {
          ellipse(cx, y, 28, { fill: WF.white, stroke: i === cur ? WF.ink : WF.line, strokeWeight: 2, name: i === cur ? "Current step" : "Step" });
          text(cx, y + 6, 28, String(i + 1), 12, { align: "CENTER", weight: "Semi Bold", color: i === cur ? WF.ink : WF.muted });
        }
        text(x0 + slot * i + 4, y + 36, slot - 8, it.title, w >= 560 ? 12 : 11, { align: "CENTER", weight: i === cur ? "Semi Bold" : "Regular", color: i <= cur ? WF.ink : WF.muted });
      });
      y += 36 + lineH(12);
    },

    tabs: (items) => {
      const x0 = contentX;
      const w = contentW;
      const shown = items.slice(0, w >= 560 ? 7 : 4);
      const found = shown.findIndex((it) => /active|selected|current/i.test(str(it.badge)));
      const active = found === -1 ? 0 : found;
      if (w >= 560) {
        let tx = x0;
        shown.forEach((it, i) => {
          const tw = Math.min(200, 24 + str(it.title).length * 7.5);
          if (tx + tw > x0 + w) return;
          text(tx, y + 10, tw, it.title, 14, { weight: i === active ? "Semi Bold" : "Regular", color: i === active ? WF.ink : WF.muted });
          if (i === active) rect(tx, y + 38, tw - 24, 3, { fill: WF.ink, radius: 2 });
          tx += tw + 8;
        });
        line(x0, y + 41, x0 + w, y + 41);
        y += 42;
      } else {
        rect(x0, y, w, 40, { fill: WF.fill, radius: 10, name: "Segmented control" });
        const sw = (w - 8) / shown.length;
        shown.forEach((it, i) => {
          if (i === active) rect(x0 + 4 + i * sw, y + 4, sw, 32, { fill: WF.white, stroke: WF.line, radius: 8 });
          text(x0 + 4 + i * sw, y + 11, sw, it.title, 13, { align: "CENTER", weight: i === active ? "Semi Bold" : "Regular", color: i === active ? WF.ink : WF.muted });
        });
        y += 40;
      }
    },

    chips: (items) => {
      const x0 = contentX;
      const w = contentW;
      const marked = items.some((it) => /selected|active|\bon\b/i.test(str(it.badge)));
      let cx = x0;
      items.slice(0, 16).forEach((it, i) => {
        const cw = Math.min(w, 28 + str(it.title).length * 7.5);
        if (cx + cw > x0 + w) {
          cx = x0;
          y += 42;
        }
        const on = marked ? /selected|active|\bon\b/i.test(str(it.badge)) : i === 0;
        rect(cx, y, cw, 34, { fill: on ? WF.ink : WF.white, stroke: on ? undefined : WF.line, radius: 17, name: `Chip: ${str(it.title)}` });
        text(cx + 8, y + 9, cw - 16, it.title, 13, { align: "CENTER", color: on ? WF.white : WF.ink, weight: on ? "Semi Bold" : "Regular" });
        cx += cw + 8;
      });
      y += 34;
    },

    checklist: (items) => {
      const x0 = contentX;
      const w = contentW;
      const rows = items.slice(0, 8);
      const marked = rows.some((it) => /done|complete|checked|finished/i.test(str(it.badge)));
      const isDone = (it: any, i: number) => (marked ? /done|complete|checked|finished/i.test(str(it.badge)) : i < Math.ceil(rows.length / 2));
      const doneCount = rows.filter(isDone).length;
      text(x0, y, w, `${doneCount} of ${rows.length} completed`, 12, { color: WF.muted });
      y += lineH(12) + 8;
      rect(x0, y, w, 6, { fill: WF.fill2, radius: 3, name: "Progress" });
      rect(x0, y, (w * doneCount) / Math.max(1, rows.length), 6, { fill: WF.ink, radius: 3 });
      y += 18;
      rows.forEach((it, i) => {
        const done = isDone(it, i);
        const h = it.subtitle ? 60 : 48;
        checkbox(x0, y + (h - 22) / 2, done, 22);
        const right = it.value || (!marked && it.badge) ? 100 : 0;
        text(x0 + 36, y + (it.subtitle ? 10 : 14), w - 36 - right, it.title, 14, { color: done ? WF.muted : WF.ink, weight: done ? "Regular" : "Medium" });
        if (it.subtitle) text(x0 + 36, y + 32, w - 36 - right, it.subtitle, 12, { color: WF.muted });
        if (right) text(x0 + w - right, y + (h - 16) / 2, right, it.value || it.badge, 12, { color: WF.muted, align: "RIGHT" });
        y += h;
        if (i < rows.length - 1) line(x0 + 36, y, x0 + w, y);
      });
    },

    accordion: (items) => {
      const x0 = contentX;
      const w = contentW;
      const rows = items.slice(0, 8);
      rows.forEach((it, i) => {
        const open = i === 0;
        text(x0, y + 16, w - 40, it.title, 15, { weight: open ? "Semi Bold" : "Medium" });
        text(x0 + w - 24, y + 14, 24, open ? "-" : "+", 18, { align: "CENTER", color: WF.muted });
        y += 16 + lineH(15) + 16;
        if (open && it.subtitle) {
          y -= 6;
          y += para(x0, y, w - 40, it.subtitle, 13, 4, { color: WF.muted }) + 16;
        }
        if (i < rows.length - 1) line(x0, y, x0 + w, y);
      });
    },

    article: (items) => {
      const x0 = contentX;
      const tw = contentW >= 560 ? Math.min(contentW, 720) : contentW;
      items.slice(0, 8).forEach((it, i) => {
        if (i > 0) y += 20;
        if (it.subtitle) {
          y += para(x0, y, tw, it.title, 18, 2, { weight: "Semi Bold" }) + 8;
          y += para(x0, y, tw, it.subtitle, 15, 10);
        } else y += para(x0, y, tw, it.title, 15, 10);
        if (i === 0 && items.length >= 3) {
          y += 20;
          image(x0, y, tw, Math.round(tw * 0.5), 12);
          y += Math.round(tw * 0.5);
        }
      });
    },

    reviews: (items) => {
      const x0 = contentX;
      const w = contentW;
      const shown = items.slice(0, w >= 560 ? 3 : 4);
      const rating = (it: any) => clamp(Math.round(parseFloat(str(it.value)) || 5), 1, 5);
      if (w >= 560) {
        const cols = shown.length;
        const cw = (w - 16 * (cols - 1)) / cols;
        const ch = 24 + 11 + 14 + lineH(14) * 4 + 20 + 40 + 20;
        shown.forEach((it, i) => {
          const cx = x0 + i * (cw + 16);
          rect(cx, y, cw, ch, { fill: WF.white, stroke: WF.line, radius: 12, name: `Review: ${str(it.title)}` });
          stars(cx + 20, y + 24, rating(it));
          para(cx + 20, y + 49, cw - 40, it.subtitle, 14, 4);
          avatar(cx + 20, y + ch - 60, 40);
          text(cx + 72, y + ch - 56, cw - 92, it.title, 13, { weight: "Semi Bold" });
          text(cx + 72, y + ch - 36, cw - 92, it.badge || "", 12, { color: WF.muted });
        });
        y += ch;
      } else {
        shown.forEach((it, i) => {
          avatar(x0, y, 36);
          text(x0 + 48, y + 1, w - 48 - 80, it.title, 14, { weight: "Semi Bold" });
          text(x0 + 48, y + 20, w - 48 - 80, it.badge || "", 11, { color: WF.muted });
          stars(x0 + w - 68, y + 4, rating(it));
          y += 46;
          y += para(x0, y, w, it.subtitle, 13, 3);
          if (i < shown.length - 1) {
            y += 14;
            line(x0, y, x0 + w, y);
            y += 14;
          }
        });
      }
    },

    cta: (items, sec) => {
      const x0 = contentX;
      const w = contentW;
      const roomy = w >= 560;
      const at = els.length;
      const top = y;
      const inner = roomy ? 40 : 24;
      const first = items[0] || {};
      const actions = items.map((it) => str(it.action)).filter(Boolean).slice(0, 2);
      const tw = roomy && actions.length ? w * 0.6 : w - inner * 2;
      let cy = top + inner;
      cy += para(x0 + inner, cy, tw, sec.sectionTitle, roomy ? 28 : 22, 2, { weight: "Bold" }) + 6;
      cy += para(x0 + inner, cy, tw, first.subtitle || first.title, 14, 3, { color: WF.muted });
      if (roomy && actions.length) {
        const aw = actions.reduce((s, a) => s + btnW(a, 14) + 16 + gap, -gap);
        const by = top + Math.max(inner, (cy + inner - top - 44) / 2);
        buttonRow(x0 + w - inner - aw, by, aw, actions);
      } else if (actions.length) cy += 20 + buttonRow(x0 + inner, cy + 20, w - inner * 2, actions, { stack: isMobile });
      y = cy + inner;
      behind(at, () => rect(x0, top, w, y - top, { fill: WF.fill2, radius: 16, name: "Call to action" }));
    },

    keypad: (items) => {
      const x0 = contentX;
      const w = contentW;
      const main = items[0] || {};
      if (main.subtitle) {
        text(x0, y, w, main.subtitle, 13, { color: WF.muted, align: "CENTER" });
        y += lineH(13) + 6;
      }
      text(x0, y, w, main.value || main.title || "$0.00", 40, { weight: "Bold", align: "CENTER" });
      y += lineH(40) + 8;
      if (main.badge) {
        const bw = pillW(main.badge);
        pill(x0 + (w - bw) / 2, y, main.badge);
        y += 28;
      }
      y += 16;
      const kw = Math.min(w, 360);
      const kx = x0 + (w - kw) / 2;
      const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "Del"];
      keys.forEach((k, i) => {
        const cx = kx + (i % 3) * (kw / 3);
        const cy = y + Math.floor(i / 3) * 60;
        text(cx, cy + 14, kw / 3, k, k === "Del" ? 14 : 24, { align: "CENTER", weight: "Medium", color: k === "Del" ? WF.muted : WF.ink });
      });
      y += 4 * 60;
      if (main.action) {
        y += 12;
        button(kx, y, kw, 52, main.action, true, 16);
        y += 52;
      }
    },

    shortcuts: (items) => {
      const x0 = contentX;
      const w = contentW;
      const roomy = w >= 560;
      const perRow = roomy ? clamp(Math.floor(w / 96), 4, 8) : 4;
      const shown = items.slice(0, perRow * 2);
      const slot = roomy ? 96 : w / perRow;
      const d = 52;
      shown.forEach((it, i) => {
        const sx = x0 + (i % perRow) * slot;
        const sy = y + Math.floor(i / perRow) * (d + 40);
        ellipse(sx + (slot - d) / 2, sy, d, { fill: WF.fill, name: `Shortcut: ${str(it.title)}` });
        glyph(sx + slot / 2 - 10, sy + d / 2 - 10, 20);
        text(sx, sy + d + 8, slot, it.title, 11, { align: "CENTER" });
      });
      y += Math.ceil(shown.length / perRow) * (d + 40) - 40 + 8 + lineH(11);
    },

    buttons: (items) => {
      const x0 = contentX;
      const bw = contentW >= 560 ? Math.min(contentW, 400) : contentW;
      const shown = items.slice(0, 5);
      const social = shown.some((it) => /continue with|sign in with|log in with|sign up with|google|apple|facebook|microsoft/i.test(str(it.title)));
      shown.forEach((it, i) => {
        const primary = !social && i === 0;
        button(x0, y, bw, 48, it.title, primary, 15);
        if (social) ellipse(x0 + 16, y + 14, 20, { fill: WF.fill2, name: "Provider logo" });
        y += 48 + (i < shown.length - 1 ? 12 : 0);
      });
    },

    alert: (items) => {
      const x0 = contentX;
      const w = contentW;
      const shown = items.slice(0, 3);
      shown.forEach((it, i) => {
        const at = els.length;
        const top = y;
        const right = it.action ? btnW(it.action, 13) : 0;
        const tw = w - 52 - right - 16;
        y += 14;
        text(x0 + 52, y, tw, it.title, 14, { weight: "Semi Bold" });
        y += lineH(14);
        if (it.subtitle) y += 4 + para(x0 + 52, y + 4, tw, it.subtitle, 13, 3, { color: WF.muted });
        y += 14;
        if (it.action) text(x0 + w - right - 16, top + (y - top - 17) / 2, right, it.action, 13, { weight: "Semi Bold", align: "RIGHT" });
        behind(at, () => {
          rect(x0, top, w, y - top, { fill: WF.fill, stroke: WF.line, radius: 10, name: `Alert: ${str(it.title)}` });
          rect(x0, top, 4, y - top, { fill: WF.ink, radius: 2 });
          icon(x0 + 18, top + 14, 20);
        });
        if (i < shown.length - 1) y += 10;
      });
    },

    empty: (items) => {
      const x0 = contentX;
      const w = contentW;
      const eh = 240;
      const it = items[0];
      rect(x0, y, w, eh, { stroke: WF.faint, radius: 12, dash: true, name: "Empty state" });
      ellipse(x0 + w / 2 - 32, y + 24, 64, { fill: WF.fill2 });
      text(x0 + 24, y + 104, w - 48, it.title, 16, { weight: "Semi Bold", align: "CENTER" });
      text(x0 + 24, y + 130, w - 48, it.subtitle || "", 13, { color: WF.muted, align: "CENTER", maxLines: 2 });
      if (it.action) button(x0 + w / 2 - 90, y + eh - 60, 180, 40, it.action, true);
      y += eh;
    },
  };

  const drawSection = (sec: any) => {
    const type = sectionType(sec.contentType);
    const items: any[] = arr(sec.items).length > 0 ? arr(sec.items) : [{ title: "Item" }, { title: "Item" }];
    const top = y;
    const size = isDesktop ? 18 : 16;
    if (str(sec.sectionTitle) && !NO_HEADING.has(type)) {
      const more = SEE_ALL.has(type);
      text(contentX, y, contentW - (more ? 80 : 0), sec.sectionTitle, size, { weight: "Semi Bold" });
      if (more) text(contentX + contentW - 80, y + 2, 80, "See all", 12, { color: WF.muted, align: "RIGHT" });
      y += lineH(size) + 12;
    }
    blocks[type](items, sec);
    regions.push({
      label: str(sec.sectionTitle),
      text: [sec.sectionTitle, type, ...items.map((it) => `${str(it.title)} ${str(it.action)} ${str(it.badge)}`)].join(" "),
      y: top,
    });
  };

  /** Draws sections top to bottom in a column; two half-width sections in a row sit side by side */
  const drawPane = (secs: any[], x: number, w: number, top: number) => {
    const saved = { x: contentX, w: contentW, y };
    contentX = x;
    contentW = w;
    y = top;
    const isHalf = (sec: any) => str(sec?.width).toLowerCase() === "half";
    for (let i = 0; i < secs.length; i++) {
      if (i > 0) y += 28;
      const sec = secs[i];
      const next = secs[i + 1];
      if (w >= 560 && isHalf(sec) && next && isHalf(next)) {
        const rowTop = y;
        contentW = (w - 24) / 2;
        drawSection(sec);
        const leftEnd = y;
        y = rowTop;
        contentX = x + contentW + 24;
        drawSection(next);
        y = Math.max(leftEnd, y);
        contentX = x;
        contentW = w;
        i++;
      } else drawSection(sec);
    }
    const end = y;
    contentX = saved.x;
    contentW = saved.w;
    y = saved.y;
    return end;
  };

  /** Hero (optional) then sections, in one column; returns the bottom */
  const column = (x: number, w: number, top: number, secs: any[], withHero = true) => {
    let cy = top;
    if (withHero) {
      const end = drawHero(x, w, cy);
      if (end > cy) cy = secs.length ? end + 28 : end;
    }
    return secs.length ? drawPane(secs, x, w, cy) : cy;
  };

  /* ---------- Shells ---------- */
  const areaX = contentLeft + pad;
  const areaW = W - contentLeft - pad * 2;
  const startY = contentTop + (isDesktop ? pad : isTablet ? 16 : 4);
  let contentEnd = contentTop;
  // Shells that fill the screen decide the height themselves
  let shellH = 0;

  let effShell = shell;
  if ((shell === "split" || shell === "aside") && (!wide || secondarySecs.length === 0)) effShell = "standard";

  if (effShell === "split" || effShell === "aside") {
    const top = (() => {
      const e = drawHero(areaX, areaW, startY);
      return e > startY ? e + 28 : startY;
    })();
    if (effShell === "split") {
      const lw = Math.round(areaW * 0.38);
      const leftEnd = drawPane(primarySecs, areaX, lw, top);
      toBars.push(rect(areaX + lw + 24, top, 1, 10, { fill: WF.line, name: "Pane divider" }));
      const rightEnd = drawPane(secondarySecs, areaX + lw + 49, areaW - lw - 49, top);
      contentEnd = Math.max(leftEnd, rightEnd);
    } else {
      const lw = Math.round((areaW - 32) * 0.66);
      const leftEnd = drawPane(primarySecs, areaX, lw, top);
      const rightEnd = drawPane(secondarySecs, areaX + lw + 32, areaW - lw - 32, top);
      contentEnd = Math.max(leftEnd, rightEnd);
    }
  } else if (effShell === "centered") {
    if (wide) {
      const colW = Math.min(480, areaW - 80);
      const cx = areaX + (areaW - colW) / 2;
      const at = els.length;
      const cardTop = startY + 16;
      const end = column(cx, colW, cardTop + 40, flowSecs);
      const cardBottom = end + 40;
      behind(at, () => {
        toBars.push(rect(contentLeft, contentTop, W - contentLeft, 10, { fill: WF.fill, name: "Page background" }));
        rect(cx - 40, cardTop, colW + 80, cardBottom - cardTop, { fill: WF.white, stroke: WF.line, radius: 16, name: "Card" });
      });
      contentEnd = cardBottom;
    } else contentEnd = column(areaX, areaW, startY + 12, flowSecs);
  } else if (effShell === "split-image") {
    if (wide) {
      const imgW = Math.round((W - contentLeft) * 0.5);
      const colW = Math.min(420, W - contentLeft - imgW - pad * 2);
      const cx = contentLeft + imgW + (W - contentLeft - imgW - colW) / 2;
      contentEnd = column(cx, colW, contentTop + (isDesktop ? 80 : 48), flowSecs);
      afterSize.push((H) => image(contentLeft, contentTop, imgW, H - bottomH - contentTop, 0));
    } else {
      image(0, contentTop, W, 260, 0);
      contentEnd = column(areaX, areaW, contentTop + 260 + 24, flowSecs);
    }
  } else if (effShell === "canvas") {
    if (wide) {
      rect(contentLeft, contentTop, W - contentLeft, 48, { fill: WF.white, name: "Toolbar" });
      line(contentLeft, contentTop + 48, W, contentTop + 48);
      for (let i = 0; i < 8; i++) glyph(contentLeft + 16 + i * 40, contentTop + 12, 24, { fill: i === 0 ? WF.fill2 : undefined });
      text(W - pad - 80, contentTop + 15, 80, "100%", 12, { color: WF.muted, align: "RIGHT" });
      const pTop = contentTop + 49;
      const leftW = primarySecs.length ? (isDesktop ? 248 : 200) : 0;
      const rightW = secondarySecs.length ? (isDesktop ? 280 : 220) : 0;
      const cvX = contentLeft + leftW;
      const cvW = W - rightW - cvX;
      toBars.push(rect(cvX, pTop, cvW, 10, { fill: WF.fill, name: "Canvas" }));
      if (leftW) {
        toBars.push(rect(contentLeft, pTop, leftW, 10, { fill: WF.white, name: "Left panel" }));
        toBars.push(rect(cvX - 1, pTop, 1, 10, { fill: WF.line }));
      }
      if (rightW) {
        toBars.push(rect(W - rightW, pTop, rightW, 10, { fill: WF.white, name: "Inspector" }));
        toBars.push(rect(W - rightW, pTop, 1, 10, { fill: WF.line }));
      }
      const abW = Math.min(cvW * 0.7, 560);
      const abH = Math.round(abW * 0.75);
      artboard(cvX + (cvW - abW) / 2, pTop + 48, abW, abH);
      const le = leftW ? column(contentLeft + 16, leftW - 32, pTop + 16, primarySecs, false) : pTop;
      const re = rightW ? column(W - rightW + 16, rightW - 32, pTop + 16, secondarySecs, false) : pTop;
      contentEnd = Math.max(le, re, pTop + 48 + abH + 24);
    } else {
      const cvH = 380;
      rect(0, contentTop, W, cvH, { fill: WF.fill, name: "Canvas" });
      artboard(W * 0.12, contentTop + 32, W * 0.76, cvH - 64);
      const ty = contentTop + cvH;
      rect(0, ty, W, 60, { fill: WF.white, name: "Tool bar" });
      line(0, ty + 60, W, ty + 60);
      const slot = W / 6;
      for (let i = 0; i < 6; i++) glyph(i * slot + slot / 2 - 14, ty + 16, 28, { fill: i === 0 ? WF.fill2 : undefined });
      contentEnd = column(areaX, areaW, ty + 60 + 20, flowSecs, false);
    }
  } else if (effShell === "map" || effShell === "immersive") {
    const isMap = effShell === "map";
    if (wide) {
      if (isMap) {
        const pw = isDesktop ? 400 : 360;
        const px = contentLeft + 24;
        const pTop = contentTop + 24;
        const at = els.length;
        const panelBottom = column(px + 20, pw - 40, pTop + 20, flowSecs) + 20;
        shellH = Math.max(minH, panelBottom + 24 + bottomH);
        const mapH = shellH - bottomH - contentTop;
        behind(at, () => {
          mapArt(contentLeft, contentTop, W - contentLeft, mapH, 3, 0, (pw + 48) / (W - contentLeft));
          rect(px, pTop, pw, panelBottom - pTop, { fill: WF.white, stroke: WF.line, radius: 16, name: "Floating panel" });
        });
        // Zoom controls
        rect(W - pad - 40, contentTop + 24, 40, 80, { fill: WF.white, stroke: WF.line, radius: 8, name: "Zoom controls" });
        line(W - pad - 40, contentTop + 64, W - pad, contentTop + 64);
        text(W - pad - 40, contentTop + 33, 40, "+", 18, { align: "CENTER" });
        text(W - pad - 40, contentTop + 73, 40, "-", 18, { align: "CENTER" });
        contentEnd = panelBottom;
      } else {
        const pw = isDesktop ? 380 : 320;
        const mediaW = W - contentLeft - pw;
        const at = els.length;
        const end = column(W - pw + 24, pw - 48, contentTop + 24, flowSecs);
        shellH = Math.max(minH, end + 24 + bottomH);
        const mh = shellH - bottomH - contentTop;
        behind(at, () => {
          image(contentLeft, contentTop, mediaW, mh, 0, WF.line);
          ellipse(contentLeft + mediaW / 2 - 36, contentTop + mh / 2 - 36, 72, { fill: WF.white, opacity: 0.9, name: "Play" });
          play(contentLeft + mediaW / 2 - 9, contentTop + mh / 2 - 14, 28, WF.ink);
          line(W - pw, contentTop, W - pw, contentTop + mh);
        });
        contentEnd = end;
      }
    } else {
      // Phone: full-screen backdrop; content goes in a bottom sheet, drawn off-screen first and moved once its height is known
      const at = els.length;
      const regAt = regions.length;
      const y0 = 4000;
      const sheetHasContent = flowSecs.length > 0 || (isMap && hero);
      const end = sheetHasContent ? column(areaX, areaW, y0, flowSecs, isMap) : y0;
      const sheetH = sheetHasContent ? end - y0 + 32 + 28 : 0;
      shellH = Math.max(minH, contentTop + (isMap ? 220 : 300) + sheetH + bottomH);
      const sheetTop = shellH - bottomH - sheetH;
      if (sheetHasContent) {
        shiftSince(at, regAt, sheetTop + 32 - y0);
        behind(at, () => {
          rect(0, sheetTop, W, sheetH, { fill: WF.white, radius: 24, name: "Bottom sheet" });
          rect(W / 2 - 20, sheetTop + 10, 40, 5, { fill: WF.line, radius: 3, name: "Sheet handle" });
        });
      }
      if (!isMap) {
        // Caption and side actions over the media
        const capBottom = sheetTop - 24;
        const acts = (iconActions.length ? iconActions : ["Like", "Comment", "Share"]).slice(0, 4);
        acts.forEach((a, i) => {
          const ay = capBottom - (acts.length - i) * 68 + 8;
          ellipse(W - pad - 44, ay, 44, { fill: WF.white, opacity: 0.9, name: `Action: ${a}` });
          text(W - pad - 54, ay + 48, 64, a, 10, { align: "CENTER", weight: "Semi Bold" });
        });
        if (hero) {
          const cw = W - pad * 2 - 64;
          const sh = hero.subtitle ? estLines(hero.subtitle, 13, cw, 2) * lineH(13) : 0;
          const th = estLines(hero.title, 18, cw, 2) * lineH(18);
          let cy = capBottom - sh - th - 4;
          regions.push({ label: "Caption", text: [hero.title, hero.subtitle].join(" "), y: cy });
          cy += para(pad, cy, cw, hero.title, 18, 2, { weight: "Bold" }) + 4;
          para(pad, cy, cw, hero.subtitle, 13, 2);
        }
      }
      behind(0, () => (isMap ? mapArt(0, 0, W, shellH - bottomH, 3, 0) : image(0, 0, W, shellH - bottomH, 0, WF.line)));
    }
  } else {
    contentEnd = column(areaX, areaW, startY, flowSecs);
  }

  /* ---------- Overlay content, laid out off-screen first so the screen can grow to fit it ---------- */
  const y0 = 4000;
  let overlayEls: WireElement[] = [];
  let overlayH = 0;
  let overlayNeedH = 0;
  const ovRegAt = regions.length;
  const dialogW = Math.min(isDesktop ? 520 : W - 32, W - 32);
  const drawerW = 440;
  if (overlaySecs.length > 0) {
    const at = els.length;
    if (overlay === "dialog") {
      const dx = (W - dialogW) / 2;
      overlayH = column(dx + 24, dialogW - 48, y0 + 24, overlaySecs, false) - y0 + 24;
      overlayNeedH = overlayH + (isDesktop ? 160 : 120);
    } else if (isDesktop) {
      overlayH = column(W - drawerW + 28, drawerW - 56, y0 + 56, overlaySecs, false) - y0 + 28;
      overlayNeedH = 40 + overlayH;
    } else {
      overlayH = column(pad, W - pad * 2, y0 + 36, overlaySecs, false) - y0 + 28;
      overlayNeedH = overlayH + 80;
    }
    // Taken out for now and added back on top of everything at the end
    overlayEls = els.splice(at);
  }
  const ovRegEnd = regions.length;

  /* ---------- Height, bottom bars, floating button, overlay ---------- */
  const H = Math.max(minH, contentEnd + (isDesktop ? 40 : 24) + bottomH, shellH, overlayNeedH);
  toBottom.forEach((e) => (e.h = H - e.y));
  toBars.forEach((e) => (e.h = H - bottomH - e.y));
  afterSize.forEach((draw) => draw(H));
  bottomDraws.forEach((draw) => draw(H - bottomH));

  const fab = str(layout.floatingAction);
  if (fab) {
    if (isDesktop) {
      const fw = btnW(fab, 14) + 40;
      const fy = H - bottomH - 32 - 56;
      rect(W - pad - fw, fy, fw, 56, { fill: WF.primary, radius: 16, name: `Floating action: ${fab}` });
      text(W - pad - fw, fy + 19, fw, `+  ${fab}`, 14, { color: WF.white, weight: "Semi Bold", align: "CENTER" });
      regions.push({ label: "Floating action", text: fab, y: fy });
    } else {
      const fy = H - bottomH - 16 - 56;
      rect(W - pad - 56, fy, 56, 56, { fill: WF.primary, radius: 16, name: `Floating action: ${fab}` });
      text(W - pad - 56, fy + 13, 56, "+", 24, { color: WF.white, align: "CENTER" });
      regions.push({ label: "Floating action", text: fab, y: fy });
    }
  }

  if (overlayEls.length > 0) {
    rect(0, 0, W, H, { fill: WF.ink, opacity: 0.45, radius: frameRadius, name: "Scrim" });
    let top: number;
    if (overlay === "dialog") {
      top = Math.max(isDesktop ? 80 : 60, (H - overlayH) / 2);
      rect((W - dialogW) / 2, top, dialogW, overlayH, { fill: WF.white, radius: 16, name: "Dialog" });
    } else if (isDesktop) {
      top = 40;
      rect(W - drawerW, top, drawerW, H - top, { fill: WF.white, name: "Side sheet" });
      text(W - 52, top + 14, 24, "×", 20, { color: WF.muted, align: "CENTER" });
    } else {
      top = H - overlayH;
      rect(0, top, W, overlayH, { fill: WF.white, radius: 24, name: "Bottom sheet" });
      rect(W / 2 - 20, top + 10, 40, 5, { fill: WF.line, radius: 3, name: "Sheet handle" });
    }
    const dy = top - y0;
    overlayEls.forEach((e) => {
      e.y += dy;
      if (e.y2 !== undefined) e.y2 += dy;
    });
    els.push(...overlayEls);
    for (let i = ovRegAt; i < ovRegEnd; i++) regions[i].y += dy;
  }

  return {
    width: W,
    height: H,
    radius: frameRadius,
    strokeWeight: isDesktop ? 2 : 10,
    deviceLabel: isDesktop ? "Desktop web · 1280px" : isTablet ? "Tablet · 768px" : "Mobile · 390px",
    elements: els,
    regions,
  };
}
