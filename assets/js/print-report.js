(function () {
    'use strict';

    var printButton = null;
    var originalTitle = '';
    var JOB_VERSION = 2;   // 12-11-2026: a day keeps d / ot / r / off, not the text it printed

    function isElementVisible(el) {
        if (!el || el.hidden || el.classList.contains('day-col-hidden')) return false;
        var style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    // Every row the filters keep, on every page: the Report shows 20 at a time (page-off).
    function getVisibleRows() {
        return Array.from(document.querySelectorAll('.report-table tbody tr')).filter(function (tr) {
            return tr.classList.contains('page-off') ? !tr.hidden : isElementVisible(tr);
        });
    }

    function getVisibleDateHeaders() {
        return Array.from(document.querySelectorAll('.report-table thead th.day-col')).filter(isElementVisible);
    }

    function fromISO(dateStr) {
        var parts = String(dateStr || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatDateLabel(dateStr) {
        if (!dateStr) return '';
        var d = fromISO(dateStr);
        if (!d) return dateStr;
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function formatDateYYMMDD(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length !== 3) return '';
        var yy = parts[0].slice(-2);
        var mm = parts[1].padStart(2, '0');
        var dd = parts[2].padStart(2, '0');
        return yy + mm + dd;
    }

    function getDateRangeDetails() {
        var dateHeaders = getVisibleDateHeaders();
        var dates = dateHeaders.map(function (th) { return th.dataset.date || ''; }).filter(Boolean).sort();

        var todayStr = new Date().toISOString().slice(0, 10);
        var todayYYMMDD = formatDateYYMMDD(todayStr);

        if (dates.length > 0) {
            var start = dates[0];
            var end = dates[dates.length - 1];
            var textLabel = (start === end) ? formatDateLabel(start) : (formatDateLabel(start) + ' - ' + formatDateLabel(end));
            return {
                label: textLabel,
                startYYMMDD: formatDateYYMMDD(start),
                endYYMMDD: formatDateYYMMDD(end)
            };
        }

        var dateInputs = document.querySelectorAll('.filter-date');
        if (dateInputs.length >= 2 && (dateInputs[0].value || dateInputs[1].value)) {
            var s = dateInputs[0].value || dateInputs[1].value;
            var e = dateInputs[1].value || dateInputs[0].value;
            var sLabel = formatDateLabel(s);
            var eLabel = formatDateLabel(e);
            return {
                label: (s === e) ? sLabel : (sLabel + ' - ' + eLabel),
                startYYMMDD: formatDateYYMMDD(s) || todayYYMMDD,
                endYYMMDD: formatDateYYMMDD(e) || todayYYMMDD
            };
        }

        return {
            label: 'Current View',
            startYYMMDD: todayYYMMDD,
            endYYMMDD: todayYYMMDD
        };
    }

    function getReportContext() {
        var page = document.body.dataset.page || '';
        var projectLink = document.getElementById('reportProjectLink') ||
            document.querySelector('.breadcrumb a[href*="project_employees"]');
        var projectName = projectLink ? projectLink.textContent.trim() : 'Project Report';

        if (page === 'employee-report') {
            var currentCrumb = document.querySelector('.breadcrumb > span:last-child');
            var employeeName = currentCrumb ? currentCrumb.textContent.trim() : 'Employee';
            return {
                mainTitle: projectName,
                subtitle: employeeName + ' • Attendance & Payroll Summary',
                projectName: projectName,
                subject: employeeName,
                isEmployeePage: true
            };
        }

        return {
            mainTitle: projectName,
            subtitle: 'Attendance & Payroll Summary',
            projectName: projectName,
            subject: projectName,
            isEmployeePage: false
        };
    }

    function getFilterSummary() {
        var values = [];
        // The date range is printed as "Period" already.
        var appliedChips = Array.from(document.querySelectorAll('#filterIndicatorChips .filter-indicator-chip:not(.filter-indicator-chip--range)'))
            .map(function (chip) {
                var clone = chip.cloneNode(true);
                clone.querySelectorAll('button').forEach(function (btn) { btn.remove(); });
                return clone.textContent.trim();
            })
            .filter(Boolean);

        var searchInput = document.getElementById('reportSearch');

        if (appliedChips.length) values.push(appliedChips.join(' | '));
        if (searchInput && searchInput.value.trim()) values.push('Search: "' + searchInput.value.trim() + '"');

        // No filter, no "Active Filter" line on the print (Baldy, 09-11-2026).
        return values.join(' • ');
    }

    function escapeHTML(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function isSectionActive(sectionKey) {
        var groupHeader = document.getElementById(sectionKey);

        if (sectionKey === 'grpEmployee') {
            var cb = document.getElementById('colEmployee');
            if (cb && !cb.checked) return false;
            if (groupHeader && !isElementVisible(groupHeader)) return false;
            var empCols = document.querySelectorAll('.col-emp-dailyrate, .col-emp-rateovertime, .col-emp-totalrate, .col-emp-totalovertime');
            return Array.from(empCols).some(isElementVisible);
        }

        if (sectionKey === 'grpClient') {
            // Rate columns or request-template columns; the Client box can be half ticked.
            if (groupHeader && !isElementVisible(groupHeader)) return false;
            var cliCols = document.querySelectorAll('.col-cli-dailyrate, .col-cli-rateovertime, .col-cli-totalrate, .col-cli-totalovertime, .col-cli-add');
            return Array.from(cliCols).some(isElementVisible);
        }

        if (sectionKey === 'grpDaily') {
            return getVisibleDateHeaders().length > 0;
        }

        return true;
    }

    /* =============================================
       THE PRINT JOB (06-11-2026)
       What the Report prints, as data: every filtered row (all pages), every date, the
       columns the Columns picker shows, and for each person and day what the sheet prints
       and what the totals count, by the Report's own rules (report.js updateVisibleTotals).
       The sheet is drawn from it, so the Print Configuration tab can leave days and people out
       and count again.
       ============================================= */
    function projectCode() {
        var code = new URL(location.href).searchParams.get('project');
        if (!code) {
            try { code = sessionStorage.getItem('feriiz_active_project'); } catch (e) { code = ''; }
        }
        return code || '';
    }

    // One person's day as the Report has it: d = the Daily (0, 0.5 or 1), ot = overtime hours,
    // w = came in (Jumlah Orang Per Hari counts it), req = the requests given that day (Uang Makan…) for their
    // columns, r = the name of an accepted request on a day off work, off = a day off, and for a
    // day with data s = [hours, overtime, Daily] of the client print's Set Default.
    function dayEntry(tr, date, idx) {
        var e = { d: 0, ot: 0, w: false, req: [], r: '', off: false };
        var dayTd = tr.querySelector('td.day-col[data-date="' + date + '"]');
        if (!dayTd) {
            var allDayTds = Array.from(tr.querySelectorAll('td.day-col')).filter(isElementVisible);
            dayTd = allDayTds[idx];
        }
        if (!dayTd) return e;

        dayTd.querySelectorAll('.req-chip[data-template]').forEach(function (chip) {
            e.req.push({ t: chip.dataset.template, a: Number(chip.dataset.amount) || 0 });
        });
        var weekendOff = dayTd.classList.contains('weekend-off-cell');
        e.off = weekendOff || dayTd.classList.contains('holiday-off-cell');
        if (!weekendOff) {
            // The cell's data is its newest version, also on a split day (Show history).
            e.d = Number(dayTd.dataset.daily) || 0;
            e.ot = Number(dayTd.dataset.otTotal) || 0;
            e.w = e.d > 0;
            var def = (e.d > 0 || e.ot > 0) && window.FeriizReport ? window.FeriizReport.setDefaultFor(date, tr.dataset.employeeCode) : null;
            if (def) e.s = [def.work, def.ot, def.daily];
        }
        if (!e.off && dayTd.dataset.request) e.r = dayTd.dataset.request;
        return e;
    }

    function collectPrintJob() {
        var context = getReportContext();
        var range = getDateRangeDetails();
        var shown = function (selector) { return isElementVisible(document.querySelector(selector)); };
        var dates = getVisibleDateHeaders().map(function (th) {
            var date = th.dataset.date || '';
            var label = formatDateLabel(date);
            if (!label) {
                var textSpan = th.querySelector('span');
                label = textSpan ? textSpan.textContent.trim() : th.textContent.trim();
            }
            var d = fromISO(date);
            return { date: date, label: label, dow: d ? d.getDay() : -1 };
        });
        // The Client group's additional columns: the request templates (Transport among them), Total Additional.
        var add = Array.from(document.querySelectorAll('.report-table thead th.col-cli-add, .report-table thead th.col-cli-addtotal'))
            .filter(isElementVisible)
            .map(function (th) { return { id: th.dataset.template || '', name: th.textContent.trim(), total: !th.dataset.template }; });

        return {
            v: JOB_VERSION,
            project: { code: projectCode(), name: context.projectName },
            title: context.mainTitle,
            subtitle: context.subtitle,
            employeePage: context.isEmployeePage,
            period: range.label,
            startYYMMDD: range.startYYMMDD,
            endYYMMDD: range.endYYMMDD,
            filter: getFilterSummary(),
            generated: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            // The admin who printed it, named at the end of the sheet (13-11-2026).
            printedBy: window.FeriizReport && window.FeriizReport.account ? window.FeriizReport.account().name : '',
            pageUrl: window.location.href,
            dates: dates,
            emp: {
                active: isSectionActive('grpEmployee'),
                show: { daily: shown('.col-emp-dailyrate'), rateOT: shown('.col-emp-rateovertime'), totalR: shown('.col-emp-totalrate'), totalOT: shown('.col-emp-totalovertime') }
            },
            cli: {
                active: isSectionActive('grpClient'),
                show: { daily: shown('.col-cli-dailyrate'), rateOT: shown('.col-cli-rateovertime'), totalR: shown('.col-cli-totalrate'), totalOT: shown('.col-cli-totalovertime') },
                add: add
            },
            rows: getVisibleRows().map(function (tr) {
                var nameTd = tr.querySelector('.col-name');
                var occEl = tr.querySelector('.emp-occupation-cell') || tr.querySelector('.col-occupation');
                var occupation = occEl ? occEl.textContent.trim() : '';
                var days = {};
                dates.forEach(function (d, i) { days[d.date] = dayEntry(tr, d.date, i); });
                return {
                    code: tr.dataset.employeeCode || '',
                    name: nameTd ? (nameTd.querySelector('.emp-name-cell') || nameTd).textContent.trim() : '-',
                    occupation: occupation === '-' ? '' : occupation,
                    rates: {
                        daily: Number(tr.dataset.dailyRate) || 0,
                        ot: Number(tr.dataset.otRate) || 0,
                        clientDaily: Number(tr.dataset.clientDailyRate) || 0,
                        clientOt: Number(tr.dataset.clientOtRate) || 0
                    },
                    days: days
                };
            })
        };
    }

    /* =============================================
       THE SHEET
       Drawn from a job and a view (all optional): hidden { key: true } for the columns left out
       ('tot:days', 'tot:ot', 'emp:daily', 'emp:rateOT', 'emp:totalR', 'emp:totalOT', 'emp:sub',
       'cli:…', 'cli:add:ID', 'cli:addtotal', 'pay:emp', 'pay:cli'; 'emp' or 'cli' for a whole
       group), cut { 'p:YYYY-MM-DD': true, 'o:YYYY-MM-DD': true } for a date's Period (daily) or
       Overtime (hour) printed empty under its header, rowsOff { CODE: true } for people left
       out, client: the client print, where every day with data prints and counts the Set Default
       of the person's occupation (meeting 05-11-2026, 0:05:07: "ketika udah di print… semuanya
       itu harus 8 per 2"). Since 12-11-2026 (Baldy):
       - Period is the Daily, 0, 0.5 or 1, and Overtime is whole hours, 1.5 counts 1 ("isi nya
         itu cuma ada 0, 0.5, dan 1… overtime dia berdasakan hour… tidak ada setengah seperti
         1.30"). The headers are written out ("jangan kita singkat").
       - What is cut or left out no longer counts ("ketika ada yang di hide itu harus ada
         pengaruh buat penotalan"): pay is per day, Daily Rate × Period and Overtime Rate ×
         hours, and the requests (Transport, Uang Makan…) go with a day's Period. A money column left out
         never changes what a person is paid.
       - People are grouped by occupation, A to Z, each group headed by its name in the Name
         column and numbered from 1 ("no nya juga khusus… tukang plumbing dia jadi dari 1 lagi").
       - White cells only, no stripes ("bener bener putih clean aja"), and no cards in the
         header ("desain card dan kaya detail… di apus aja").
       ============================================= */
    // As the Report writes an amount (formatIDR), without "IDR": the column header says it once.
    function idr(n) { return Number(n || 0).toLocaleString('id-ID'); }

    // A subtotal or a payment: whole rupiah, "0" for nothing.
    function rupiah(n) { return n ? Math.round(n).toLocaleString('id-ID') : '0'; }

    function wholeHours(h) { return Math.max(0, Math.floor((Number(h) || 0) + 1e-9)); }

    function figure(n) { return String(Math.round(n * 100) / 100); }

    var EMP_COLS = [['daily', 'Daily<br>Rate'], ['rateOT', 'Overtime Rate<br>/ Hour'], ['totalR', 'Total<br>Rate'], ['totalOT', 'Total<br>Overtime Rate']];

    // Every column the sheet can print, with its key, label and group (the client print leaves the
    // Employee ones out).
    function allColumns(job) {
        var groupCols = function (group, def, extra) {
            var cols = [];
            if (!def.active) return cols;
            EMP_COLS.forEach(function (c) {
                if (def.show[c[0]]) cols.push({ key: group + ':' + c[0], f: c[0], label: c[1], group: group });
            });
            (extra || []).forEach(function (c) { cols.push(c); });
            if (cols.length) cols.push({ key: group + ':sub', f: 'sub', label: 'Subtotal<br>Rate', group: group });
            return cols;
        };
        var addCols = (job.cli.add || []).map(function (a) {
            return { key: a.total ? 'cli:addtotal' : 'cli:add:' + a.id, f: a.total ? 'addtotal' : 'add', id: a.id, label: escapeHTML(a.name), group: 'cli' };
        });
        var pay = [];
        if (job.emp.active) pay.push({ key: 'pay:emp', f: 'emp', label: 'Total Payment<br>Employee<br>(IDR)', group: 'emp' });
        if (job.cli.active) pay.push({ key: 'pay:cli', f: 'cli', label: 'Total Payment<br>Client<br>(IDR)', group: 'cli' });
        return {
            totals: [{ key: 'tot:days', f: 'days', label: 'Total Period<br>(daily)', cls: 'th-total-days' },
                     { key: 'tot:ot', f: 'ot', label: 'Total Overtime<br>(hour)', cls: 'th-total-ot' }],
            emp: groupCols('emp', job.emp),
            cli: groupCols('cli', job.cli, addCols),
            pay: pay
        };
    }

    // The columns that print.
    function sheetColumns(job, view) {
        var hidden = (view && view.hidden) || {};
        var all = allColumns(job);
        var on = function (c) { return !hidden[c.key] && !(c.group && hidden[c.group]); };
        return { totals: all.totals.filter(on), emp: all.emp.filter(on), cli: all.cli.filter(on), pay: all.pay.filter(on) };
    }

    // People by occupation, A to Z (no occupation last), in the Report's order within each.
    function groupsOf(rows) {
        var byName = {};
        rows.forEach(function (row) { (byName[row.occupation || ''] || (byName[row.occupation || ''] = [])).push(row); });
        return Object.keys(byName).sort(function (a, b) {
            if (!a || !b) return a ? -1 : b ? 1 : 0;
            return a.localeCompare(b);
        }).map(function (name) { return { name: name || 'No occupation', rows: byName[name] }; });
    }

    // A day as the sheet prints and counts it: as the Report has it (its newest version), in the
    // client print a day with data at its Set Default. Overtime in whole hours. The Internal print's
    // "System" data, each day as the machine recorded it (v3.7.110–3.7.115), is taken out (Baldy,
    // 13-11-2026: "ga di minta deh kayanya apus dulu").
    function sheetDay(row, date, client) {
        var e = row.days[date];
        if (!e) return null;
        if (client && e.s) return { d: e.s[2] != null ? e.s[2] : 1, ot: wholeHours(e.s[1]), w: true, req: e.req || [], r: '', off: false };
        return { d: Number(e.d) || 0, ot: wholeHours(e.ot), w: Boolean(e.w), req: e.req || [], r: e.r || '', off: Boolean(e.off) };
    }

    // One person's figures over the job's dates, without what is cut: pay is per day (Total Rate
    // = Daily Rate x Period), overtime per whole hour, the requests on the days whose Period prints.
    function rowFigures(row, job, view) {
        var cut = view.cut || {};
        var days = 0, ot = 0, req = {}, reqTotal = 0;
        job.dates.forEach(function (d) {
            if (cut['d:' + d.date]) return;   // a date left out whole
            var e = sheetDay(row, d.date, view.client);
            if (!e) return;
            if (!cut['p:' + d.date]) {
                days += e.d;
                e.req.forEach(function (r) {
                    var item = req[r.t] || (req[r.t] = { n: 0, a: 0 });
                    item.n++;
                    item.a += r.a;
                    reqTotal += r.a;
                });
            }
            if (!cut['o:' + d.date]) ot += e.ot;
        });
        var r = row.rates;
        var f = { days: days, ot: ot, req: req, add: reqTotal };
        f.emp = { daily: r.daily, rateOT: r.ot, totalR: days * r.daily, totalOT: ot * r.ot };
        f.cli = { daily: r.clientDaily, rateOT: r.clientOt, totalR: days * r.clientDaily, totalOT: ot * r.clientOt };
        f.emp.sub = f.emp.totalR + f.emp.totalOT;
        f.cli.sub = f.cli.totalR + f.cli.totalOT;
        f.pay = { emp: f.emp.sub, cli: f.cli.sub + f.add };
        return f;
    }

    // The file name a "Save as PDF" suggests: the period, the project and what the sheet holds.
    function sheetIdentifier(job, view) {
        var cols = sheetColumns(job, { hidden: (view && view.hidden) || {} });
        var parts = [job.startYYMMDD + '_' + job.endYYMMDD,
                     String(job.project.name || '').toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9_\-&]/g, '')];
        var cutDates = (view && view.cut) || {};
        if (job.dates.some(function (d) { return !cutDates['d:' + d.date]; })) parts.push('DAILY');
        if (cols.emp.length) parts.push('EMPLOYEE');
        if (cols.cli.length) parts.push('CLIENT');
        return parts.join('_');
    }

    // What a day prints under Period and Overtime: the figures, "-" on a day off. A day of leave
    // prints its figures like any day nobody worked, 0 and 0: no "Sick Leave" on paper, as the
    // old Feriiz did not have it (Baldy, 13-11-2026: "kalau emang tidak seperti itu di data lama
    // mending gausah").
    function periodText(e) {
        if (!e) return '-';
        return e.off ? '-' : figure(e.d);
    }

    function overtimeText(e) {
        if (!e || e.off) return '-';
        return String(e.ot);
    }

    // A date's header on paper: the weekday in Indonesian over the date (Baldy, 13-11-2026:
    // "mereka juga mau itu ada harinya juga… hari nya itu pake bahasa indonesia"; meeting
    // 10-11-2026, 00:12:30: "tambahin tulisan hari").
    var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    function dateHead(d) {
        var day = d.dow >= 0 ? d.dow : (fromISO(d.date) ? fromISO(d.date).getDay() : -1);
        return (day >= 0 ? '<span class="th-weekday">' + HARI[day] + '</span>' : '') + escapeHTML(d.label);
    }

    // A header as printed: "Overtime" may break as "Over / time" in a narrow column, no hyphen
    // (Baldy, 13-11-2026: "overtime gausah ada '-'"), never "Overti-me".
    function headHTML(label) { return String(label).replace(/Overtime/g, 'Over<wbr>time'); }

    /* What the real system's print has and ours lacked (Baldy, 13-11-2026, with two prints of
       it: "di printnan dia tambahin ini aja ya"; "di pages kedua juga ada text itu nya dan ada
       nama admin nya, di kita kan gada ya… adain dong"): the period under the project; at the top
       of every page when it printed and the file's name (the sheet's identifier); at the end the
       admin who printed it, with the date. Chrome writes its own date and title only when its
       "Headers and footers" is ticked and the page margin has room, which our 6mm had not, so
       the sheet sets them in the page's margin boxes (pageBoxes), with the page number. */
    var DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                    'October', 'November', 'December'];

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    // "Mon, 09 November 2026"; with the whole weekday "Friday, 13 November 2026".
    function longDate(d, wholeDay) {
        var day = DAY_EN[d.getDay()];
        return (wholeDay ? day : day.slice(0, 3)) + ', ' + pad2(d.getDate()) + ' ' + MONTH_EN[d.getMonth()] + ' ' + d.getFullYear();
    }

    // The Report's period, its first and last date: "Mon, 09 November 2026 - Sun, 15 November 2026".
    function periodLine(job) {
        var first = job.dates.length ? fromISO(job.dates[0].date) : null;
        var last = job.dates.length ? fromISO(job.dates[job.dates.length - 1].date) : null;
        if (!first || !last) return job.period || '';
        return first.getTime() === last.getTime() ? longDate(first) : longDate(first) + ' - ' + longDate(last);
    }

    // When it prints, as Chrome writes it in its header: "13/11/2026, 10:59".
    function printedStamp(now) {
        return pad2(now.getDate()) + '/' + pad2(now.getMonth() + 1) + '/' + now.getFullYear() + ', ' +
            pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    }

    function cssString(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"'; }

    // The margin boxes of every printed page: when it prints at the top left, the file's name at
    // the top right, the page number at the bottom right. page: the named page ('feriiz-preview'
    // in the Print Configuration) or '' for the Report's own print.
    function pageBoxes(job, view, page) {
        var box = 'font-family: Poppins, Arial, sans-serif; font-size: 6.5pt; line-height: 1.2; color: #475569;';
        var top = box + ' vertical-align: bottom; padding-bottom: 1.6mm;';
        return '@page' + (page ? ' ' + page : '') + ' {' +
            ' @top-left { content: ' + cssString(printedStamp(new Date())) + '; ' + top + ' }' +
            ' @top-right { content: ' + cssString(sheetIdentifier(job, view)) + '; ' + top + ' }' +
            ' @bottom-right { content: counter(page) " / " counter(pages); ' + box + ' vertical-align: top; padding-top: 1.6mm; }' +
            ' }';
    }

    // Puts them on the page, in a <style> of their own that each print replaces.
    function setPageBoxes(job, view, page) {
        var st = document.getElementById('feriizPageBoxes');
        if (!st) {
            st = document.createElement('style');
            st.id = 'feriizPageBoxes';
            document.head.appendChild(st);
        }
        st.textContent = pageBoxes(job, view, page);
    }

    // What a money cell says: the rates and totals as the Report writes them, the additional
    // columns "-" when there is nothing to pay.
    function moneyText(c, f) {
        var group = c.group === 'emp' ? f.emp : f.cli;
        if (c.f === 'sub') return rupiah(group.sub);
        if (c.f === 'add') return f.req[c.id] ? idr(f.req[c.id].a) : '-';
        if (c.f === 'addtotal') return f.add ? idr(f.add) : '-';
        return idr(group[c.f]);
    }

    /* How wide each column must be, in mm on A4 landscape at the A4 type sizes: its widest
       figure, its longest name (two lines past 22 letters) or the longest word of its header
       (columnWidths). The sheet then takes the type that fills the 287mm between the margins and
       every column gets its share of the width, so none is left half empty (Baldy, 13-11-2026:
       "coloms nya ini itu baik nya gimana… cuma nanti bakal menyisahkan… font nya juga
       perbesar"); a period too long for one table is split (sheetPlan). A3 and A2 grow the type
       with the paper, so the fit holds there. */
    var PT_MM = 0.3528;
    var A4_WIDTH = 287;

    function textMM(chars, em, pt) { return chars * em * pt * PT_MM; }

    function headMM(label) {
        var longest = String(headHTML(label)).replace(/<[^>]+>/g, ' ')
            .split(/\s+/).reduce(function (m, w) { return Math.max(m, w.length); }, 0);
        return textMM(longest, 0.6, 6.2) + 0.6;
    }

    function figureMM(chars, bold) { return textMM(Math.max(chars, 1), bold ? 0.64 : 0.6, 9.5) + 1.1; }

    // How wide each column must be, in mm at the A4 landscape type: No and Name, each date's
    // Period and Overtime, and the totals, money and payments by their key. A name is measured
    // at its widest letters (0.68 em: "Bambang Ramadhani" printed at 0.665) with room for its
    // padding, which does not shrink with the type, so it keeps to one line up to 22 letters;
    // "No" has that room too (it broke as "N / o" in a table at 0.86).
    function columnWidths(job, view, cols, printed, figures, dates) {
        var maxOf = function (fn) { return printed.reduce(function (m, row) { return Math.max(m, fn(row)); }, 0); };
        var id = [Math.max(textMM(String(printed.length).length, 0.6, 8) + 1.1, headMM('No') + 1.2),
                  Math.max(textMM(Math.min(22, maxOf(function (r) { return r.name.length; })), 0.68, 8.3) + 2.8, headMM('Name'))];
        var days = {};
        dates.forEach(function (d) {
            var p = 1, o = 1;
            printed.forEach(function (row) {
                var e = sheetDay(row, d.date, view.client);
                if (e) { p = Math.max(p, figure(e.d).length); o = Math.max(o, String(e.ot).length); }
            });
            days[d.date] = [Math.max(figureMM(p), headMM('Period<br>(daily)')), Math.max(figureMM(o), headMM('Overtime<br>(hour)'))];
        });
        var col = {};
        cols.totals.forEach(function (c) {
            col[c.key] = Math.max(figureMM(maxOf(function (row) { var f = figures[row.code]; return String(c.f === 'days' ? figure(f.days) : f.ot).length; })), headMM(c.label));
        });
        cols.emp.concat(cols.cli).forEach(function (c) {
            col[c.key] = Math.max(figureMM(maxOf(function (row) { return moneyText(c, figures[row.code]).length; })), headMM(c.label));
        });
        cols.pay.forEach(function (c) {
            col[c.key] = Math.max(figureMM(maxOf(function (row) { return rupiah(figures[row.code].pay[c.f]).length; }), true), headMM(c.label));
        });
        return { id: id, days: days, col: col };
    }

    function sumOf(list) { return list.reduce(function (a, b) { return a + b; }, 0); }

    // A table's totals, money and payment columns, in the order they print.
    function tailColumns(tail) { return tail ? tail.totals.concat(tail.emp, tail.cli, tail.pay) : []; }

    /* How the sheet lies on the paper (Baldy, 13-11-2026: a month on A4 printed words broken
       into letters and money over money, "gak harus fit banget… bakal jadi kacau balau…
       sesuaikan di semua kondisi"). One table, the rows going right as in the Report, whenever it
       fits at FIT_ONE of the A4 landscape type or more: a week, Employee and Client with it
       ("jangan di jadiin 2 tabel gitu… dia tetap baris kekanan"). Only a longer period is split,
       every table with No and Name: the dates in even blocks as wide as the paper, then the
       totals, money and payments (in two parts, Employee and Client each with its Total Payment,
       when one is too wide), each at FIT_MIN or more; then every table takes the same type, at
       most the A4 one. A3 and A2 grow the type with the paper (the tiers in style.css), so the
       same plan holds there. */
    var FIT_ONE = 0.6;
    var FIT_MIN = 0.85;
    var FIT_MAX = 1.4;

    function sheetPlan(job, view, cols, printed, figures, dates, narrow) {
        var w = columnWidths(job, view, cols, printed, figures, dates);
        // Inside the margins, in mm: a wide page (A4 landscape) 287, a narrow one (A4 portrait)
        // 200, where the type tiers start at about 3/4 of the landscape type (tier).
        var room = narrow ? 200 : A4_WIDTH;
        var tier = narrow ? 0.75 : 1;
        var idW = sumOf(w.id);
        var dayW = function (d) { return w.days[d.date][0] + w.days[d.date][1]; };
        var partW = function (part) { return sumOf(tailColumns(part).map(function (c) { return w.col[c.key]; })); };
        var all = { totals: cols.totals, emp: cols.emp, cli: cols.cli, pay: cols.pay };
        var tailW = partW(all);
        var tables;
        if (room / (idW + sumOf(dates.map(dayW)) + tailW) >= FIT_ONE) {
            tables = [{ dates: dates, tail: tailW ? all : null }];
        } else {
            var tails = [];
            if (room / (idW + tailW) >= FIT_MIN) {
                if (tailW) tails.push(all);
            } else {
                var payOf = function (g) { return cols.pay.filter(function (c) { return c.f === g; }); };
                [{ totals: cols.totals, emp: [], cli: [], pay: [] },
                 { totals: [], emp: cols.emp, cli: [], pay: payOf('emp') },
                 { totals: [], emp: [], cli: cols.cli, pay: payOf('cli') }].forEach(function (part) {
                    if (!partW(part)) return;
                    var last = tails[tails.length - 1];
                    var joined = last && { totals: last.totals.concat(part.totals), emp: last.emp.concat(part.emp),
                                           cli: last.cli.concat(part.cli), pay: last.pay.concat(part.pay) };
                    if (joined && room / (idW + partW(joined)) >= FIT_MIN) tails[tails.length - 1] = joined;
                    else tails.push(part);
                });
            }
            // The type the tails allow, at most the A4 one, and the dates in even blocks at it.
            var type = Math.max(0.6, tails.reduce(function (s, part) { return Math.min(s, room / (idW + partW(part))); }, 1));
            tables = [];
            if (dates.length) {
                var per = Math.max(1, Math.floor((room / type - idW) / (sumOf(dates.map(dayW)) / dates.length)));
                per = Math.ceil(dates.length / Math.ceil(dates.length / per));   // even blocks, the last the smallest
                for (var i = 0; i < dates.length; i += per) tables.push({ dates: dates.slice(i, i + per), tail: null });
                // The first part of the tail sits after the last dates when it fits there at that
                // type (the totals alone, often), as in one table, not in a narrow table of its own.
                var lastBlock = tables[tables.length - 1];
                if (tails.length && room / (idW + sumOf(lastBlock.dates.map(dayW)) + partW(tails[0])) >= type) lastBlock.tail = tails.shift();
            }
            tails.forEach(function (part) { tables.push({ dates: [], tail: part }); });
        }
        tables.forEach(function (t) {
            t.widths = w.id.slice();
            t.dates.forEach(function (d) { t.widths.push(w.days[d.date][0], w.days[d.date][1]); });
            tailColumns(t.tail).forEach(function (c) { t.widths.push(w.col[c.key]); });
            t.total = sumOf(t.widths);
        });
        var fit = Math.min.apply(null, tables.map(function (t) { return room / t.total; }));
        var most = tables.length > 1 ? 1 : FIT_MAX;
        // --fit scales the tier's type: in portrait the tier is about 3/4 of the landscape type.
        return { tables: tables, scale: Math.max(0.6, Math.min(most, fit)) / tier };
    }

    // The Print Configuration's table: everything in one, at the A4 landscape type, as wide as it
    // needs; the screen scrolls it sideways like the Report and it fills the width when narrower
    // (Baldy, 13-11-2026: "di kanan kosong kok isi aja… walau pas di print beda itu gapapa
    // wajar… kita gausah samain dengan ukuran hasil").
    function screenTable(job, view, cols, printed, figures, dates) {
        var w = columnWidths(job, view, cols, printed, figures, dates);
        var all = { totals: cols.totals, emp: cols.emp, cli: cols.cli, pay: cols.pay };
        var t = { dates: dates, tail: tailColumns(all).length ? all : null, widths: w.id.slice() };
        dates.forEach(function (d) { t.widths.push(w.days[d.date][0], w.days[d.date][1]); });
        tailColumns(t.tail).forEach(function (c) { t.widths.push(w.col[c.key]); });
        t.total = sumOf(t.widths);
        return t;
    }

    // One table of the sheet: No and Name, its dates, and the totals, money and payments it holds.
    function tableHTML(t, isNext, ctx) {
        var view = ctx.view, cut = ctx.cut, printed = ctx.printed, figures = ctx.figures;
        var tail = t.tail;
        var money = tail ? tail.emp.concat(tail.cli) : [];
        var span = 2 + t.dates.length * 2 + tailColumns(tail).length;
        // Two header rows when a date or a money group has its columns under it.
        var rs = t.dates.length || money.length ? ' rowspan="2"' : '';

        var html = '<div class="report-print-section' + (isNext ? ' is-next' : '') + '" style="--fit:' + ctx.scale.toFixed(3) + '">' +
            '<table class="report-print-table report-unified-table"' + (ctx.width ? ' style="--sheet-w:' + ctx.width.toFixed(1) + 'mm"' : '') + '>';
        html += '<colgroup>' + t.widths.map(function (w) { return '<col style="width:' + (w / t.total * 100).toFixed(3) + '%">'; }).join('') + '</colgroup>';

        // Header rows
        html += '<thead><tr><th' + rs + ' class="th-no">No</th><th' + rs + ' class="th-name">Name</th>';
        t.dates.forEach(function (d) { html += '<th colspan="2" class="th-group th-date-grp">' + dateHead(d) + '</th>'; });
        if (tail) {
            tail.totals.forEach(function (c) { html += '<th' + rs + ' class="' + c.cls + '">' + headHTML(c.label) + '</th>'; });
            if (tail.emp.length) html += '<th colspan="' + tail.emp.length + '" class="th-group th-emp-grp">Employee (IDR)</th>';
            if (tail.cli.length) html += '<th colspan="' + tail.cli.length + '" class="th-group th-cli-grp">Client (IDR)</th>';
            tail.pay.forEach(function (c) { html += '<th' + rs + ' class="th-total-pay">' + headHTML(c.label) + '</th>'; });
        }
        html += '</tr>';
        if (rs) {
            html += '<tr>';
            t.dates.forEach(function () { html += '<th>Period<br>(daily)</th><th>' + headHTML('Overtime<br>(hour)') + '</th>'; });
            money.forEach(function (c) { html += '<th>' + headHTML(c.label) + '</th>'; });
            html += '</tr>';
        }
        html += '</thead><tbody>';

        // Rows, by occupation, each group numbered from 1.
        groupsOf(printed).forEach(function (group) {
            html += '<tr class="tr-group"><td class="td-no"></td><td class="td-group" colspan="' + (span - 1) + '">' + escapeHTML(group.name) + '</td></tr>';
            group.rows.forEach(function (row, index) {
                var f = figures[row.code];
                html += '<tr><td class="td-no">' + (index + 1) + '</td>';
                html += '<td class="td-name"><div class="print-emp-name">' + escapeHTML(row.name) + '</div></td>';
                t.dates.forEach(function (d) {
                    var e = sheetDay(row, d.date, view.client);
                    html += '<td class="td-daily-period">' + (cut['p:' + d.date] ? '' : periodText(e)) + '</td>';
                    html += '<td class="td-daily-ot">' + (cut['o:' + d.date] ? '' : overtimeText(e)) + '</td>';
                });
                if (tail) {
                    tail.totals.forEach(function (c) {
                        html += '<td class="' + (c.f === 'days' ? 'td-total-days' : 'td-total-ot') + '">' + (c.f === 'days' ? figure(f.days) : f.ot) + '</td>';
                    });
                    money.forEach(function (c) {
                        html += '<td class="td-rate' + (c.f === 'sub' ? ' td-subtotal' : '') + '">' + moneyText(c, f) + '</td>';
                    });
                    tail.pay.forEach(function (c) { html += '<td class="td-payment">' + rupiah(f.pay[c.f]) + '</td>'; });
                }
                html += '</tr>';
            });
        });

        html += '</tbody><tfoot>';
        var sum = function (fn) { return printed.reduce(function (a, row) { return a + fn(figures[row.code]); }, 0); };

        // "Jumlah Orang Per Hari" (Arcon's sheet): how many of the printed people came in on each
        // date whose Period prints, and with the totals those person-days under Total Period.
        if (t.dates.length) {
            html += '<tr class="tr-people-row"><td colspan="2" class="td-total-label">Jumlah Orang Per Hari</td>';
            t.dates.forEach(function (d) {
                html += '<td colspan="2" class="td-people-count">' + (cut['p:' + d.date] ? '' : ctx.cameIn[d.date]) + '</td>';
            });
            if (tail) {
                tail.totals.forEach(function (c) {
                    html += '<td class="' + (c.f === 'days' ? 'td-people-count' : '') + '">' + (c.f === 'days' ? ctx.personDays : '') + '</td>';
                });
                var restCols = money.length + tail.pay.length;
                if (restCols) html += '<td colspan="' + restCols + '"></td>';
            }
            html += '</tr>';
        }

        // Total row: the printed people's figures. Without dates the totals have their sums too;
        // with dates and no money or payments it would hold only its label, so it is left out.
        if (tail && (!t.dates.length || money.length || tail.pay.length)) {
            if (t.dates.length) {
                html += '<tr class="tr-total-row"><td colspan="' + (2 + t.dates.length * 2 + tail.totals.length) + '" class="td-total-label">Total</td>';
            } else {
                html += '<tr class="tr-total-row"><td colspan="2" class="td-total-label">Total</td>';
                tail.totals.forEach(function (c) {
                    html += '<td class="td-total-cell">' + (c.f === 'days' ? figure(sum(function (f) { return f.days; })) : sum(function (f) { return f.ot; })) + '</td>';
                });
            }
            money.forEach(function (c) {
                var group = c.group;
                var text = '';
                if (c.f === 'sub') text = rupiah(sum(function (f) { return f[group].sub; }));
                else if (c.f === 'totalR' || c.f === 'totalOT') text = rupiah(sum(function (f) { return f[group][c.f]; }));
                else if (c.f === 'add') text = rupiah(sum(function (f) { return f.req[c.id] ? f.req[c.id].a : 0; }));
                else if (c.f === 'addtotal') text = rupiah(sum(function (f) { return f.add; }));
                html += '<td class="td-rate' + (c.f === 'sub' ? ' td-subtotal' : '') + ' td-total-cell">' + text + '</td>';
            });
            tail.pay.forEach(function (c) {
                html += '<td class="td-payment td-total-cell">' + rupiah(sum(function (f) { return f.pay[c.f]; })) + '</td>';
            });
            html += '</tr>';
        }
        return html + '</tfoot></table></div>';
    }

    function renderPrintSheet(job, view) {
        view = view || {};
        var cut = view.cut || {};
        var rowsOff = view.rowsOff || {};
        var cols = sheetColumns(job, view);
        var printed = job.rows.filter(function (r) { return !rowsOff[r.code]; });
        // A date left out whole has no column (Baldy, 13-11-2026: the box before a date "hari nya
        // yang ke hide sebaris"); its Period and Overtime off keep the column, empty.
        var dates = job.dates.filter(function (d) { return !cut['d:' + d.date]; });

        // Header: what the sheet is, and the filter when one is on (a job saved before 3.7.71
        // still says "All active data (No filter)").
        // Under the project only the person, on an Employee Report's print: no "Attendance & Payroll
        // Summary" line and no data note (Baldy, 13-11-2026, "di hapus").
        // Then the period. Above it, on screen only, what the top of every printed page says
        // (pageBoxes); the paper has it in its margin.
        var now = new Date();
        var person = job.employeePage ? String(job.subtitle || '').split(' • ')[0] : '';
        var html = '<div class="report-print-running" aria-hidden="true"><span>' + escapeHTML(printedStamp(now)) + '</span>' +
                '<span>' + escapeHTML(sheetIdentifier(job, view)) + '</span></div>' +
            '<div class="report-print-header">' +
            '<div class="report-print-title-group">' +
                '<h1 class="report-print-project-title">' + escapeHTML(job.title) + '</h1>' +
                (person ? '<p class="report-print-project-subtitle">' + escapeHTML(person) + '</p>' : '') +
                '<p class="report-print-period">' + escapeHTML(periodLine(job)) + '</p>' +
            '</div>';
        if (job.filter && job.filter !== 'All active data (No filter)') {
            html += '<div class="report-print-filter-summary"><strong>Active Filter:</strong> ' + escapeHTML(job.filter) + '</div>';
        }
        html += '</div>';

        var figures = {};
        printed.forEach(function (row) { figures[row.code] = rowFigures(row, job, view); });
        var cameIn = {};
        var personDays = 0;
        dates.forEach(function (d) {
            cameIn[d.date] = printed.filter(function (row) { var e = sheetDay(row, d.date, view.client); return e && e.w; }).length;
            if (!cut['p:' + d.date]) personDays += cameIn[d.date];
        });
        /* The tables twice, fitted to a wide page and to a narrow one: the paper and Layout picked
           in the print dialog print the fit for its width (style.css, a container query on the
           sheet's own width; the print dialog's Layout reaches no script). A4 landscape, A3 and
           wider take the wide fit, A4 portrait the narrow one (Baldy, 13-11-2026: the Print
           Configuration's Landscape | Portrait went, "jangan samain banget dengan yang di print…
           ketika print mungkin besaran nya beda"). */
        [false, true].forEach(function (narrow) {
            var plan = sheetPlan(job, view, cols, printed, figures, dates, narrow);
            var ctx = { cols: cols, view: view, cut: cut, printed: printed, figures: figures, scale: plan.scale, cameIn: cameIn, personDays: personDays };
            html += '<div class="report-print-fit report-print-fit--' + (narrow ? 'narrow' : 'wide') + '">';
            plan.tables.forEach(function (t, i) { html += tableHTML(t, i > 0, ctx); });
            html += '</div>';
        });
        // The Print Configuration shows one table of everything instead (screenTable).
        if (view.screen) {
            var whole = screenTable(job, view, cols, printed, figures, dates);
            html += '<div class="report-print-fit report-print-fit--screen">' +
                tableHTML(whole, false, { cols: cols, view: view, cut: cut, printed: printed, figures: figures, scale: 1, cameIn: cameIn,
                                          personDays: personDays, width: whole.total }) + '</div>';
        }

        // The admin who printed it and the date, after the last table.
        html += '<div class="report-print-signoff">' +
            (job.printedBy ? '<div class="report-print-signoff-name">' + escapeHTML(job.printedBy) + '</div>' : '') +
            '<div class="report-print-signoff-date">' + escapeHTML(longDate(now, true)) + '</div></div>';

        // Footer
        html += '<div class="report-print-footer">' +
            '<div class="report-print-footer-url">' + escapeHTML(job.pageUrl) + '</div>' +
            '<div class="report-print-footer-page"></div>' +
        '</div>';
        return html;
    }

    /* =============================================
       PRINT FROM THE REPORT
       The Print button opens the Print Configuration tab (report_print.html) with the job, where
       the sheet can lose columns, days and people before it prints (Baldy, 06-11-2026; the
       meeting of 05-11, 1:55: "begitu di-print, kamu buka dulu new tab"). The browser's own
       Print (Ctrl+P) still prints the Report's sheet as it is.
       ============================================= */
    var JOBS_KEY = 'feriiz_print_jobs_v1';
    var JOBS_KEPT = 3;

    function readJobs() {
        try { return JSON.parse(localStorage.getItem(JOBS_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    // The newest few jobs only: an old preview tab reloaded later finds nothing and says so.
    function saveJob(job) {
        var jobs = readJobs();
        var id = 'P' + Date.now().toString(36).toUpperCase();
        jobs[id] = job;
        Object.keys(jobs).sort().slice(0, -JOBS_KEPT).forEach(function (old) { delete jobs[old]; });
        try {
            localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
        } catch (e) {
            return null;
        }
        return id;
    }

    function loadJob(id) {
        var job = readJobs()[id];
        return job && job.v === JOB_VERSION ? job : null;
    }

    function prepareForPrint() {
        var visibleRows = getVisibleRows();
        if (visibleRows.length === 0) return null;

        var main = document.querySelector('main.main-content') || document.body;
        var printDoc = document.getElementById('reportPrintDocument');
        if (!printDoc) {
            printDoc = document.createElement('div');
            printDoc.id = 'reportPrintDocument';
            printDoc.className = 'report-print-document';
            main.appendChild(printDoc);
        }
        var job = collectPrintJob();
        printDoc.innerHTML = renderPrintSheet(job, {});
        setPageBoxes(job, {}, '');
        var identifier = sheetIdentifier(job, {});
        if (!originalTitle) {
            originalTitle = document.title;
        }
        document.title = identifier;
        var layout = document.querySelector('.report-layout');
        if (layout) layout.classList.add('report-printing');

        document.querySelectorAll('.filter-dropdown.show, #downloadDropdown.show, #batchUpdateDropdown.show')
            .forEach(function (dd) { dd.classList.remove('show'); });

        return identifier;
    }

    function restoreAfterPrint() {
        if (originalTitle) {
            document.title = originalTitle;
            originalTitle = '';
        }
        var layout = document.querySelector('.report-layout');
        if (layout) layout.classList.remove('report-printing');

        if (printButton) {
            printButton.disabled = false;
            printButton.classList.remove('is-preparing');
            printButton.innerHTML = '<i class="fa-solid fa-print"></i><span class="report-action-label">Print</span>';
        }
    }

    function onPrintButtonClick(e) {
        if (e) e.preventDefault();

        var visibleRows = getVisibleRows();
        if (visibleRows.length === 0) {
            if (window.FeriizNotify) {
                window.FeriizNotify.warning('No report rows match the active filters.', 'Nothing to print');
            } else {
                alert('No report rows match the active filters.');
            }
            return;
        }

        // The tab opens inside the click, so the browser lets it through.
        var id = saveJob(collectPrintJob());
        var tab = id ? window.open('report_print.html?job=' + encodeURIComponent(id), '_blank') : null;
        if (tab) return;

        // No preview (pop-ups blocked, or no room to keep the job): print here, as before.
        if (window.FeriizNotify) {
            window.FeriizNotify.warning(id ? 'The browser blocked the Print Configuration tab, so the report prints from here.'
                : 'The Print Configuration could not be prepared, so the report prints from here.', 'Print Configuration');
        }
        if (printButton) {
            printButton.disabled = true;
            printButton.classList.add('is-preparing');
            printButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span class="report-action-label">Preparing...</span>';
        }
        prepareForPrint();
        window.print();
        restoreAfterPrint();
    }

    function init() {
        printButton = document.getElementById('reportPrintBtn');
        if (!document.querySelector('.report-table')) return;

        if (printButton) {
            printButton.addEventListener('click', onPrintButtonClick);
        }

        window.addEventListener('beforeprint', function () {
            prepareForPrint();
        });

        window.addEventListener('afterprint', function () {
            restoreAfterPrint();
        });
    }

    // The Print Configuration tab draws the same sheet.
    window.FeriizPrintSheet = {
        load: loadJob,
        render: renderPrintSheet,
        pageBoxes: setPageBoxes,
        identifier: sheetIdentifier,
        columns: allColumns,
        groups: groupsOf
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
