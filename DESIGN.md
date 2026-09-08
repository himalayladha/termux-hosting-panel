# TermuxPanel Design System & Brand Guidelines

> **Source of Truth** for TermuxPanel's visual architecture, color tokens, typography, component guidelines, and UX standards.

---

## 1. Product & Brand Identity

- **Product Name**: TermuxPanel
- **Tagline**: Turn Any Android Phone into a 24/7 Production Web Hosting Server ($0 Recurring Cost)
- **Target Audience**: Small to medium business owners, solo developers, freelancers, startups, and self-hosting enthusiasts.
- **Design Persona**: Modern developer console & hosting supervisor (inspired by Supabase, Cloudflare, Linear, and Vercel).
- **Core Visual Pillars**:
 1. **High Information Density**: Clean tabular metrics and service telemetry without overwhelming clutter.
 2. **High-Contrast Readability**: Dark and Light themes with strict WCAG AA contrast compliance.
 3. **Hardware Transparency**: Visual indicators for battery temperature, charging status, CPU load, and RAM limits.
 4. **Zero AI Slop**: Strict component consistency, standard design tokens, and no emoji iconography.

---

## 2. Color System & Design Tokens

TermuxPanel uses CSS custom properties (`var(--...)`) for seamless theme switching between **Dark Mode** (default) and **Light Mode**.

### 2.1 CSS Color Variables

```css
/* Dark Theme (Default) */
:root, [data-theme="dark"] {
 --bg-main: #0b0f19;
 --bg-card: #131b2e;
 --bg-card-hover: #1a253f;
 --bg-card-darker: #0d1322;
 --bg-sidebar: #0f1626;
 --border-color: #202d4a;
 --border-light: #2e3e66;
 --text-main: #f8fafc;
 --text-muted: #94a3b8;
 --primary: #0284c7;
 --primary-hover: #0369a1;
 --primary-light: #38bdf8;
 --primary-bg: rgba(2, 132, 199, 0.12);
 --primary-glow: rgba(2, 132, 199, 0.35);
 --success: #10b981;
 --success-light: rgba(16, 185, 129, 0.15);
 --warning: #f59e0b;
 --warning-light: rgba(245, 158, 11, 0.15);
 --danger: #ef4444;
 --danger-light: rgba(239, 68, 68, 0.15);
 --purple: #a855f7;
 --purple-light: rgba(168, 85, 247, 0.15);
}

/* Light Theme */
[data-theme="light"] {
 --bg-main: #f8fafc;
 --bg-card: #ffffff;
 --bg-card-hover: #f1f5f9;
 --bg-card-darker: #f8fafc;
 --bg-sidebar: #ffffff;
 --border-color: #e2e8f0;
 --border-light: #cbd5e1;
 --text-main: #0f172a;
 --text-muted: #64748b;
 --primary: #0284c7;
 --primary-hover: #0369a1;
 --primary-light: #0284c7;
 --primary-bg: rgba(2, 132, 199, 0.08);
 --primary-glow: rgba(2, 132, 199, 0.2);
 --success: #059669;
 --success-light: rgba(16, 185, 129, 0.12);
 --warning: #d97706;
 --warning-light: rgba(245, 158, 11, 0.12);
 --danger: #dc2626;
 --danger-light: rgba(239, 68, 68, 0.12);
 --purple: #9333ea;
 --purple-light: rgba(168, 85, 247, 0.12);
}
```

### 2.2 Semantic Color Usage

| Role | Variable | Hex / Gradient | Purpose |
| :--- | :--- | :--- | :--- |
| **Brand Primary** | `--primary`, `--primary-light` | `#0284c7`, `#38bdf8` | Primary CTA buttons, active tabs, brand accents |
| **Success / Online** | `--success` | `#10b981` / `#059669` | Running service status, healthy battery, active SSL |
| **Warning / Idle** | `--warning` | `#f59e0b` / `#d97706` | High RAM, high battery temperature, stopped daemon |
| **Danger / Error** | `--danger` | `#ef4444` / `#dc2626` | Process crash, thermal throttling, delete actions |
| **Purple Accent** | `--purple` | `#a855f7` / `#9333ea` | CI/CD Webhooks, 2FA Recovery, LocalXpose |

---

## 3. Typography & Spacing System

### 3.1 Font Families
- **UI System Font**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`
- **Monospace Code Font**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### 3.2 Type Scale
- **H1 (Page Title / Hero)**: `24px – 32px` | Weight: `700` / `800` | Line Height: `1.2`
- **H2 (Section Header)**: `20px – 24px` | Weight: `700` | Line Height: `1.3`
- **H3 (Card / Modal Title)**: `16px – 18px` | Weight: `700` | Line Height: `1.4`
- **H4 (Subheader / Group)**: `14px – 15px` | Weight: `600`
- **Body Regular**: `14px` | Weight: `400` / `500` | Line Height: `1.5`
- **Small Helper Text**: `12px – 13px` | Weight: `400` (`--text-muted`)
- **Micro Badge / Tag**: `10px – 11.5px` | Weight: `600` / `700` (Uppercase)

### 3.3 Border Radii & Shadows
- `--radius-sm`: `6px` (Badges, small tags, code chips)
- `--radius`: `10px` (Cards, form controls, secondary buttons)
- `--radius-lg`: `14px` (Modals, hero banners, app logo)
- `--radius-pill`: `30px` (Status badges, tech pills)

---

## 4. Component Standards

### 4.1 Buttons
- Standard button class: `.btn`
- Variants: `.btn-primary`, `.btn-secondary`, `.btn-success`, `.btn-danger`, `.btn-outline`
- Sizes: Default (`padding: 8px 16px; font-size: 13.5px;`), Small `.btn-sm` (`padding: 5px 10px; font-size: 12px;`)
- Interactive Feedback: Active transform `scale(0.97)`, focus visible outline with sky-blue glow (`rgba(56, 189, 248, 0.35)`).

### 4.2 Modal Dialogs
- Overlay: `.modal-overlay` with backdrop blur (`backdrop-filter: blur(4px);`)
- Card: `.modal-card` (Max-width `540px` default, `modal-lg` `750px`–`800px`)
- Animation: `modalPopIn` (`scale(0.95) -> scale(1)` over `0.2s`)
- Close Button: `.modal-close-btn:not(.btn)` for header `×` icon (32x32 transparent square). Action buttons in `.modal-footer` use `.btn.btn-secondary.modal-close-btn`.
- Footer: `.modal-footer` with `display: flex; align-items: center; flex-wrap: wrap; gap: 10px;`.

### 4.3 Status Badges & Beacons
- Pulsing green beacon dot (`.status-beacon.running`) with `@keyframes pulseBeacon` for online services.
- Badges: `.badge.badge-success` (`RUNNING / ONLINE`), `.badge.badge-secondary` (`STOPPED`), `.badge.badge-primary` (`PORT 8100`).

### 4.4 Iconography
- Library: **Lucide SVG Icons** (`https://unpkg.com/lucide@latest`).
- Standard alignment: `vertical-align: -0.15em; stroke-width: 2px;`.
- No raw emojis in UI controls or status indicators.

---

## 5. Responsive Layout Architecture

### 5.1 Dashboard App Layout (`frontend/index.html`)
- **Desktop (`>900px`)**:
 - Sidebar: Fixed width `240px`, pinned left.
 - Main Wrapper: `margin-left: 240px`, fluid width.
 - Topbar: Pinned top with Live System Stats, battery gauge, and light/dark theme switch.
- **Mobile (`<900px`)**:
 - Sidebar: Drawer transformed `translateX(-100%)`, z-index `1000`. Slides open with `.sidebar.open`.
 - Topbar: Hamburger button (`#sidebar-toggle`) toggles drawer and backdrop.
 - Cards & Metrics: Grid switches to single column (`grid-template-columns: 1fr;`).

### 5.2 Landing Page (`docs/index.html`)
- **Desktop (`>1080px`)**: Full-width navbar, horizontal link bar, hero metrics mockup, multi-column comparison table.
- **Mobile (`<1080px`)**: Full-width sticky header, hamburger menu button toggles full-width slide-down drawer (`#mobile-menu`), touch-friendly 44px tap targets.

---

## 6. Accessibility & Code Health Rules

1. **Semantic HTML**: Form inputs MUST have associated `<label for="...">` attributes.
2. **Keyboard Focus**: Interactive elements MUST support `:focus-visible` ring indicators.
3. **Contrast Verification**: Light mode text MUST use `#0f172a` on cards (`#ffffff`) and `#64748b` for secondary labels. Dark mode text MUST use `#f8fafc` on cards (`#131b2e`).
4. **Offline First**: All frontend scripts, CSS, and database queries run 100% locally on Android without mandatory internet access (except remote tunnels).
