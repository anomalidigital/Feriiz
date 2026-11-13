/* =============================================
   FERIIZ — Import employees (Employees > Import XLSX, 13-11-2026)
   Baldy, with the live Feriiz's EMPLOYEE.xlsx: "di employee itu kan ada export ya, itu coba deh
   sebenernya itu import XLSX dan tampilan nya kurang lebih ketika di klik sama kaya yang di
   report… cuma xlsx nya beda… seperti yang di xlsx file nya". The page's Export button is now
   Import XLSX, with the Report's Import dialog: choose the file, see what it changes, Import
   file; Download template gives the file to fill in. The file is the live Feriiz's employee
   file, two rows of titles, a group title over its columns:
     No | Code | First Name | Last Name | Date (YYYY-MM-DD): Start, End |
     Time (HH:MM:SS): Cut Off, Start, End | Dob (YYYY-MM-DD) | Mailing Name | Email | Mobile |
     Gender | Occupation | Company | Pin | Work Day (Yes/No): Monday … Sunday |
     Employee: Rate / Hour, Rate Overtime | Client: Rate / Hour, Rate Overtime
   - A row whose Code is in Feriiz changes that employee; a row with a new Code, or none, adds one.
   - An empty cell leaves its field as it is; "-" in Occupation is none, as the live file writes it.
   - Rate / Hour is the Daily Rate per hour of a working day, the Working Time less an hour of
     break (8 of 08:00-17:00): Daily Rate = Rate / Hour × 8 there. Rate Overtime is per hour.
   - Date Start is the day the employee joined (the table's Joined). Date End, Mailing Name and
     Company stay with the employee; the form does not show them.
   - An occupation that is not on the list yet is added to Employees > Occupations.
   Like Add Employee, the prototype keeps the employees until the page is loaded again.
   The Excel library (SheetJS) loads the first time it is needed, as in the Report.
   ============================================= */
(function () {
    'use strict';

    var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    var TYPES = ['.xlsx', '.xls'];
    var MAX_BYTES = 5 * 1024 * 1024;
    var LIST_MAX = 200;        // rows listed in the preview; the counts cover everything
    var LOADING_MIN = 800;     // ms, so a loading never just flashes
    var FILE_NAME = 'EMPLOYEE.xlsx';
    var ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var WEEK = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'],
                ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];

    // The fields a row can change, with their names in the preview, in the file's order.
    var FIELDS = [
        ['first', 'First Name'], ['last', 'Last Name'], ['dateStart', 'Joined'], ['dateEnd', 'Date End'],
        ['cutOff', 'Cut Off Hour'], ['timeStart', 'Start Hour'], ['timeEnd', 'End Hour'], ['dob', 'Date of Birth'],
        ['mailing', 'Mailing Name'], ['email', 'Email'], ['mobile', 'Mobile'], ['gender', 'Gender'],
        ['occupation', 'Occupation'], ['company', 'Company'], ['pin', 'Pin'], ['days', 'Working Days'],
        ['daily', 'Daily Rate'], ['ot', 'Overtime Rate / Hour'], ['clientDaily', 'Client Daily Rate'],
        ['clientOt', 'Client Overtime Rate / Hour']
    ];

    var xlsxLoading = null;
    var modal = null;
    var plan = null;
    var options = null;        // { employees: function () -> [], onImported: function (added) }
    var readToken = 0;
    var downloading = false;

    function $(sel) { return modal.querySelector(sel); }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function loadXLSX() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (!xlsxLoading) {
            xlsxLoading = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = XLSX_URL;
                s.onload = function () { if (window.XLSX) resolve(window.XLSX); else reject(new Error('XLSX missing')); };
                s.onerror = function () { xlsxLoading = null; s.remove(); reject(new Error('XLSX failed to load')); };
                document.head.appendChild(s);
            });
        }
        return xlsxLoading;
    }

    function fileSize(bytes) {
        return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function rupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

    /* ---------- An employee as the file has it ---------- */
    function projectOf(emp) {
        var code = emp.projects && emp.projects[0];
        return code && window.FERIIZ_DATA ? window.FERIIZ_DATA.findProjectByCode(code) : null;
    }

    // First Name and Last Name, a middle name with the last, as the file has two.
    function nameParts(emp) {
        if (emp.firstName != null) return { first: emp.firstName || '', last: [emp.middleName, emp.lastName].filter(Boolean).join(' ') };
        var parts = String(emp.name || '').trim().split(/\s+/).filter(Boolean);
        return { first: parts.shift() || '', last: parts.join(' ') };
    }

    function minutes(t) {
        var m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    }

    function hhmm(t) {
        var m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
        return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
    }

    // The hours of a working day, for the rates per hour: the Working Time less an hour of
    // break, as the Report counts a full day (8 of 08:00-17:00).
    function dayHours(start, end) {
        var a = minutes(start || '08:00'), b = minutes(end || '17:00');
        var span = a != null && b != null && b > a ? (b - a) / 60 : 9;
        return span > 1 ? span - 1 : span;
    }

    // What the employee's row says now: their own values, else their first project's, as the
    // employee form shows them.
    function current(emp) {
        var p = projectOf(emp);
        var n = nameParts(emp);
        var start = hhmm(emp.workStart || (p && p.workStart) || '08:00');
        var end = hhmm(emp.workEnd || (p && p.workEnd) || '17:00');
        return {
            first: n.first, last: n.last,
            dateStart: emp.joinedAt || '', dateEnd: emp.endDate || '',
            cutOff: hhmm(emp.cutOff || (p && p.cutOff) || ''), timeStart: start, timeEnd: end,
            dob: emp.birthDate || '', mailing: emp.mailingName || '', email: emp.email || '', mobile: emp.phone ? String(emp.phone) : '',
            gender: emp.gender || '', occupation: emp.occupation || '', company: emp.company || '', pin: emp.pin ? String(emp.pin) : '',
            days: (emp.workingDays || (p && p.workingDays) || ALL_DAYS).slice(),
            daily: Number(emp.dailyRate) || 0,
            ot: Number(emp.overtimeRate != null ? emp.overtimeRate : (p && p.overtimeRate)) || 0,
            clientDaily: Number(emp.clientDailyRate) || 0,
            clientOt: Number(emp.clientOvertimeRate != null ? emp.clientOvertimeRate : (p && p.clientOvertimeRate)) || 0
        };
    }

    function withSeconds(t) { return t ? t + ':00' : null; }

    // One employee's row of the template.
    function templateRow(emp, i) {
        var c = current(emp);
        var hours = dayHours(c.timeStart, c.timeEnd);
        var row = [i + 1, emp.code, c.first || null, c.last || null, c.dateStart || null, c.dateEnd || null,
                   withSeconds(c.cutOff), withSeconds(c.timeStart), withSeconds(c.timeEnd), c.dob || null, c.mailing || null,
                   c.email || null, c.mobile || null, c.gender ? c.gender.toUpperCase() : null, c.occupation || '-',
                   c.company || null, c.pin || null];
        WEEK.forEach(function (w) { row.push(c.days.indexOf(w[0]) >= 0 ? 'Yes' : 'No'); });
        row.push(Math.round(c.daily / hours), c.ot, Math.round(c.clientDaily / hours), c.clientOt);
        return row;
    }

    /* ---------- Download template ---------- */
    function showProgress(done, total) {
        var pct = total ? Math.round(done / total * 100) : 0;
        $('#empImportProgress').hidden = false;
        $('#empImportProgressLabel').textContent = 'Fetching employees (' + done + '/' + total + ') - ' + pct + '%';
        $('#empImportProgressBar').style.width = pct + '%';
        $('#empImportProgress .progress').setAttribute('aria-valuenow', pct);
        $('#empImportTemplate').disabled = true;
    }

    function hideProgress() {
        $('#empImportProgress').hidden = true;
        $('#empImportTemplate').disabled = false;
    }

    // The live Feriiz's employee file: one plain "Sheet1", two rows of titles with the groups
    // over their columns, every employee sorted by first name, empty cells left empty.
    function downloadTemplate() {
        var people = options.employees().slice();
        if (!people.length || downloading) return;
        downloading = true;
        var started = Date.now();
        showProgress(0, people.length);
        loadXLSX().then(function (XLSX) {
            people.sort(function (a, b) {
                return nameParts(a).first.localeCompare(nameParts(b).first, undefined, { sensitivity: 'base' }) ||
                    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
            });
            var head = ['No', 'Code', 'First Name', 'Last Name', 'Date (YYYY-MM-DD)', null, 'Time (HH:MM:SS)', null, null,
                        'Dob (YYYY-MM-DD)', 'Mailing Name', 'Email', 'Mobile', 'Gender', 'Occupation', 'Company', 'Pin',
                        'Work Day (Yes/No)', null, null, null, null, null, null, 'Employee', null, 'Client', null];
            var sub = [null, null, null, null, 'Start', 'End', 'Cut Off', 'Start', 'End', null, null, null, null, null, null, null, null]
                .concat(WEEK.map(function (w) { return w[1]; }), ['Rate / Hour', 'Rate Overtime', 'Rate / Hour', 'Rate Overtime']);
            var aoa = [head, sub];
            var i = 0;
            return new Promise(function (resolve) {
                (function next() {
                    for (var end = Math.min(people.length, i + 10); i < end; i++) aoa.push(templateRow(people[i], i));
                    showProgress(i, people.length);
                    if (i < people.length) setTimeout(next, 16);
                    else wait(Math.max(0, LOADING_MIN - (Date.now() - started))).then(resolve);
                })();
            }).then(function () {
                var ws = XLSX.utils.aoa_to_sheet(aoa);
                var cell = function (r, c) { return { r: r, c: c }; };
                ws['!merges'] = [0, 1, 2, 3, 9, 10, 11, 12, 13, 14, 15, 16].map(function (c) { return { s: cell(0, c), e: cell(1, c) }; })
                    .concat([[4, 5], [6, 8], [17, 23], [24, 25], [26, 27]].map(function (span) { return { s: cell(0, span[0]), e: cell(0, span[1]) }; }));
                var wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                XLSX.writeFile(wb, FILE_NAME);
                if (window.FeriizNotify) {
                    FeriizNotify.success('Change or add employees, one per row, then bring it back with Import XLSX. An empty cell leaves its field as it is.', FILE_NAME + ' downloaded');
                }
            });
        }).catch(function () {
            if (window.FeriizNotify) FeriizNotify.error('The Excel tool could not be loaded. Check the internet connection and try again.', 'Download failed');
        }).then(function () {
            downloading = false;
            hideProgress();
        });
    }

    /* ---------- Reading a file ---------- */
    function key(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, ''); }

    function text(v) { return v == null ? '' : String(v).trim(); }

    // Which field a column holds, from its title and the title under it.
    function columnOf(top, sub) {
        var t = key(top), s = key(sub);
        if (t === 'no') return 'no';
        if (t === 'code') return 'code';
        if (t === 'firstname') return 'first';
        if (t === 'lastname') return 'last';
        if (t.indexOf('dob') === 0) return 'dob';
        if (t.indexOf('date') === 0) return s === 'start' ? 'dateStart' : s === 'end' ? 'dateEnd' : '';
        if (t.indexOf('time') === 0) return s === 'cutoff' ? 'cutOff' : s === 'start' ? 'timeStart' : s === 'end' ? 'timeEnd' : '';
        if (t === 'mailingname') return 'mailing';
        if (t === 'email') return 'email';
        if (t === 'mobile' || t === 'phone') return 'mobile';
        if (t === 'gender') return 'gender';
        if (t === 'occupation') return 'occupation';
        if (t === 'company') return 'company';
        if (t === 'pin') return 'pin';
        if (t.indexOf('workday') === 0) {
            var day = WEEK.filter(function (w) { return key(w[1]) === s; })[0];
            return day ? 'day:' + day[0] : '';
        }
        if (t === 'employee' || t === 'client') {
            var p = t === 'employee' ? '' : 'client';
            if (s === 'ratehour') return p ? 'clientHour' : 'hour';
            if (s === 'rateovertime') return p ? 'clientOt' : 'ot';
        }
        return '';
    }

    // Row 1 has the titles, a group's title only over its first column; row 2 the titles under them.
    function readSheet(aoa) {
        var head = aoa[0] || [], sub = aoa[1] || [], cols = {}, top = '';
        var width = Math.max(head.length, sub.length);
        for (var i = 0; i < width; i++) {
            if (text(head[i])) top = head[i];
            else if (!text(sub[i])) top = '';
            var field = columnOf(text(head[i]) ? head[i] : top, sub[i]);
            if (field && cols[field] == null) cols[field] = i;
        }
        return { cols: cols, rows: aoa.slice(2) };
    }

    // "2021-03-01" from "2021-03-01", "2021/03/01", "01/03/2021" or an Excel date; null when wrong.
    function dateValue(v) {
        if (typeof v === 'number' && v > 1 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
        var s = text(v), m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
        if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
        m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
        if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
        return null;
    }

    // "08:00" from "08:00:00", "8:00" or an Excel time; null when wrong.
    function timeValue(v) {
        if (typeof v === 'number' && v >= 0 && v < 1) {
            var mins = Math.round(v * 1440);
            return String(Math.floor(mins / 60) % 24).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
        }
        var m = text(v).match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
        return m[1].padStart(2, '0') + ':' + m[2];
    }

    function genderValue(v) {
        var s = key(v);
        if (/^(m|male|l|lakilaki|pria)$/.test(s)) return 'Male';
        if (/^(f|female|p|perempuan|wanita)$/.test(s)) return 'Female';
        return null;
    }

    function yesNo(v) {
        var s = key(v);
        if (/^(yes|y|ya|true)$/.test(s) || v === 1 || v === true) return true;
        if (/^(no|n|tidak|false)$/.test(s) || v === 0 || v === false) return false;
        return null;
    }

    // A rate: 150000, "150.000" or "150,000"; null when wrong.
    function money(v) {
        if (typeof v === 'number') return v >= 0 ? Math.round(v) : null;
        var s = text(v).replace(/^rp\s*/i, '').replace(/\s/g, '');
        if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
        var n = Number(s);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }

    // The values a row gives, only its filled cells; errors says what is wrong.
    function rowValues(sheet, r) {
        var v = {}, errors = [];
        function cell(k) { var i = sheet.cols[k]; return i == null ? '' : r[i]; }
        function filled(k) { var c = cell(k); return !(c === '' || c == null || (typeof c === 'string' && !c.trim())); }
        ['first', 'last', 'mailing', 'company'].forEach(function (k) { if (filled(k)) v[k] = text(cell(k)).replace(/\s+/g, ' '); });
        if (filled('dateStart')) { v.dateStart = dateValue(cell('dateStart')); if (!v.dateStart) errors.push('Date Start must be YYYY-MM-DD'); }
        if (filled('dateEnd')) { v.dateEnd = dateValue(cell('dateEnd')); if (!v.dateEnd) errors.push('Date End must be YYYY-MM-DD'); }
        if (filled('dob')) { v.dob = dateValue(cell('dob')); if (!v.dob) errors.push('Dob must be YYYY-MM-DD'); }
        [['cutOff', 'Cut Off'], ['timeStart', 'Time Start'], ['timeEnd', 'Time End']].forEach(function (t) {
            if (!filled(t[0])) return;
            v[t[0]] = timeValue(cell(t[0]));
            if (!v[t[0]]) errors.push(t[1] + ' must be HH:MM:SS');
        });
        if (filled('email')) {
            v.email = text(cell('email'));
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.push('Email is not an email address');
        }
        if (filled('mobile')) {
            v.mobile = text(cell('mobile')).replace(/\s/g, '');
            if (!/^\+?\d{6,15}$/.test(v.mobile)) errors.push('Mobile must be 6 to 15 digits');
        }
        if (filled('gender')) { v.gender = genderValue(cell('gender')); if (!v.gender) errors.push('Gender must be MALE or FEMALE'); }
        if (filled('occupation')) {
            var occ = text(cell('occupation')).replace(/\s+/g, ' ');
            v.occupation = occ === '-' ? '' : occ;
        }
        if (filled('pin')) {
            v.pin = text(cell('pin'));
            if (!/^\d{4,6}$/.test(v.pin)) errors.push('Pin must be 4 to 6 digits');
        }
        var days = [], anyDay = false, badDay = false;
        WEEK.forEach(function (w) {
            if (!filled('day:' + w[0])) return;
            anyDay = true;
            var on = yesNo(cell('day:' + w[0]));
            if (on === null) badDay = true;
            else if (on) days.push(w[0]);
        });
        if (badDay) errors.push('Work Day must be Yes or No');
        else if (anyDay) v.days = ALL_DAYS.filter(function (d) { return days.indexOf(d) >= 0; });
        [['hour', 'Employee Rate / Hour'], ['ot', 'Employee Rate Overtime'], ['clientHour', 'Client Rate / Hour'], ['clientOt', 'Client Rate Overtime']].forEach(function (k) {
            if (!filled(k[0])) return;
            v[k[0]] = money(cell(k[0]));
            if (v[k[0]] === null) errors.push(k[1] + ' must be a number');
        });
        return { v: v, errors: errors, code: text(cell('code')) };
    }

    function daysText(days) {
        if (!days.length) return 'none';
        if (days.length === 7) return 'every day';
        return ALL_DAYS.filter(function (d) { return days.indexOf(d) >= 0; }).join(', ');
    }

    function shown(field, value) {
        if (field === 'days') return daysText(value);
        if (field === 'daily' || field === 'ot' || field === 'clientDaily' || field === 'clientOt') return rupiah(value);
        return value === '' || value == null ? '-' : String(value);
    }

    // What the row would change in an employee who is in Feriiz: [{ field, from, to }].
    function differences(emp, v) {
        var c = current(emp);
        var next = {};
        Object.keys(v).forEach(function (k) { next[k] = v[k]; });
        // The rates per hour become Daily Rates over the working day the row leaves.
        var hours = dayHours(next.timeStart || c.timeStart, next.timeEnd || c.timeEnd);
        if (next.hour != null) next.daily = Math.round(c.daily / hours) === next.hour ? c.daily : Math.round(next.hour * hours);
        if (next.clientHour != null) next.clientDaily = Math.round(c.clientDaily / hours) === next.clientHour ? c.clientDaily : Math.round(next.clientHour * hours);
        var out = [];
        FIELDS.forEach(function (f) {
            var k = f[0];
            if (next[k] === undefined) return;
            var same = k === 'days' ? daysText(c.days) === daysText(next.days)
                : k === 'gender' || k === 'occupation' || k === 'email' ? String(c[k]).toLowerCase() === String(next[k]).toLowerCase()
                : String(c[k]) === String(next[k]);
            if (!same) out.push({ field: k, label: f[1], from: c[k], to: next[k] });
        });
        return out;
    }

    function buildPlan(sheet, fileName) {
        var result = { file: fileName, rows: 0, added: [], updates: [], changes: [], same: 0, problems: [], newOccupations: [] };
        if (sheet.cols.code == null && sheet.cols.first == null) { result.fatal = true; return result; }
        var byCode = {}, seen = {}, newOcc = {};
        options.employees().forEach(function (e) { byCode[String(e.code).toUpperCase()] = e; });
        var onList = {};
        ((window.FERIIZ_DATA && window.FERIIZ_DATA.occupations) || []).forEach(function (o) { onList[o.toLowerCase()] = true; });
        sheet.rows.forEach(function (r, idx) {
            var line = idx + 3;   // the row number in Excel
            if (!r.some(function (c) { return text(c); })) return;
            var read = rowValues(sheet, r);
            var code = read.code, v = read.v;
            var emp = code ? byCode[code.toUpperCase()] : null;
            var who = [v.first, v.last].filter(Boolean).join(' ') || (emp && emp.name) || code || 'Row ' + line;
            result.rows++;
            if (code && seen[code.toUpperCase()]) { result.problems.push({ line: line, who: who, why: 'Code ' + code + ' is in the file twice; only its first row counts' }); return; }
            if (code) seen[code.toUpperCase()] = true;
            if (read.errors.length) { result.problems.push({ line: line, who: who, why: read.errors.join('; ') }); return; }
            if (v.occupation && !onList[v.occupation.toLowerCase()] && !newOcc[v.occupation.toLowerCase()]) {
                newOcc[v.occupation.toLowerCase()] = true;
                result.newOccupations.push(v.occupation);
            }
            if (!emp) {
                if (!v.first) { result.problems.push({ line: line, who: who, why: 'A new employee needs a First Name' }); return; }
                result.added.push({ code: code, v: v, name: [v.first, v.last].filter(Boolean).join(' ') });
                return;
            }
            var diffs = differences(emp, v);
            if (!diffs.length) { result.same++; return; }
            result.updates.push({ emp: emp, v: v });
            diffs.forEach(function (d) { result.changes.push({ name: emp.name, label: d.label, from: shown(d.field, d.from), to: shown(d.field, d.to) }); });
        });
        // An occupation only the rows not imported had is not added.
        var used = {};
        result.added.concat(result.updates).forEach(function (a) { if (a.v.occupation) used[a.v.occupation.toLowerCase()] = true; });
        result.newOccupations = result.newOccupations.filter(function (o) { return used[o.toLowerCase()]; });
        return result;
    }

    /* ---------- Importing ---------- */
    // Puts a row's values on an employee, the form's fields included.
    function applyRow(emp, v) {
        var c = current(emp);
        var n = nameParts(emp);
        var first = v.first !== undefined ? v.first : n.first;
        var lastWords = (v.last !== undefined ? v.last : n.last).split(/\s+/).filter(Boolean);
        if (v.first !== undefined || v.last !== undefined || emp.firstName == null) {
            emp.firstName = first;
            emp.lastName = lastWords.pop() || '';
            emp.middleName = lastWords.join(' ');
            emp.name = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
        }
        if (v.dateStart !== undefined) emp.joinedAt = v.dateStart;
        if (v.dateEnd !== undefined) emp.endDate = v.dateEnd;
        if (v.cutOff !== undefined) emp.cutOff = v.cutOff;
        if (v.timeStart !== undefined) emp.workStart = v.timeStart;
        if (v.timeEnd !== undefined) emp.workEnd = v.timeEnd;
        if (v.dob !== undefined) emp.birthDate = v.dob;
        if (v.mailing !== undefined) emp.mailingName = v.mailing;
        if (v.email !== undefined) emp.email = v.email;
        if (v.mobile !== undefined) emp.phone = v.mobile;
        if (v.gender !== undefined) emp.gender = v.gender;
        if (v.occupation !== undefined) emp.occupation = v.occupation;
        if (v.company !== undefined) emp.company = v.company;
        if (v.pin !== undefined) emp.pin = v.pin;
        if (v.days !== undefined) emp.workingDays = v.days.slice();
        var hours = dayHours(emp.workStart || c.timeStart, emp.workEnd || c.timeEnd);
        if (v.hour !== undefined && Math.round(c.daily / hours) !== v.hour) emp.dailyRate = Math.round(v.hour * hours);
        if (v.ot !== undefined) emp.overtimeRate = v.ot;
        if (v.clientHour !== undefined && Math.round(c.clientDaily / hours) !== v.clientHour) emp.clientDailyRate = Math.round(v.clientHour * hours);
        if (v.clientOt !== undefined) emp.clientOvertimeRate = v.clientOt;
    }

    function commit(p) {
        var data = window.FERIIZ_DATA;
        p.newOccupations.forEach(function (o) { if (data && data.addOccupation) data.addOccupation(o); });
        p.updates.forEach(function (u) { applyRow(u.emp, u.v); });
        var stamp = Date.now().toString(36).toUpperCase();
        var today = new Date().toISOString().slice(0, 10);
        var added = p.added.map(function (a, i) {
            var emp = { code: a.code || 'NEW' + stamp + i, projects: [], status: 'Active', joinedAt: today, dailyRate: 0, clientDailyRate: 0 };
            applyRow(emp, a.v);
            return emp;
        });
        if (options.onImported) options.onImported(added);
    }

    /* ---------- The dialog ---------- */
    function step(name) {
        $('#empImportLoading').hidden = name !== 'loading';
        $('#empImportPreview').hidden = name !== 'preview';
        $('#empImportSubmit').disabled = !(name === 'preview' && plan && (plan.added.length || plan.updates.length));
    }

    function showError(message) {
        var box = $('#empImportError');
        box.textContent = message || '';
        box.hidden = !message;
    }

    function table(heads, rows) {
        return '<div class="import-table-wrap"><table class="data-table import-table"><thead><tr>' +
            heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
            rows.slice(0, LIST_MAX).join('') + '</tbody></table></div>' +
            (rows.length > LIST_MAX ? '<p class="form-text">And ' + (rows.length - LIST_MAX) + ' more.</p>' : '');
    }

    function renderPreview(p) {
        var people = p.added.length + p.updates.length + p.same;
        var html = '<p class="import-file-meta">' + p.rows + (p.rows === 1 ? ' row' : ' rows') + ' · ' +
                people + (people === 1 ? ' employee' : ' employees') + '</p>' +
            '<div class="import-counts">' +
                '<span class="import-count' + (p.added.length ? ' is-changed' : '') + '"><strong>' + p.added.length + '</strong> new</span>' +
                '<span class="import-count' + (p.updates.length ? ' is-changed' : '') + '"><strong>' + p.updates.length + '</strong> changed</span>' +
                '<span class="import-count"><strong>' + p.same + '</strong> same as now</span>' +
                (p.problems.length ? '<span class="import-count is-problem"><strong>' + p.problems.length + '</strong> not imported</span>' : '') +
            '</div>';
        if (!p.added.length && !p.updates.length) {
            html += p.same
                ? '<div class="import-empty is-same">Nothing to import: every employee in this file is the same as in Feriiz now.' +
                    (p.problems.length ? ' The rows below were not read.' : '') + '</div>'
                : '<div class="import-empty">Nothing in this file can be imported. ' + (p.problems.length ? 'See why below.' : 'Its rows are empty.') + '</div>';
        }
        if (p.added.length) {
            html += '<h3 class="import-section-title">New employees</h3>' + table(['Code', 'Name', 'Occupation', 'Pin'], p.added.map(function (a) {
                return '<tr><td>' + (a.code ? esc(a.code) : '<span class="text-muted">Made on import</span>') + '</td><td>' + esc(a.name) + '</td>' +
                    '<td>' + esc(a.v.occupation || '-') + '</td><td>' + esc(a.v.pin || '-') + '</td></tr>';
            }));
        }
        if (p.changes.length) {
            html += '<h3 class="import-section-title">Changes</h3>' + table(['Name', 'Field', 'Now', 'After import'], p.changes.map(function (c) {
                return '<tr><td>' + esc(c.name) + '</td><td class="tpl-nowrap">' + esc(c.label) + '</td><td>' + esc(c.from) + '</td>' +
                    '<td class="import-new">' + esc(c.to) + '</td></tr>';
            }));
        }
        if (p.problems.length) {
            html += '<h3 class="import-section-title">Not imported</h3>' + table(['Row', 'Who', 'Why'], p.problems.map(function (x) {
                return '<tr><td>' + x.line + '</td><td>' + esc(x.who) + '</td><td>' + esc(x.why) + '</td></tr>';
            }));
        }
        if (p.added.length || p.updates.length) {
            html += '<p class="import-keep"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
                'An empty cell leaves its field as it is. Rate / Hour times the working day (8 hours of 08:00–17:00) is the Daily Rate.' +
                (p.newOccupations.length ? ' New occupations go to Occupations: ' + esc(p.newOccupations.join(', ')) + '.' : '') + '</p>';
        }
        $('#empImportPreview').innerHTML = html;
    }

    function readFile(file) {
        var token = ++readToken;
        showError('');
        plan = null;
        if (!file) { step('choose'); return; }
        var ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (TYPES.indexOf(ext) < 0) {
            step('choose');
            showError(file.name + ' is not an Excel file. Choose the .xlsx from Download template.');
            return;
        }
        if (file.size > MAX_BYTES) {
            step('choose');
            showError(file.name + ' is ' + fileSize(file.size) + '. The limit is 5 MB.');
            return;
        }
        $('#empImportLoadingName').textContent = file.name;
        step('loading');
        Promise.all([loadXLSX(), file.arrayBuffer(), wait(LOADING_MIN)]).then(function (res) {
            if (token !== readToken) return;
            var XLSX = res[0];
            var wb = XLSX.read(res[1], { type: 'array' });
            var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
            var p = buildPlan(readSheet(aoa), file.name);
            if (p.fatal) {
                step('choose');
                showError(file.name + ' does not look like the employee file: it has no Code or First Name column. Fill in the file from Download template and choose that one.');
                return;
            }
            plan = p;
            renderPreview(p);
            step('preview');
        }).catch(function () {
            if (token !== readToken) return;
            step('choose');
            showError(file.name + ' could not be read. Save it again as .xlsx, or check the internet connection (the Excel tool loads online).');
        });
    }

    function build() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'employeeImportModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'empImportTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable import-dialog">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<h2 class="modal-title" id="empImportTitle">Import employees</h2>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<p class="import-intro">Add or change many employees at once from a spreadsheet. ' +
                            'Use the Feriiz template so every column is read correctly.</p>' +
                        '<div class="import-file-box">' +
                            '<label class="import-file-label" for="empImportInput">Choose employee file</label>' +
                            '<span class="import-file-hint">.xlsx, up to 5 MB</span>' +
                            '<input type="file" class="form-control" id="empImportInput" accept="' + TYPES.join(',') + '">' +
                        '</div>' +
                        '<div class="import-error" id="empImportError" role="alert" hidden></div>' +
                        '<div class="import-progress" id="empImportLoading" role="status" hidden>' +
                            '<div class="import-progress-label">Reading <span id="empImportLoadingName"></span>…</div>' +
                            '<div class="progress"><div class="progress-bar progress-bar-striped progress-bar-animated w-100"></div></div>' +
                        '</div>' +
                        '<div id="empImportPreview" hidden></div>' +
                        '<button type="button" class="btn btn-outline-primary w-100 import-template-btn" id="empImportTemplate">' +
                            '<i class="fa-solid fa-download" aria-hidden="true"></i> Download template (.xlsx)</button>' +
                        '<div class="import-progress" id="empImportProgress" role="status" hidden>' +
                            '<div class="import-progress-label" id="empImportProgressLabel"></div>' +
                            '<div class="progress" role="progressbar" aria-label="Download template" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
                                '<div class="progress-bar progress-bar-striped progress-bar-animated" id="empImportProgressBar"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="empImportSubmit" disabled>Import file</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        modal = el;

        var input = el.querySelector('#empImportInput');
        input.addEventListener('change', function () { readFile(input.files[0]); });
        el.querySelector('#empImportTemplate').addEventListener('click', downloadTemplate);
        el.querySelector('#empImportSubmit').addEventListener('click', function () {
            var p = plan;
            if (!p || !(p.added.length || p.updates.length)) return;
            window.bootstrap.Modal.getInstance(el).hide();
            commit(p);
            if (window.FeriizNotify) {
                var done = [p.added.length ? p.added.length + (p.added.length === 1 ? ' employee added' : ' employees added') : '',
                            p.updates.length ? p.updates.length + (p.updates.length === 1 ? ' employee changed' : ' employees changed') : '']
                    .filter(Boolean).join(' and ');
                FeriizNotify.success(done + '.' + (p.same ? ' ' + p.same + (p.same === 1 ? ' was' : ' were') + ' the same as now.' : '') +
                    (p.problems.length ? ' ' + p.problems.length + (p.problems.length === 1 ? ' row was' : ' rows were') + ' not imported.' : ''), 'File imported');
            }
        });
        el.addEventListener('hidden.bs.modal', function () { input.value = ''; readFile(null); });
        return el;
    }

    // opts: { employees: function () { return the page's employees }, onImported: function (added) }
    function open(opts) {
        options = opts;
        if (!modal) build();
        readFile(null);
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        loadXLSX().catch(function () { /* said when a file is read */ });
    }

    window.FeriizEmployeeImport = { open: open };
})();
