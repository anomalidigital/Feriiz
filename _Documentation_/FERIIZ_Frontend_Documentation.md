# 📘 Feriiz — Frontend Documentation

> Dokumen ini berisi informasi lengkap tentang **Feriiz**, sebuah aplikasi web management untuk tracking employee attendance, requests, dan reporting per project. Dokumen ini ditujukan untuk frontend developer yang akan melanjutkan development.

---

## 1. Overview

**Feriiz** adalah aplikasi manajemen karyawan berbasis web yang digunakan untuk:
- Tracking kehadiran (attendance) employee per project
- Mengelola request cuti, sakit, remote work, dll
- Generate report per project maupun per employee
- Visualisasi calendar untuk overview request company-wide maupun per project

**Tech Stack**: Vanilla HTML + CSS + JavaScript (tanpa framework). Hosting di **GitHub Pages**.

**Repository**: `https://github.com/anomalidigital/Feriiz.git`  
**Live URL**: `https://anomalidigital.github.io/Feriiz/`

---

## 2. Design System

### 🎨 Warna

| Token | Hex | Penggunaan |
|---|---|---|
| **Primary** | `#2975BB` | Tombol utama, sidebar active, accent text |
| **Primary Hover** | `#1e5a91` | Hover state tombol primary |
| **Primary Light** | `#EBF3FA` | Sidebar active background, highlight |
| **Background** | `#F2F2F2` | Body background |
| **Card** | `#FFFFFF` | Card, table, modal background |
| **Border** | `#D9D9D9` | Border input, table border, divider |
| **Text Primary** | `#1a1a1a` | Heading, bold text |
| **Text Default** | `#333333` | Body text |
| **Text Muted** | `#888888` | Sub-label, secondary text |
| **Danger** | `#DC3545` / `#E74C3C` | Delete button, rejected badge |
| **Success** | `#27AE60` | Accepted status, remote work |
| **Warning** | `#E67E22` | Pending status, orange badges |

### Warna Kategori Calendar (4 warna)

| Warna | Kategori | Tipe Request |
|---|---|---|
| `#27AE60` (Hijau) | **Kerja** | Remote Work |
| `#2980B9` (Biru) | **Cuti** | Annual Leave, Time in Lieu, Long Service Leave, Unpaid Leave, Marriage Leave |
| `#E74C3C` (Merah) | **Sakit** | Sick Leave, Medical Claim |
| `#E67E22` (Orange) | **Libur & Lainnya** | Public Holiday, National Leave, Meal, Transport, Others |

### 🔤 Typography

- **Font Family**: `Poppins` (Google Fonts)
- **Import**: `@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap')`
- **Font Weights**: 400 (body), 500 (medium), 600 (label), 700 (heading), 800 (page title)

| Element | Size | Weight |
|---|---|---|
| Page Title | 28px | 700 |
| Card Title | 16px | 700 |
| Table Header | 12px | 700 |
| Body Text | 13px | 400-500 |
| Label | 12-13px | 600 |
| Badge | 12px | 600 |
| Small Text | 11px | 500 |

### 📐 Spacing & Radius

- **Border Radius**: `7px` (default), `8px` (buttons/input), `10-12px` (cards/table), `14px` (modal), `20px` (badges)
- **Padding**: 
  - Card: `28px`
  - Table Cell: `14px 20px`
  - Button: `9px 18px`
  - Input: `9px 14px`
  - Modal: `24px 28px`

---

## 3. Logo & Asset

| File | Path | Deskripsi |
|---|---|---|
| Logo Icon | `_Asset_/icon_feriiz.png` | Icon 36×36px di sidebar |
| Logo Full | `_Asset_/logo.png` | Logo lengkap |
| Employee Photos | `Employee_pictures/` | Foto karyawan (JPG) |

---

## 4. Struktur File

```
Feriiz/
├── _Asset_/                    # Logo & asset
│   ├── icon_feriiz.png
│   └── logo.png
├── Employee_pictures/          # Foto employee
├── _Documentation_/            # Arsip/dokumentasi internal
├── .github/workflows/
│   └── deploy.yml              # GitHub Pages auto-deploy
├── Style.css                   # Design system utama
│
├── index.html                  # Dashboard
├── projects.html               # Project list
├── employees.html              # Employee list
├── my account.html             # My Account (OTP, profile)
├── calendar.html               # 📅 Global Calendar (company-wide)
│
├── project_employees.html      # Project → Activity (manage employee per project)
├── project_report.html         # Project → Report
├── project_calendar.html       # 📅 Project → Calendar (per project)
├── employee_request.html       # Project → Requests
│
├── employee_report.html        # Employee → Report
├── employee_detail.html        # Employee → Detail profile
├── employee_attendance.html    # Employee → Attendance history
├── employee_personal_request.html  # Employee → Personal request
└── employee_projects.html      # Employee → Project assignments
```

---

## 5. Navigasi (Sidebar)

Sidebar menggunakan **hover-expand** pattern:
- Default: `56px` (icon only)
- Hover: `200px` (icon + label muncul)
- Transisi: `0.25s cubic-bezier(.4, 0, .2, 1)`

### Menu Utama
```
📊 Dashboard          → index.html
📋 Projects           → projects.html
  ├── ⏰ Activity      → project_employees.html
  ├── 📄 Report        → project_report.html
  ├── 📋 Requests      → employee_request.html
  └── 📅 Calendar      → project_calendar.html
👥 Employees          → employees.html
📅 Calendar           → calendar.html
👤 My Account         → my account.html
```

Sub-menu Projects menggunakan `.nav-group.open > .nav-submenu` pattern dengan indentasi saat sidebar hover.

---

## 6. Komponen Utama

### 6.1 Buttons
- `.btn.btn-primary` → Biru primary (#2975BB)
- `.btn.btn-outline` → Putih, border abu
- `.btn.btn-danger` → Merah (#DC3545)
- `.btn-action` → Tombol kecil di area report (inline style)
- `.btn-action.primary` → Versi biru
- `.btn-icon` → Icon button 36×36 (edit, delete, dll)

### 6.2 Download Dropdown (Report)
Di halaman `project_report.html` dan `employee_report.html`:
- Tombol **Download ▾** memunculkan dropdown popup
- 3 opsi: **Download All**, **Download Summary**, **Download Timesheet**
- Toggle via `.classList.toggle('show')`
- CSS: `#downloadDropdown { display:none }` + `#downloadDropdown.show { display:block }`
- Click-outside listener menutup dropdown

### 6.3 Filter Dropdown
Pattern yang konsisten di seluruh halaman:
- Tombol filter icon (`.filter-toggle-btn` atau custom)
- Dropdown popup (`.filter-dropdown`) dengan `position:absolute`
- Isi: select/date input + Apply/Clear buttons
- Buka/tutup via `.classList.toggle('show')`

### 6.4 Modal Overlay
Pattern untuk semua popup/modal:
```html
<div class="modal-overlay" id="modalId">
    <div class="modal-card">
        <div class="modal-header">...</div>
        <div class="modal-body">...</div>
        <div class="modal-footer">...</div>
    </div>
</div>
```
- Show: `.classList.add('show')` + `body.style.overflow = 'hidden'`
- Hide: `.classList.remove('show')` + `body.style.overflow = ''`
- Backdrop: `rgba(0,0,0,0.4)` + `backdrop-filter: blur(4px)`
- Animasi: `fadeIn` (overlay) + `slideUp` (card)

### 6.5 Table
- `.table-container` → wrapper dengan rounded border
- `.data-table` → table itu sendiri
- Row hover: `#f7f9fb`
- Employee cell: `.employee-cell` (avatar + name + code)

### 6.6 Status Badges
- `.badge.badge-pending` → Kuning (#FFF3CD / #856404)
- `.badge.badge-accepted` → Hijau (#D4EDDA / #155724)
- `.badge.badge-rejected` → Merah (#F8D7DA / #721C24)

### 6.7 Stat Cards
Cards di atas halaman (Dashboard, Requests, dll):
- Background biru `#2975BB` dengan text putih
- Icon dalam rounded box `rgba(255,255,255,0.2)`
- Angka besar + label kecil

---

## 7. Halaman Calendar

### 7.1 Global Calendar (`calendar.html`)
- **Lokasi sidebar**: Menu utama (setara Dashboard)
- **Fungsi**: Overview seluruh company
- **Cell content**: **Aggregat count** per kategori ("Remote Work: 3", "Sakit: 2")
- **Klik badge count** → overlay popup berisi list nama employee
- **Features**: Search project (autocomplete), filter (type/status/date), navigasi bulan, legend warna

### 7.2 Project Calendar (`project_calendar.html`)
- **Lokasi sidebar**: Sub-menu di bawah Projects
- **Fungsi**: Detail per project (employee terbatas)
- **Cell content**: **Nama per-orang** langsung di cell ("Adam | Remote Work")
- **Klik event bar** → overlay detail (Name, Type, Date, Status, PIC, Note, Attachment)
- **Sidebar kiri**: Toggle Today/Month, Summary count (🟢🔵🔴), request list
- **Features**: Full screen, navigasi bulan

---

## 8. Interaksi & Pattern

### Search Autocomplete (Manage Employee & Calendar)
- Input dengan icon search
- Dropdown muncul saat focus/typing
- Filter realtime berdasarkan input
- Pilih item → set value + tutup dropdown
- Pattern: `show/hide` class + `document.addEventListener('click', ...)` untuk close

### Progressive Disclosure
- Beberapa modal menampilkan field bertahap
- Contoh: Add Request modal di `employee_request.html`

### Dynamic Content
- Sidebar calendar di-render ulang oleh JavaScript (`renderSidebar()`)
- Calendar grid di-render ulang setiap navigasi bulan (`renderCalendar()`)
- Data event dan holiday didefinisikan sebagai array JS const

---

## 9. Deployment

### GitHub Actions
File `.github/workflows/deploy.yml` otomatis deploy ke GitHub Pages saat push ke `main`.

### Penting
- **Case-sensitive**: GitHub Pages (Linux) bersifat case-sensitive. Semua href harus lowercase (`index.html`, bukan `Index.html`)
- **Asset path**: Gunakan relative path (`_Asset_/icon_feriiz.png`, bukan absolute)
- **Spasi di filename**: `my account.html` — mengandung spasi, perlu di-encode jika diakses via URL

---

## 10. Catatan Teknis

1. **Tidak ada framework JS** — semua logic menggunakan vanilla JS
2. **Tidak ada build step** — file HTML langsung di-serve
3. **CSS terpisah** — `Style.css` untuk design system global, page-specific CSS menggunakan `<style>` inline di masing-masing HTML
4. **Data dummy** — semua data (employee, request, attendance) hardcoded di HTML. Belum ada backend/API
5. **Font Awesome 6.5.1** — digunakan untuk semua icon via CDN

---

*Dokumen ini terakhir diupdate: 15 Mei 2026*
