# Report Update — Fitur Baru pada Report Page

**Project:** FERIIZ  
**Tanggal:** 8 Juni 2026  
**Halaman:** Project Report (`project_report.html`)

---

## 1. Batch Update System

Sistem baru untuk mengelola log attendance secara massal. Menggantikan fitur "Fix Clock" sebelumnya dengan penamaan dan flow yang lebih jelas.

**Dropdown Batch Update:**
- **Add Log** — Menambahkan log baru (Log In atau Log Out) ke cell yang dipilih. Muncul modal dengan pilihan tipe log dan input waktu.
- **Delete Log** — Menghapus log dari cell yang dipilih. Muncul konfirmasi sebelum eksekusi dengan pesan "Are you sure you want to delete the selected log? This action cannot be undone."

**Modal Add Log:**
- Toggle pilihan **Log In** / **Log Out** dengan default waktu berbeda (Log In: 07:00:00, Log Out: 17:00:00)
- Summary: jumlah log dan employee yang terdampak
- Field note untuk catatan

---

## 2. Filter Log Status

Filter baru di dropdown filter untuk menampilkan employee yang memiliki masalah log.

- **Log In** — Menampilkan hanya cell yang missing log in
- **Log Out** — Menampilkan hanya cell yang missing log out
- Ketika filter aktif, cell yang tidak sesuai filter otomatis di-hide (kosong)
- Employee yang tidak memiliki masalah sesuai filter otomatis di-hide dari tabel

**Active Filter Indicator:**
- Muncul bar biru di antara toolbar dan tabel ketika filter aktif
- Menampilkan chip label filter yang sedang digunakan (contoh: "Log In")
- Tombol × pada chip untuk clear filter langsung tanpa buka dropdown

---

## 3. Cell Selection & Checklist

Sistem seleksi baru berbasis per-cell (per kolom hari), bukan per-employee row.

- Setiap cell log memiliki checkbox di pojok kanan atas
- **Select All per hari** — Checkbox di header setiap kolom hari (Mon 15, Tue 16, dst.) untuk mencentang semua cell visible di hari tersebut
- Kombinasi dengan filter: aktifkan filter Log In → klik checkbox header hari → hanya cell missing log in yang tercentang
- Cell yang di-select mendapat outline border (biru untuk normal, amber untuk missing)

---

## 4. Layout Log dalam Cell

Perbaikan tampilan log di dalam setiap cell kolom hari.

- **Log In selalu di baris atas**, Log Out selalu di baris bawah — konsisten di semua cell
- Cell yang missing menampilkan placeholder `--:--:--` di baris yang kosong
- Badge **0h** dan **0h OT** ditampilkan di cell yang missing (sebelumnya kosong)
- Cell normal menampilkan badge **9h** dan **2h OT**

---

## 5. Dummy Employee untuk Demo

3 employee dummy ditambahkan untuk demonstrasi sistem batch update.

| Employee | Occupation | Missing Log In | Missing Log Out |
|----------|-----------|----------------|-----------------|
| Dimas Pratama | Frontend | Wed 17, Thu 18 | Sat 20 |
| Nadia Permata | Backend | Tue 16, Thu 18, Sat 20 | - |
| Rizky Mahendra | Graphic Design | - | Tue 16, Fri 19, Sat 20 |

- Employee resmi (Adam Ferial — Sandy Santuy): kerja Mon-Fri, Sat-Sun off (kolom kosong)
- Employee dummy: kerja setiap hari termasuk weekend

---

## 6. Kolom Hari (Day Columns)

- Diubah dari Mon 25 — Fri 29 May menjadi **Mon 15 — Sun 21 June 2026** (7 hari penuh)
- Default tampilan: 1 hari (Mon 15)
- Period select (Today, This Week, This Month, dst.) sekarang **auto-apply** — langsung update tampilan tanpa perlu klik Apply

---

## 7. Hand Tool

Fitur navigasi tabel dengan drag — terinspirasi dari hand tool di Adobe Illustrator.

- Klik dan drag di area tabel untuk menggeser horizontal/vertical
- Threshold 5px untuk membedakan klik (checkbox) vs drag (pan)
- Cursor berubah menjadi grab/grabbing saat drag aktif
- Checkbox dan tombol tetap berfungsi normal

---

## 8. Perubahan Penamaan

| Sebelumnya | Sekarang |
|-----------|----------|
| Fix Clock | Batch Update |
| Fix Clock In / Fix Clock Out | Add Log / Delete Log |
| Missing In / Missing Out | Log In / Log Out (di filter) |
| Attendance Issue | Log Status |
| Selected Employees / Date Range | Selected Log / Employee (di modal) |
| Items (calendar) | Request |
| Date Range (Last Activity) | Date Range |

---

## 9. Perbaikan Lainnya

- **Calendar:** "18 Items" → "18 Request", data request disinkronkan dengan halaman employee request
- **Employee Request:** Data diperbarui ke May 2026, 12 request sesuai calendar
- **Activity Page:** Foto activity dipindah ke kolom "Activity" terpisah (sebelumnya di dalam kolom Name)
- **Date Range:** Label distandarisasi menjadi "Date Range" di semua halaman, posisi selalu di paling atas filter
- **Encoding:** Fix karakter rusak (â€") di employee_report.html dan my account.html
- **JS dipisah:** Logic report dipindah dari inline script ke file terpisah `_Asset_/report.js`

---

## File yang Diubah

| File | Perubahan |
|------|-----------|
| `project_report.html` | Rebuild total — struktur baru, modal, filter indicator |
| `_Asset_/report.js` | **File baru** — semua logic report page |
| `Style.css` | Batch update styles, cell selection, filter indicator, hand tool |
| `calendar.html` | Items → Request |
| `employee_request.html` | Sync data request ke May 2026 |
| `employee_report.html` | Hapus helper text, auto-apply period, fix encoding |
| `employees.html` | Label Date Range |
| `index.html` | Label Date Range |
| `project_employees.html` | Kolom Activity, urutan filter |
| `my account.html` | Fix encoding |
| `FERIIZ_APP_HANDOFF.md` | Update dokumentasi |
