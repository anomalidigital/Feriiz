# Feriiz Platform - Memory & Architecture Handover Report

**Dokumen ini berfungsi sebagai Knowledge Base & Memory State untuk Feriiz Platform.**
Dokumen ini dibuat agar AI agent di msa depan dapat dengan cepat memahami konteks, struktur kode, logika aplikasi, dan riwayat pekerjaan yang telah diterapkan pada platform ini.

---

## 1. Tujuan Utama & Deskripsi Platform (What is Feriiz?)
**Feriiz** adalah web application sistem manajemen perusahaan yang berfokus pada:
- **Project Tracking**: Memantau aktivitas karyawan per project (Anomali).
- **Timesheet & Attendance**: Mencatat jam kerja harian karyawan (In/Out time, Active Hour, Overtime).
- **Financial Reporting**: Terdapat sistem kalkulasi rate/profitabilitas yang sangat mendetail, yang mengatur "Employee Billing/Rates" (upah harian/lembur) dan "Client Billing" untuk mengetahui total pengeluaran vs pemasukan.
- **Employee Management**: Mengatur data absensi, data diri, gaji, serta approval request untuk masing-masing karyawan. 

Semua interface dirancang dengan desain modern, dinamis, dengan micro-animations dan table responsif dengan fitur freeze pane/ sticky columns.

---

## 2. Struktur File HTML dan Logika Pages (Code Structure Mapping)
Berikut adalah daftar kerangka file `.html` di Feriiz, serta apa saja perannya berdasarkan sidebar dan alur kerja aplikasi (sesuai navigasi UI):

### Dashboard & Setting
*   **`index.html`** : Dashboard utama berisikan statistik secara general saat pertama login.
*   **`my account.html`** : Halaman profil dan setting admin.

### Modul: Projects
Menangani aktivitas operasional berbasis Project/Proyek.
*   **`projects.html`** : Beranda proyek, menampilkan list project yang berjalan.
*   **`project_employees.html`** : *Sub: Activity*. Menampilkan absensi, jadwal IN/OUT, log detail harian orang-orang dalam spesifik project.
*   **`project_report.html`** : *Sub: Report*. **(Ini adalah halaman paling kompleks di platform)**. Sebuah sistem tabel laporan finansial & timesheet harian yang digabungkan. Berisi perhitungan total gaji karyawan vs tagihan klien.
*   **`employee_request.html`** : *Sub: Requests*. Menampilkan permintaan dari karyawan di dalam scope project (misal permintaan cuti, reimbursement).

### Modul: Employees
Menangani database pekerja secara menyeluruh.
*   **`employees.html`** : Halaman utama daftar karyawan dengan modal popup interaktif untuk "Add Employee" / "Edit Employee".
*   **`employee_detail.html`** : Tampilan detail profil perseorangan (biodata, pin, rate gaji).
*   **`employee_projects.html`** : Menampilkan daftar project yang sedang dikerjakan orang tersebut.
*   **`employee_attendance.html`** : Log kehadiran spesifik individu.
*   **`employee_report.html`** : Tabel report mirip dengan `project_report.html`, tetapi ini digenerate spesifik menjabarkan rekapan komulatif dari **satu orang** bulan ini.
*   **`employee_personal_request.html`** : List requests (seperti Cuti) dari satu specific employee.

### Aset Tambahan
*   **`Style.css`** : File core stylesheet utama penopang seluruh UI platform Feriiz.
*   **`_Asset_/` & `Employee_pictures/`** : Repositori global untuk foto ikon dan foto avatar staf.

---

## 3. History Pekerjaan & Update Terkini (Work Progress so Far)

Berikut adalah ringkasan pekerjaan yang sudah **berhasil dikerjakan dan stabil** hingga titik ini:

**A. Revamp UI / Desain Modal (UX Polishing)**
- Memperbaiki UX Modal di seluruh pages (`employees.html`, `projects.html`) untuk menggunakan struktur yang rapi (UI rounded modern, grid 2 kolom, warna form selaras).

**B. Logic Paging & Pengecekan Aktivitas**
- Memperbaiki behavior filter ceklis (misal pergantian tag dari "Show Absences" menjadi "Show Activity" sesuai kebutuhan klien) agar mudah dipahami.

**C. Bug Fixing Tingkat Lanjut: Tabel `project_report.html` & `employee_report.html`**
- Tabel pelaporan finansial ini sebelumnya mengalami **bug overlap kolom (Z-index conflict)** ketika digeser menyebrangi Sidebar, ini telah dikoreksi dengan menetapkan *Webkit Sticky Layout Z-index hierarchial rules* pada CSS.
- **Sistem Default View 2-Hari Terbaru**: Secara live, report table memiliki JS yang mengkalkulasi dan secara default hanya menampilkan 2 hari terakhir (Thu 12, Fri 13) saat dibuka, dengan sinkronisasi `Colspan` Date Period yang interaktif.
- **Rombakan Sistem Hide/Show Kolom JS (Class-Based Toggling)**:
  Awalnya, JS untuk mematikan/menyalakan kolom filter (Employee Rates, Client Rates) membaca dengan struktur hitungan matematika (indeks). Cara itu salah total untuk HTML dengan pola multibar rowspan/colspan yang rumit, lalu menimbulkan bug header bergeser dan kolom tabel menumpuk hilang.
  - *Current Solution*: JS yang baru telah dimodifikasi menggunakan identifikasi `<td class="col-emp-dailyrate">` dsb di seluruh loop, dengan sinkronisasi Group Header (`grpEmployee.colspan`). UI tabel ini kini sempurna tidak bocor/patah saat menu Columns difilter berulang kali.

---

**Note to Future AI Agent:**
Apabila Anda dipanggil untuk memperbaiki tampilan atau fitur tabel (terutama di report), periksa di area `<!-- Columns Filter -->` dan script Javascript di file bagian bawah untuk memodifikasi konstan `colMap` mapping class. Selain itu, pastikan untuk menghormati layout *modern minimalis* ketika menambah elemen UI di CSS di Feriiz.
