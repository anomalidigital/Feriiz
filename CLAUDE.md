# CLAUDE.md — Feriiz Project Context

## Overview

Feriiz is an attendance and workforce management web application. It is a **static HTML/CSS/JS site** hosted on **GitHub Pages** — no framework, no build step, no backend. All data is hardcoded/demo. The goal is a functional UI prototype that can later be connected to a real backend (Supabase was considered but deferred).

---

## Tech Stack

- **HTML5** — 17 pages, each self-contained with its own sidebar copy
- **CSS3** — single file `assets/css/style.css` (~5500 lines)
- **Vanilla JavaScript** — two external JS files + inline `<script>` blocks per page
- **Font Awesome 6.5.1** — icons, loaded from CDN
- **Google Fonts (Poppins)** — primary typeface
- **GitHub Pages** — deployment via `.github/workflows/deploy.yml` (auto-deploy on push to `main`)
- **No backend** — auth uses `sessionStorage` (demo mode, password: `demo123`)

---

## Folder Structure

```
Feriiz/
├── .github/workflows/deploy.yml    # GitHub Pages auto-deploy
├── .gitignore
├── CLAUDE.md                       # This file
├── assets/
│   ├── css/style.css               # ALL styles (~5500 lines)
│   ├── js/
│   │   ├── app.js                  # Auth guard, logout, mobile nav, filters, dropdowns, attendance report renderer (~354 lines)
│   │   └── report.js               # Project report table logic — employee data, cell rendering, batch update, filters (~860 lines)
│   └── images/
│       ├── employees/              # Employee photos (11 files)
│       ├── icon_feriiz.png         # Login page logo
│       ├── logo.png                # Sidebar logo
│       ├── login-bg.jpg            # Login background (compressed, 199KB)
│       └── 60.jpg                  # Original uncompressed login bg (2MB) — can be deleted
├── index.html                      # Dashboard
├── login.html                      # Login page (no sidebar, no app.js)
├── forgot_password.html            # Forgot password (no sidebar, no app.js)
├── projects.html                   # Project list
├── project_employees.html          # Project activity/employees (largest page, ~1523 lines)
├── project_report.html             # Project attendance report (uses report.js)
├── project_calendar.html           # Project-scoped calendar
├── project_employee_attendance.html # Individual employee attendance within project
├── employees.html                  # Employee list
├── employee_detail.html            # Employee detail view
├── employee_attendance.html        # Employee attendance history
├── employee_projects.html          # Employee's assigned projects
├── employee_report.html            # Employee individual report
├── employee_request.html           # Leave/request management
├── employee_personal_request.html  # Individual employee request view
├── calendar.html                   # Global calendar
└── my-account.html                 # Account page (only page with logout button in sidebar)
```

---

## Design System

| Token | Value |
|---|---|
| Primary blue | `#2975BB` |
| Border radius | `7-8px` |
| Border color | `#D9D9D9` |
| Background gray | `#F2F2F2` |
| Font family | `'Poppins', sans-serif` |
| Sidebar collapsed width | `56px` |
| Sidebar hover width | `200px` |
| Sidebar mobile width | `240px` |
| Mobile breakpoint | `768px` |
| Small phone breakpoint | `400px` |

---

## Auth System (Demo)

- **Login**: `login.html` — any email + password `demo123`
- **Session**: `sessionStorage.setItem('feriiz_user', JSON.stringify({email, name, loginAt}))`
- **Auth guard**: top of `app.js` — redirects to `login.html` if no session
- **Logout**: `feriizLogout()` in `app.js` (global scope) — clears session, redirects to login
- **Logout button**: only exists in `my-account.html` (sidebar nav + header button)
- **Forgot password**: `forgot_password.html` — receives email from login page via `?email=` URL parameter, UI-only (no real email sent)
- **Pages without auth**: `login.html` and `forgot_password.html` do NOT load `app.js`

---

## Features — Completed

1. **Dashboard** (`index.html`) — stat cards (employees, attendance, occupations), occupation-by-project table, filter by occupation
2. **Projects** (`projects.html`) — project list with CRUD modal, stat cards, clickable rows
3. **Project Activity** (`project_employees.html`) — employee list per project, manage employees modal, daily activity table, tab navigation, pagination
4. **Project Report** (`project_report.html` + `report.js`) — weekly attendance grid, cell selection with checkboxes, batch update/delete modals, date range filters, occupation filter, missing log filter, column toggle (show/hide rate fields), download dropdown
5. **Project Calendar** (`project_calendar.html`) — monthly calendar with events, leave/request overlay, holiday management
6. **Employees** (`employees.html`) — employee list, add/edit modal with photo upload, occupation filter, search, pagination
7. **Employee Detail** (`employee_detail.html`) — profile card, info grid
8. **Employee Attendance** (`employee_attendance.html` + `project_employee_attendance.html`) — attendance table rendered by `app.js`, stat cards
9. **Employee Report** (`employee_report.html`) — individual monthly attendance report with schedule/actual/absent columns, sticky date column
10. **Employee Requests** (`employee_request.html` + `employee_personal_request.html`) — leave request list, add request modal, accept/reject, stat cards (pending/accepted/rejected)
11. **Calendar** (`calendar.html`) — global calendar, request sidebar with today/month toggle, status filter chips
12. **My Account** (`my-account.html`) — profile info, OTP security section, assigned projects list, 3-column grid layout
13. **Login/Logout** — session-based demo auth, login background image, password toggle
14. **Forgot Password** — email auto-fill from login page, success animation, back-to-login
15. **Mobile Responsive** — hamburger menu (injected via JS), slide-out sidebar, responsive stat cards, scrollable tables, stacking grids
16. **Multi-occupation filter** — custom multi-select dropdown built on top of native `<select>`, used across multiple pages via `FeriizFilters` global

---

## Features — NOT Yet Implemented / Pending

1. **Real backend** — all data is hardcoded in HTML or JS. No database, no API. Supabase was considered but deferred.
2. **Mobile responsive polish** — basic responsive CSS is in place with `!important` overrides, but some pages with heavy `feriiz-u-*` utility classes may still have layout issues on certain screen sizes.
3. **Real forgot password** — currently UI-only, no email sending. Server-side email was prototyped (Express + Nodemailer) but removed from production files.
4. **Employee photo upload** — modal has file input but no backend to store photos.
5. **Export functionality** — Export/Download buttons exist but use `alert()` placeholders.
6. **Print** — attendance pages have a print button (`window.print()`) but no print-specific CSS.
7. **Rate calculations** — report table has rate columns (daily rate, overtime rate) but all show `IDR0.00`.
8. **OTP system** — My Account shows OTP display and cooldown timer but it's static/hardcoded.
9. **Real pagination** — pagination UI exists but data is not paginated server-side.
10. **Search** — search inputs exist on multiple pages but most are not wired to filter logic.

---

## Architecture Notes

### Sidebar
- Copied into every HTML file (no template engine). Currently **15 different sidebar variations** exist (different nav items, different active states, some have project submenus).
- Sidebar nav items: Dashboard, Projects (with sub: Activity, Report, Requests, Calendar), Employees, Calendar, My Account.
- On desktop: 56px collapsed, expands to 200px on hover with CSS transition.
- On mobile: injected hamburger button + overlay via `app.js`, slides out 240px.

### CSS Organization (`style.css`)
The file is structured in sections (top to bottom):
1. **Reset & Base** (~line 10)
2. **Sidebar** (~line 28)
3. **Main Content / Page Header** (~line 191)
4. **Stat Cards, Filters, Buttons, Inputs, Tables** (~line 272-560)
5. **Pagination** (~line 562)
6. **Cards, Grid** (~line 631-762)
7. **Filter Toggle & Dropdown** (~line 763)
8. **Desktop Responsive** (~line 966, `@media max-width: 1024px` and `768px`)
9. **Breadcrumb, Tabs, Attendance** (~line 1145)
10. **Page-specific styles** (~line 1305-3292) — extracted from individual HTML files
11. **Utility classes** (~line 3935) — `feriiz-u-001` through `feriiz-u-299` (~299 classes)
12. **Attendance detail, modals, no-log cells, checkboxes** (~line 4363)
13. **Login & Forgot Password styles** (~line 4771)
14. **Logout nav styles** (~line 5040)
15. **Mobile Responsive overhaul** (~line 5060) — `@media max-width: 768px` with `!important` overrides

### JavaScript Organization
- **`app.js`** (loaded on all pages except login/forgot): auth guard, logout, mobile nav, `FeriizFilters` occupation filter, dropdown toggle system, attendance report data renderer, table scroll shadow.
- **`report.js`** (loaded only on `project_report.html`): employee data, cell rendering, table generation, day column visibility, totals calculation, filters, cell selection, batch update modal, fields toggle, period presets.
- **Inline `<script>` blocks**: ~2100 lines total across 12 HTML files. Contains page-specific logic like calendar rendering, modal handling, table interactions, pagination.

### Utility Classes (`feriiz-u-*`)
299 utility classes that act like inline styles (e.g., `feriiz-u-024 { background:#2975BB; color:#fff; padding:20px 24px; ... }`). These were migrated from actual inline `style=""` attributes. They cause problems because they override responsive media queries unless countered with `!important`.

---

## Critical Coding Rules

### 1. NEVER use the Edit tool for large CSS additions
The Edit tool truncates `style.css` when adding large blocks (has happened 3+ times). Always use bash append:
```bash
cat >> assets/css/style.css << 'EOF'
/* new CSS here */
EOF
```

### 2. CSS paths are relative to the CSS file
From `assets/css/style.css`, image paths must be `../images/filename`, NOT `assets/images/filename`.

### 3. Mobile CSS must use `!important`
The `feriiz-u-*` utility classes will override any regular media query rules. All mobile responsive CSS must use `!important` on every property to ensure it takes effect.

### 4. All mobile CSS must be inside `@media` queries
Never add mobile-only styles outside of `@media (max-width: 768px)` — it will break desktop layout.

### 5. `login.html` and `forgot_password.html` must NOT load `app.js`
These pages handle their own auth logic. Loading `app.js` would trigger the auth guard and create a redirect loop.

### 6. Logout button only on My Account page
Per user requirement, the sidebar logout link (`<a class="nav-logout">`) only exists in `my-account.html`. Do not add it to other pages.

### 7. Sidebar is duplicated across all pages
There is no template system. When modifying sidebar structure, all 15 HTML files with sidebars must be updated. Use bash `sed` for bulk updates.

### 8. Version cache-busting
All pages use `?v=3.2.0` on CSS and JS links. When making significant changes, bump the version in ALL files:
```bash
sed -i 's/v=3.2.0/v=3.3.0/g' *.html
```

### 9. Sandbox limitations
- Sandbox is **read-only** for move/delete on mounted files — must call `mcp__cowork__allow_cowork_file_delete` first.
- Sandbox **cannot push to GitHub** (no git credentials). User must run git commands manually.
- `.git/index` can get corrupted by sandbox git operations — avoid `git add`/`git commit` from sandbox.

### 10. Git push instructions for user
After any changes, tell the user to run:
```
cd C:\Users\baldy\Documents\Project\_Website_\Feriiz
git add -A
git commit -m "description of changes"
git push origin main
```

---

## Deployment

- **Platform**: GitHub Pages
- **Trigger**: Auto-deploy on push to `main` branch
- **Workflow**: `.github/workflows/deploy.yml` — uses `actions/deploy-pages@v4`
- **URL**: Set in GitHub repo settings (Pages section)
- No build step — the repo root IS the site.

---

## .gitignore

```
trash/
cleanup.bat
*.log
.DS_Store
Thumbs.db
server.js
package.json
package-lock.json
node_modules/
Forgot password/
```

---

## Known Technical Debt

1. **299 utility classes** (`feriiz-u-*`) — act like inline styles, cause responsive override issues, make CSS hard to read. Ideally should be refactored into semantic classes.
2. **Sidebar duplication** — copied in 15 files. A template system (even a simple JS include) would reduce maintenance burden.
3. **~2100 lines of inline JS** across 12 HTML files — should be extracted into external JS modules.
4. **Hardcoded data everywhere** — employee names, project names, attendance data all hardcoded in HTML and JS. Needs a data layer.
5. **`60.jpg` (2MB)** still in `assets/images/` — original uncompressed login background. Already replaced by `login-bg.jpg` (199KB). Safe to delete.
6. **Some onclick handlers reference functions not yet implemented** — e.g., export buttons use `alert()`.
7. **15 different sidebar nav variations** — active states and submenu items differ per page context, making bulk updates error-prone.
