# Feriiz Platform - Memory & Architecture Handover Report

**Dokumen ini berfungsi sebagai Knowledge Base & Memory State untuk Feriiz Platform.**
Dokumen ini dibuat agar AI agent di masa depan dapat dengan cepat memahami konteks, struktur kode, logika aplikasi, dan riwayat pekerjaan yang telah diterapkan pada platform ini.

> **Last Updated:** 15 April 2026

---

## 1. Tujuan Utama & Deskripsi Platform (What is Feriiz?)

**Feriiz** adalah web application **sistem manajemen proyek dan ketenagakerjaan** yang digunakan oleh perusahaan konstruksi/properti. Platform ini berfokus pada:

- **Project Tracking**: Memantau aktivitas karyawan per proyek (contoh proyek: Anomali, Diamond Crystal Golf No. 15, Diamond Golf H3 No. 105, Mangunsarkoro No. 53).
- **Timesheet & Attendance**: Mencatat jam kerja harian karyawan (In/Out time, Active Hour, Overtime).
- **Financial Reporting**: Sistem kalkulasi rate/profitabilitas yang sangat mendetail — mengatur "Employee Billing/Rates" (upah harian/lembur) dan "Client Billing" untuk mengetahui total pengeluaran vs pemasukan.
- **Employee Management**: Mengatur data absensi, data diri, gaji, serta approval request untuk masing-masing karyawan.

Semua interface dirancang dengan desain modern, dinamis, warna utama `#2975BB` (biru), dengan micro-animations dan table responsif dengan fitur freeze pane / sticky columns.

### Status Platform Saat Ini
- **Fase: Prototipe Frontend (HTML Statis)**. Belum terhubung ke database manapun.
- **Konteks produksi**: Data proyek sesungguhnya memiliki **ratusan karyawan** per proyek dan **belasan proyek aktif**. Oleh karena itu, fase selanjutnya yang direncanakan adalah **integrasi backend + database** agar data tidak lagi di-hardcode ke HTML.
- **Rencana Database**: Pihak klien/atasan sudah menyampaikan keinginan untuk menyambungkan ke database agar laporan bisa otomatis ter-generate. Opsi stack yang diusulkan: Node.js + Express + MySQL/PostgreSQL, atau Python + Django, atau PHP + Laravel.

---

## 2. Struktur File HTML dan Logika Pages (Code Structure Mapping)

### Dashboard & Setting
| File | Fungsi |
|------|--------|
| `index.html` | Dashboard utama, statistik general saat login |
| `my account.html` | Halaman profil dan setting admin |

### Modul: Projects
Menangani aktivitas operasional berbasis Project/Proyek.

| File | Fungsi |
|------|--------|
| `projects.html` | **Beranda proyek**. List project + stat cards (Total Project, Project Active). Tabel berisi kolom: Name, Status, Date Created, First/Last Activity, Employee (total assign), **Daily** (kehadiran hari ini, default 0). |
| `project_employees.html` | **Sub: Activity**. Menampilkan absensi dan log detail harian orang di project. Ada fitur **Manage Employee** modal dengan Import Employee Code, Verify Data, filter Assigned/Unassigned, dan search. |
| `project_report.html` | **Sub: Report. (Halaman PALING KOMPLEKS)**. Tabel laporan finansial + timesheet harian. Berisi kolom: Name (sticky), Pin, Occupation, Time Period (Start/End/Period), Total Days/Hour/Overtime, Employee Rates (4 kolom), Client Rates (4 kolom), Additional (Amount/Note), dan Day Columns (dinamis per tanggal). |
| `employee_request.html` | **Sub: Requests**. Permintaan dari karyawan dalam scope project (cuti, reimbursement). |

### Modul: Employees
Menangani database pekerja secara menyeluruh.

| File | Fungsi |
|------|--------|
| `employees.html` | Daftar karyawan + modal "Add/Edit Employee" (2-kolom: biodata kiri, account config + payment rate kanan). Ada field Role, Email, Reset Password. |
| `employee_detail.html` | Detail profil individu (biodata, pin, rate gaji) |
| `employee_projects.html` | Daftar project yang sedang dikerjakan oleh employee |
| `employee_attendance.html` | Log kehadiran spesifik individu |
| `employee_report.html` | Report mirip `project_report.html`, tapi per individu |
| `employee_personal_request.html` | List requests (cuti, dll) dari satu employee |

### Aset & Pendukung
| File/Folder | Fungsi |
|-------------|--------|
| `Style.css` | Core stylesheet utama, penopang seluruh UI |
| `_Asset_/` | Repositori ikon & gambar platform |
| `Employee_pictures/` | Foto avatar staf |
| `UI/` | Folder referensi screenshot UI |
| `UI_overlay/` | Folder referensi overlay UI |

---

## 3. Data Proyek yang Sudah Ada di Prototype

### Projects (`projects.html`)
| Kode | Nama | Status | Employee |
|------|------|--------|----------|
| 0000 | Anomali | Active | 129 |
| 0259 | Diamond Crystal Golf No. 15 | Active | 81 |
| 0251 | Diamond Golf H3 No. 105 | Active | 139 |
| 0254 | Mangunsarkoro No. 53 | Active | 178 |

### Employees Proyek Anomali (`project_employees.html`)
Adam Ferial, Apriyanto Apriyanto, Baldyas Satrio, Ifan Faizal Adnan, Indra Naftali, Mauli Hidayat, Raden Moulana, Steven Febrianto, Veronica Nathalia, Yenni Tedjakoesoemo, Zicky Alfian.

---

## 4. History Pekerjaan & Update (Work Progress)

### A. Revamp UI / Desain Modal (UX Polishing)
- Memperbaiki UX Modal di seluruh pages (`employees.html`, `projects.html`) menggunakan grid 2 kolom, modern rounded corner, warna form selaras.
- Menambahkan modal "Edit Project" dan "Add Project" dengan struktur yang konsisten.

### B. Logic Paging & Pengecekan Aktivitas
- Mengubah label "Show Absences" → "Show Activity" sesuai kebutuhan klien.

### C. Bug Fixing Tabel Report (`project_report.html` & `employee_report.html`)
- **Bug overlap kolom Z-index**: Sticky "Name" column sebelumnya konflik z-index dengan sidebar. Diperbaiki dengan hierarchical `z-index` rules (sticky-col: 2, th.sticky-col: 3, sidebar: 100).
- **Default View 2-Hari Terbaru**: JS mengkalkulasi dan default hanya menampilkan 2 hari terakhir saat dibuka, dengan sinkronisasi `colspan` pada header bulan.
- **Rombakan Sistem Hide/Show Kolom (Class-Based Toggling)**:
  - Problem: JS lama menggunakan indeks kolom (angka urutan), tidak kompatibel dengan tabel multi-row header (rowspan/colspan).
  - Solution: Setiap `<td>` dan `<th>` di-inject class CSS spesifik (contoh: `.col-emp-dailyrate`, `.col-cli-totalrate`). JS sekarang toggle visibility berdasarkan class selector, bukan index. Group header (Employee, Client, Additional) colspan dihitung ulang secara dinamis.

### D. Manage Employee Modal (`project_employees.html`)
- Rebuild fitur "Manage Employee" modal dengan:
  - **Import Employee Code**: Area textarea untuk paste kode karyawan bulk.
  - **Verify Data**: Validasi kode vs database lokal, tombol berubah hijau ✓ jika valid.
  - **Filter dropdown**: All / Assigned / Unassigned untuk mengelola daftar karyawan.
  - **Search**: Pencarian real-time di dalam modal.
  - **Reset otomatis**: Semua state di-reset saat modal ditutup.

### E. Employee Modal Redesign (`employees.html`)
- Layout 2-kolom: Biodata (kiri), Account Config + Payment Rate (kanan).
- Field baru: Role (Employee/Admin dropdown), Email, Reset Password.
- Payment Rate: Hourly Rate, Overtime Rate, Client Rate, Client Overtime Rate.

### F. Kolom "Daily" di Projects (`projects.html`)
- **Baru ditambahkan**: Kolom "Daily" menampilkan jumlah kehadiran hari ini per proyek (default: 0, warna orange `#e67e22`).
- Stat cards diupdate: 4 Project, 2 Project Active.

---

## 5. Panduan Teknis untuk AI Agent Baru

### Report Table (`project_report.html` / `employee_report.html`)
- **Jangan gunakan indeks kolom** untuk hide/show. Selalu gunakan **class CSS** (`.col-pin`, `.col-emp-dailyrate`, dll).
- Cek area `<!-- Columns Filter -->` untuk checkbox mapping.
- Cek konstanta `colMap` di `<script>` di bagian bawah file untuk mapping class.
- Group header IDs: `grpTimePeriod`, `grpEmployee`, `grpClient`, `grpAdditional`, `monthHeader`.
- Sticky column menggunakan `z-index: 2` (body) dan `z-index: 3` (header). Sidebar `z-index: 100`.

### Manage Employee (`project_employees.html`)
- Fungsi kunci: `verifyEmployeeData()`, `closeManageEmpModal()`, `applyAllEmpFilters()`, `updateSelectedCount()`.
- Checkbox default state dikelola via `cb.defaultChecked`.

### General Design Rules
- Font: Poppins (via Google Fonts).
- Primary color: `#2975BB` / `#166DBA`.
- Desain minimalis modern, rounded corners (`border-radius: 8-14px`).
- Semua modal menggunakan pattern `.modal-overlay` + `.modal-card`.
- Jangan tambah elemen yang merusak konsistensi visual existing.

### Fase Berikutnya (Roadmap)
1. **Backend Integration**: Pilih stack (Node/Python/PHP), buat REST API.
2. **Database**: Migrasi data statis ke MySQL/PostgreSQL.
3. **Authentication**: Sistem login berbasis Role (Admin/Employee).
4. **Dynamic Rendering**: Tabel report, employee list, project list di-generate dari API, bukan hardcode HTML.
