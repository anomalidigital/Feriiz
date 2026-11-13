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
       The sheet is drawn from it, so the Print preview tab can leave columns, days and
       people out and count again.
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
    // day with data s = [hours, overtime] of the client print's Set Default.
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
            if (def) e.s = [def.work, def.ot];
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

    // Every column the sheet can print, with its key, label and group (the Print preview lists them).
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

    // A day as the sheet prints and counts it: as the Report has it, or in the client print a
    // day with data at its Set Default. Overtime in whole hours.
    function sheetDay(row, date, client) {
        var e = row.days[date];
        if (!e) return null;
        if (client && e.s) return { d: 1, ot: wholeHours(e.s[1]), w: true, req: e.req || [], r: '', off: false };
        return { d: Number(e.d) || 0, ot: wholeHours(e.ot), w: Boolean(e.w), req: e.req || [], r: e.r || '', off: Boolean(e.off) };
    }

    // One person's figures over the job's dates, without what is cut: pay is per day (Total Rate
    // = Daily Rate x Period), overtime per whole hour, the requests on the days whose Period prints.
    function rowFigures(row, job, view) {
        var cut = view.cut || {};
        var days = 0, ot = 0, req = {}, reqTotal = 0;
        job.dates.forEach(function (d) {
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
        if (job.dates.length) parts.push('DAILY');
        if (cols.emp.length) parts.push('EMPLOYEE');
        if (cols.cli.length) parts.push('CLIENT');
        return parts.join('_');
    }

    // What a day prints under Period and Overtime: the figures, a request's name, "-" on a day off.
    function periodText(e) {
        if (!e) return '-';
        // A leave's name in small type, so its row stays as low as the others.
        if (e.r) return '<span class="print-day-note">' + escapeHTML(e.r) + '</span>';
        return e.off ? '-' : figure(e.d);
    }

    function overtimeText(e) {
        if (!e || e.r || e.off) return '-';
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

    // A header as printed: "Overtime" may break as "Over-time" in a narrow column, never "Overti-me".
    function headHTML(label) { return String(label).replace(/Overtime/g, 'Over&shy;time'); }

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
       figure, its longest name (two lines past 22 letters) or the longest word of its header.
       The sheet then takes the type that fills the 287mm between the margins (bigger when the
       sheet has room, smaller for a long period, from 0.6 to 1.4 times), and every column gets
       its share of the width, so none is left half empty (Baldy, 13-11-2026: "coloms nya ini
       itu baik nya gimana… cuma nanti bakal menyisahkan… font nya juga perbesar, takutnya pas
       di print ga keliatan"). A3 and A2 grow the type with the paper, so the fit holds there. */
    var PT_MM = 0.3528;
    var A4_WIDTH = 287;

    function textMM(chars, em, pt) { return chars * em * pt * PT_MM; }

    function headMM(label) {
        var longest = String(headHTML(label)).replace(/&shy;/g, '- ').replace(/<br>/gi, ' ').replace(/<[^>]+>/g, ' ')
            .split(/\s+/).reduce(function (m, w) { return Math.max(m, w.length); }, 0);
        return textMM(longest, 0.6, 6.2) + 0.6;
    }

    function figureMM(chars, bold) { return textMM(Math.max(chars, 1), bold ? 0.64 : 0.6, 9.5) + 1.1; }

    function sheetFit(job, view, cols, printed, figures) {
        var maxOf = function (fn) { return printed.reduce(function (m, row) { return Math.max(m, fn(row)); }, 0); };
        var need = [Math.max(textMM(String(printed.length).length, 0.6, 8) + 1.1, headMM('No')),
                    Math.max(textMM(Math.min(22, maxOf(function (r) { return r.name.length; })), 0.62, 8.3) + 2.4, headMM('Name'))];
        job.dates.forEach(function (d) {
            var p = 1, o = 1;
            printed.forEach(function (row) {
                var e = sheetDay(row, d.date, view.client, view.original);
                if (e && !e.r) { p = Math.max(p, figure(e.d).length); o = Math.max(o, String(e.ot).length); }
            });
            need.push(Math.max(figureMM(p), headMM('Period<br>(daily)')), Math.max(figureMM(o), headMM('Overtime<br>(hour)')));
        });
        cols.totals.forEach(function (c) {
            need.push(Math.max(figureMM(maxOf(function (row) { var f = figures[row.code]; return String(c.f === 'days' ? figure(f.days) : f.ot).length; })), headMM(c.label)));
        });
        cols.emp.concat(cols.cli).forEach(function (c) {
            need.push(Math.max(figureMM(maxOf(function (row) { return moneyText(c, figures[row.code]).length; })), headMM(c.label)));
        });
        cols.pay.forEach(function (c) {
            need.push(Math.max(figureMM(maxOf(function (row) { return rupiah(figures[row.code].pay[c.f]).length; }), true), headMM(c.label)));
        });
        var total = need.reduce(function (a, b) { return a + b; }, 0);
        return { widths: need, total: total, scale: Math.max(0.6, Math.min(1.4, A4_WIDTH / total)) };
    }

    function renderPrintSheet(job, view) {
        view = view || {};
        var cut = view.cut || {};
        var rowsOff = view.rowsOff || {};
        var cols = sheetColumns(job, view);
        var printed = job.rows.filter(function (r) { return !rowsOff[r.code]; });
        var moneyCols = cols.emp.concat(cols.cli);
        var span = 2 + job.dates.length * 2 + cols.totals.length + moneyCols.length + cols.pay.length;

        // Header: what the sheet is, and the filter when one is on (a job saved before 3.7.71
        // still says "All active data (No filter)").
        var html = '<div class="report-print-header">' +
            '<div class="report-print-title-group">' +
                '<h1 class="report-print-project-title">' + escapeHTML(job.title) + '</h1>' +
                '<p class="report-print-project-subtitle">' + escapeHTML(job.subtitle) + '</p>' +
            '</div>';
        if (job.filter && job.filter !== 'All active data (No filter)') {
            html += '<div class="report-print-filter-summary"><strong>Active Filter:</strong> ' + escapeHTML(job.filter) + '</div>';
        }
        html += '</div>';

        // One wide table, each column as wide as what it holds and the type as big as fits
        // (sheetFit). Until 13-11-2026 the widths were fixed weights.
        var figures = {};
        printed.forEach(function (row) { figures[row.code] = rowFigures(row, job, view); });
        var fit = sheetFit(job, view, cols, printed, figures);

        html += '<div class="report-print-section" style="--fit:' + fit.scale.toFixed(3) + '"><table class="report-print-table report-unified-table">';
        html += '<colgroup>' + fit.widths.map(function (w) { return '<col style="width:' + (w / fit.total * 100).toFixed(3) + '%">'; }).join('') + '</colgroup>';

        // Header rows
        html += '<thead><tr><th rowspan="2" class="th-no">No</th><th rowspan="2" class="th-name">Name</th>';
        job.dates.forEach(function (d) { html += '<th colspan="2" class="th-group th-date-grp">' + dateHead(d) + '</th>'; });
        cols.totals.forEach(function (c) { html += '<th rowspan="2" class="' + c.cls + '">' + headHTML(c.label) + '</th>'; });
        if (cols.emp.length) html += '<th colspan="' + cols.emp.length + '" class="th-group th-emp-grp">Employee (IDR)</th>';
        if (cols.cli.length) html += '<th colspan="' + cols.cli.length + '" class="th-group th-cli-grp">Client (IDR)</th>';
        cols.pay.forEach(function (c) { html += '<th rowspan="2" class="th-total-pay">' + headHTML(c.label) + '</th>'; });
        html += '</tr><tr>';
        job.dates.forEach(function () { html += '<th>Period<br>(daily)</th><th>' + headHTML('Overtime<br>(hour)') + '</th>'; });
        moneyCols.forEach(function (c) { html += '<th>' + headHTML(c.label) + '</th>'; });
        html += '</tr></thead><tbody>';

        function moneyCell(c, f) {
            return '<td class="td-rate' + (c.f === 'sub' ? ' td-subtotal' : '') + '">' + moneyText(c, f) + '</td>';
        }

        // Rows, by occupation, each group numbered from 1.
        groupsOf(printed).forEach(function (group) {
            html += '<tr class="tr-group"><td class="td-no"></td><td class="td-group" colspan="' + (span - 1) + '">' + escapeHTML(group.name) + '</td></tr>';
            group.rows.forEach(function (row, index) {
                var f = figures[row.code];
                html += '<tr><td class="td-no">' + (index + 1) + '</td>';
                html += '<td class="td-name"><div class="print-emp-name">' + escapeHTML(row.name) + '</div></td>';
                job.dates.forEach(function (d) {
                    var e = sheetDay(row, d.date, view.client);
                    html += '<td class="td-daily-period">' + (cut['p:' + d.date] ? '' : periodText(e)) + '</td>';
                    html += '<td class="td-daily-ot">' + (cut['o:' + d.date] ? '' : overtimeText(e)) + '</td>';
                });
                cols.totals.forEach(function (c) {
                    html += '<td class="' + (c.f === 'days' ? 'td-total-days' : 'td-total-ot') + '">' + (c.f === 'days' ? figure(f.days) : f.ot) + '</td>';
                });
                moneyCols.forEach(function (c) { html += moneyCell(c, f); });
                cols.pay.forEach(function (c) { html += '<td class="td-payment">' + rupiah(f.pay[c.f]) + '</td>'; });
                html += '</tr>';
            });
        });

        html += '</tbody><tfoot>';

        // "Jumlah Orang Per Hari" (Arcon's sheet): how many of the printed people came in on each
        // date whose Period prints, and those person-days under Total Period.
        if (job.dates.length) {
            var personDays = 0;
            html += '<tr class="tr-people-row"><td colspan="2" class="td-total-label">Jumlah Orang Per Hari</td>';
            job.dates.forEach(function (d) {
                if (cut['p:' + d.date]) {
                    html += '<td colspan="2" class="td-people-count"></td>';
                    return;
                }
                var count = printed.filter(function (row) { var e = sheetDay(row, d.date, view.client); return e && e.w; }).length;
                personDays += count;
                html += '<td colspan="2" class="td-people-count">' + count + '</td>';
            });
            cols.totals.forEach(function (c) {
                html += '<td class="' + (c.f === 'days' ? 'td-people-count' : '') + '">' + (c.f === 'days' ? personDays : '') + '</td>';
            });
            var restCols = moneyCols.length + cols.pay.length;
            if (restCols) html += '<td colspan="' + restCols + '"></td>';
            html += '</tr>';
        }

        // Total row: the printed people's figures.
        var sum = function (fn) {
            return printed.reduce(function (a, row) { return a + fn(figures[row.code]); }, 0);
        };
        html += '<tr class="tr-total-row"><td colspan="' + (2 + job.dates.length * 2 + cols.totals.length) + '" class="td-total-label">Total</td>';
        moneyCols.forEach(function (c) {
            var group = c.group;
            var text = '';
            if (c.f === 'sub') text = rupiah(sum(function (f) { return f[group].sub; }));
            else if (c.f === 'totalR' || c.f === 'totalOT') text = rupiah(sum(function (f) { return f[group][c.f]; }));
            else if (c.f === 'add') text = rupiah(sum(function (f) { return f.req[c.id] ? f.req[c.id].a : 0; }));
            else if (c.f === 'addtotal') text = rupiah(sum(function (f) { return f.add; }));
            html += '<td class="td-rate' + (c.f === 'sub' ? ' td-subtotal' : '') + ' td-total-cell">' + text + '</td>';
        });
        cols.pay.forEach(function (c) {
            html += '<td class="td-payment td-total-cell">' + rupiah(sum(function (f) { return f.pay[c.f]; })) + '</td>';
        });
        html += '</tr></tfoot></table></div>';

        // Footer
        html += '<div class="report-print-footer">' +
            '<div class="report-print-footer-url">' + escapeHTML(job.pageUrl) + '</div>' +
            '<div class="report-print-footer-page"></div>' +
        '</div>';
        return html;
    }

    /* =============================================
       PRINT FROM THE REPORT
       The Print button opens the Print preview tab (report_print.html) with the job, where
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
            window.FeriizNotify.warning(id ? 'The browser blocked the print preview tab, so the report prints from here.'
                : 'The print preview could not be prepared, so the report prints from here.', 'Print preview');
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

    // The Print preview tab draws the same sheet.
    window.FeriizPrintSheet = {
        load: loadJob,
        render: renderPrintSheet,
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
