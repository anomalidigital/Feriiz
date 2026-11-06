(function () {
    'use strict';

    var printButton = null;
    var originalTitle = '';

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

        return values.length ? values.join(' • ') : 'All active data (No filter)';
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

    // One person's day: what the sheet prints (p = the hours, o = the overtime, as the badges
    // say) and what it counts (d = Daily, ot = overtime hours, w = came in, so Transport
    // pays it), plus the requests given that day (Uang Makan…) for their columns.
    function dayEntry(tr, date, idx) {
        var e = { p: '-', o: '-', d: 0, ot: 0, w: false, req: [] };
        var dayTd = tr.querySelector('td.day-col[data-date="' + date + '"]');
        if (!dayTd) {
            var allDayTds = Array.from(tr.querySelectorAll('td.day-col')).filter(isElementVisible);
            dayTd = allDayTds[idx];
        }
        if (!dayTd) return e;

        dayTd.querySelectorAll('.req-chip[data-template]').forEach(function (chip) {
            e.req.push({ t: chip.dataset.template, a: Number(chip.dataset.amount) || 0 });
        });
        var dayOff = dayTd.classList.contains('weekend-off-cell');
        if (!dayOff) {
            e.d = Number(dayTd.dataset.daily) || 0;
            e.ot = Number(dayTd.dataset.otTotal) || 0;
            e.w = e.d > 0;
        }
        if (dayOff || dayTd.classList.contains('holiday-off-cell')) return e;

        // A day off work for an accepted request (sick, leave...) prints the request's name.
        if (dayTd.dataset.request) {
            e.p = dayTd.dataset.request;
            return e;
        }

        // A split day (newest | original) prints the newest version, which is what the totals
        // count. Only the hour and overtime badges are read, not the request chips.
        var scope = dayTd.querySelector('.day-half--changed:not(.is-empty)') || dayTd.querySelector('.day-half--system') || dayTd;
        scope.querySelectorAll('.feriiz-u-135, .feriiz-u-136').forEach(function (b) {
            var text = b.textContent.trim();
            if (text.toLowerCase().includes('ot')) e.o = text.replace(/ot/i, '').trim();
            else if (text) e.p = text.replace(/h/i, '').trim();
        });

        if (e.p === '-' && e.o === '-' && (dayTd.dataset.inTime || dayTd.dataset.outTime)) e.p = '1';
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
        // The Client group's additional columns: Transport, the request templates, Total Additional.
        var add = Array.from(document.querySelectorAll('.report-table thead th.col-cli-add, .report-table thead th.col-cli-addtotal'))
            .filter(isElementVisible)
            .map(function (th) { return { id: th.dataset.template || '', name: th.textContent.trim(), total: !th.dataset.template }; });

        return {
            v: 1,
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
                        clientOt: Number(tr.dataset.clientOtRate) || 0,
                        transport: Number(tr.dataset.transportRate) || 0
                    },
                    days: days
                };
            })
        };
    }

    /* =============================================
       THE SHEET
       Drawn from a job. view (all optional): hidden { key: true } for the columns left out
       ('date:YYYY-MM-DD', 'tot:days', 'tot:ot', 'emp', 'emp:daily', 'emp:rateOT', 'emp:totalR',
       'emp:totalOT', 'emp:sub', 'cli', 'cli:…', 'cli:add:ID', 'cli:addtotal', 'cli:sub',
       'pay:emp', 'pay:cli'), blank { 'YYYY-MM-DD': true } for dates printed with their header
       but nothing under it, rowsOff { CODE: true } for people left out, and controls: the
       Print preview's own view, where what is left out stays in sight, faded, with the
       buttons that leave it out or bring it back. A date left out or blanked, and a person
       left out, no longer count in the totals: the sheet adds up what it prints (Baldy,
       06-11-2026). The money columns never change what a person is paid.
       ============================================= */
    function formatHour(h) {
        if (!Number.isFinite(h) || h <= 0) return '0h';
        return Number.isInteger(h) ? h + 'h' : h.toFixed(2).replace(/\.?0+$/, '') + 'h';
    }

    // As the Report writes an amount (formatIDR), without "IDR": the column header says it once.
    function idr(n) { return Number(n || 0).toLocaleString('id-ID'); }

    // A subtotal or a payment: whole rupiah, "0" for nothing.
    function rupiah(n) { return n ? Math.round(n).toLocaleString('id-ID') : '0'; }

    var EMP_COLS = [['daily', 'Daily<br>Rate'], ['rateOT', 'Rate<br>Overtime'], ['totalR', 'Total<br>Rate'], ['totalOT', 'Total Rate<br>OT']];

    // The sheet's columns, each with its key and whether it is left out.
    function sheetColumns(job, view) {
        var hidden = view.hidden || {};
        var off = function (key, group) { return Boolean(hidden[key] || (group && hidden[group])); };
        var keep = function (c) { return view.controls || !c.off; };

        var dates = job.dates.map(function (d) { return { key: 'date:' + d.date, date: d.date, label: d.label, off: off('date:' + d.date) }; }).filter(keep);
        var groupCols = function (group, def, extra) {
            var cols = [];
            if (!def.active) return cols;
            EMP_COLS.forEach(function (c) {
                if (def.show[c[0]]) cols.push({ key: group + ':' + c[0], f: c[0], label: c[1], off: off(group + ':' + c[0], group) });
            });
            (extra || []).forEach(function (c) { cols.push(c); });
            if (cols.length) cols.push({ key: group + ':sub', f: 'sub', label: 'Subtotal<br>Rate', off: off(group + ':sub', group) });
            return cols.filter(keep);
        };
        var addCols = (job.cli.add || []).map(function (a) {
            var key = a.total ? 'cli:addtotal' : 'cli:add:' + a.id;
            return { key: key, f: a.total ? 'addtotal' : 'add', id: a.id, label: escapeHTML(a.name), off: off(key, 'cli') };
        });
        var pay = [];
        if (job.emp.active) pay.push({ key: 'pay:emp', f: 'emp', label: 'Total Payment<br>Employee<br>(IDR)', off: off('pay:emp', 'emp') });
        if (job.cli.active) pay.push({ key: 'pay:cli', f: 'cli', label: 'Total Payment<br>Client<br>(IDR)', off: off('pay:cli', 'cli') });
        return {
            dates: dates,
            totals: [{ key: 'tot:days', f: 'days', label: 'Total<br>Day', cls: 'th-total-days', off: off('tot:days') },
                     { key: 'tot:ot', f: 'ot', label: 'Total<br>OT', cls: 'th-total-ot', off: off('tot:ot') }].filter(keep),
            emp: groupCols('emp', job.emp),
            cli: groupCols('cli', job.cli, addCols),
            pay: pay.filter(keep),
            empOff: Boolean(hidden.emp),
            cliOff: Boolean(hidden.cli)
        };
    }

    // The dates the totals count: the ones printed and not blanked.
    function countedDates(job, view) {
        var hidden = view.hidden || {}, blank = view.blank || {};
        return job.dates.filter(function (d) { return !hidden['date:' + d.date] && !blank[d.date]; }).map(function (d) { return d.date; });
    }

    // One person's figures over the counted dates, by the Report's rules: pay is per day
    // (Total Rate = Daily Rate x days), overtime per hour, Transport on the days they came in.
    function rowFigures(row, counted) {
        var days = 0, ot = 0, paid = 0, req = {}, reqTotal = 0;
        counted.forEach(function (date) {
            var e = row.days[date];
            if (!e) return;
            days += e.d;
            ot += e.ot;
            if (e.w) paid++;
            e.req.forEach(function (r) {
                var item = req[r.t] || (req[r.t] = { n: 0, a: 0 });
                item.n++;
                item.a += r.a;
                reqTotal += r.a;
            });
        });
        var r = row.rates;
        var transport = r.transport * paid;
        var f = { days: days, ot: ot, transport: transport, req: req, add: transport + reqTotal };
        f.emp = { daily: r.daily, rateOT: r.ot, totalR: days * r.daily, totalOT: Math.round(ot * r.ot) };
        f.cli = { daily: r.clientDaily, rateOT: r.clientOt, totalR: days * r.clientDaily, totalOT: Math.round(ot * r.clientOt) };
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
        if (cols.dates.length) parts.push('DAILY');
        if (cols.emp.length) parts.push('EMPLOYEE');
        if (cols.cli.length) parts.push('CLIENT');
        return parts.join('_');
    }

    function renderPrintSheet(job, view) {
        view = view || {};
        var ctl = Boolean(view.controls);
        var blank = view.blank || {};
        var rowsOff = view.rowsOff || {};
        var cols = sheetColumns(job, view);
        var counted = countedDates(job, view);
        var people = job.rows.filter(function (r) { return ctl || !rowsOff[r.code]; });
        var printedRows = job.rows.filter(function (r) { return !rowsOff[r.code]; });

        // The Print preview's buttons and marks (never on paper).
        var offCls = function (c) { return c.off ? ' pp-off' : ''; };
        var tool = function (action, key, icon, label, pressed) {
            return '<button type="button" class="pp-btn" data-pp="' + action + '" data-key="' + escapeHTML(key) + '" aria-label="' + escapeHTML(label) + '" title="' + escapeHTML(label) + '"' +
                (pressed != null ? ' aria-pressed="' + pressed + '"' : '') + '><i class="fa-solid ' + icon + '" aria-hidden="true"></i></button>';
        };
        var eye = function (c, name) {
            return tool('col', c.key, c.off ? 'fa-eye-slash' : 'fa-eye', (c.off ? 'Print ' : 'Leave out ') + name, null);
        };
        var tag = function (text) { return '<span class="pp-tag">' + text + '</span>'; };
        var plain = function (label) { return label.replace(/<br>/g, ' ').replace(/<[^>]+>/g, ''); };
        var headTools = function (c, name, extra) {
            if (!ctl) return '';
            return '<span class="pp-tools">' + eye(c, name) + (extra || '') + '</span>' + (c.off ? tag('Not printed') : '');
        };

        // Top Header
        var html = '<div class="report-print-header">';
        html += '<div class="report-print-header-top">';
        html += '  <div class="report-print-brand-wrap">';
        html += '    <div class="report-print-title-group">';
        html += '      <h1 class="report-print-project-title">' + escapeHTML(job.title) + '</h1>';
        html += '      <p class="report-print-project-subtitle">' + escapeHTML(job.subtitle) + '</p>';
        html += '    </div>';
        html += '  </div>';
        html += '  <div class="report-print-header-right">';
        html += '    <div class="report-print-footer-id">' + escapeHTML(sheetIdentifier(job, view)) + '</div>';
        html += '    <div class="report-print-meta-grid">';
        html += '      <div class="report-print-meta-item"><div class="report-print-meta-label">Period</div><div class="report-print-meta-value">' + escapeHTML(job.period) + '</div></div>';
        html += '      <div class="report-print-meta-item"><div class="report-print-meta-label">Rows</div><div class="report-print-meta-value">' + printedRows.length + ' records</div></div>';
        html += '      <div class="report-print-meta-item"><div class="report-print-meta-label">Generated</div><div class="report-print-meta-value">' + escapeHTML(job.generated) + '</div></div>';
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
        html += '<div class="report-print-filter-summary"><strong>Active Filter:</strong> ' + escapeHTML(job.filter) + '</div>';
        html += '</div>';

        // Single Unified Wide Table (Old Feriiz Structure + New Design)
        html += '<div class="report-print-section">';
        // Proportional column widths. Without this the browser splits all ~26
        // columns evenly, which starves the money columns (they need room for
        // "1.095.000") while the day columns sit half empty.
        var W = { no: 0.7, name: 3.5, dayPeriod: 1.62, dayOT: 1.45, totals: 2.4, money: 4.4, pay: 4.6 };
        var colW = [W.no, W.name];
        cols.dates.forEach(function () { colW.push(W.dayPeriod, W.dayOT); });
        cols.totals.forEach(function () { colW.push(W.totals); });
        cols.emp.concat(cols.cli).forEach(function () { colW.push(W.money); });
        cols.pay.forEach(function () { colW.push(W.pay); });
        var colTotal = colW.reduce(function (a, b) { return a + b; }, 0);

        html += '<table class="report-print-table report-unified-table">';
        html += '<colgroup>' + colW.map(function (w) {
            return '<col style="width:' + (w / colTotal * 100).toFixed(3) + '%">';
        }).join('') + '</colgroup>';
        html += '<thead>';

        // Header Row 1
        html += '<tr>';
        html += '<th rowspan="2" class="th-no">No</th>';
        html += '<th rowspan="2" class="th-name">Name</th>';
        cols.dates.forEach(function (c) {
            var blanked = blank[c.date];
            var tools = ctl ? '<span class="pp-tools">' + eye(c, c.label) +
                tool('blank', c.date, 'fa-eraser', blanked ? 'Print what ' + c.label + ' has' : 'Blank ' + c.label + ', keep its header', blanked) + '</span>' +
                (c.off ? tag('Not printed') : blanked ? tag('Blanked') : '') : '';
            html += '<th colspan="2" class="th-group th-date-grp' + offCls(c) + (blanked && ctl ? ' pp-blank' : '') + '">' + escapeHTML(c.label) + tools + '</th>';
        });
        cols.totals.forEach(function (c) {
            html += '<th rowspan="2" class="' + c.cls + offCls(c) + '">' + c.label + headTools(c, plain(c.label)) + '</th>';
        });
        if (cols.emp.length) {
            html += '<th colspan="' + cols.emp.length + '" class="th-group th-emp-grp' + (cols.empOff ? ' pp-off' : '') + '">Employee (IDR)' +
                headTools({ key: 'emp', off: cols.empOff }, 'the Employee group') + '</th>';
        }
        if (cols.cli.length) {
            html += '<th colspan="' + cols.cli.length + '" class="th-group th-cli-grp' + (cols.cliOff ? ' pp-off' : '') + '">Client (IDR)' +
                headTools({ key: 'cli', off: cols.cliOff }, 'the Client group') + '</th>';
        }
        cols.pay.forEach(function (c) {
            html += '<th rowspan="2" class="th-total-pay' + offCls(c) + '">' + c.label + headTools(c, plain(c.label)) + '</th>';
        });
        html += '</tr>';

        // Header Row 2
        html += '<tr>';
        cols.dates.forEach(function (c) {
            html += '<th class="' + offCls(c).trim() + '">Day</th><th class="' + offCls(c).trim() + '">OT</th>';
        });
        cols.emp.concat(cols.cli).forEach(function (c) {
            html += '<th class="' + offCls(c).trim() + '">' + c.label + headTools(c, plain(c.label)) + '</th>';
        });
        html += '</tr>';
        html += '</thead><tbody>';

        var figures = {};
        job.rows.forEach(function (row) { figures[row.code] = rowFigures(row, counted); });

        // A money cell of a person: the rates and totals as the Report writes them, the
        // additional columns blank ("-") when there is nothing to pay.
        function moneyCell(c, f) {
            var group = c.key.slice(0, 3) === 'emp' ? f.emp : f.cli;
            if (c.f === 'sub') return '<td class="td-rate td-subtotal' + offCls(c) + '">' + rupiah(group.sub) + '</td>';
            var text;
            if (c.f === 'add') {
                if (c.id === 'transport') text = f.transport ? idr(f.transport) : '-';
                else text = f.req[c.id] ? idr(f.req[c.id].a) : '-';
            } else if (c.f === 'addtotal') {
                text = f.add ? idr(f.add) : '-';
            } else {
                text = idr(group[c.f]);
            }
            return '<td class="td-rate' + offCls(c) + '">' + text + '</td>';
        }

        // Rows
        people.forEach(function (row, index) {
            var f = figures[row.code];
            var rowOff = Boolean(rowsOff[row.code]);
            var cellOff = function (c) { return (rowOff || c.off) ? ' pp-off' : ''; };
            html += '<tr' + (rowOff ? ' class="pp-off-row"' : '') + '>';
            html += '<td class="td-no' + (rowOff ? ' pp-off' : '') + '">' + (index + 1) + '</td>';
            html += '<td class="td-name' + (rowOff ? ' pp-off' : '') + '">' +
                (ctl ? tool('row', row.code, rowOff ? 'fa-eye-slash' : 'fa-eye', (rowOff ? 'Print ' : 'Leave out ') + row.name) : '') +
                '<div class="print-emp-name">' + escapeHTML(row.name) + '</div>' +
                (row.occupation ? '<div class="print-emp-sub">' + escapeHTML(row.occupation) + '</div>' : '') +
                (ctl && rowOff ? tag('Not printed') : '') + '</td>';
            cols.dates.forEach(function (c) {
                var e = row.days[c.date] || { p: '-', o: '-' };
                var cls = cellOff(c) + (blank[c.date] && ctl ? ' pp-blank' : '');
                var p = blank[c.date] ? '' : escapeHTML(e.p);
                var o = blank[c.date] ? '' : escapeHTML(e.o);
                html += '<td class="td-daily-period' + cls + '">' + p + '</td>';
                html += '<td class="td-daily-ot' + cls + '">' + o + '</td>';
            });
            cols.totals.forEach(function (c) {
                html += '<td class="' + (c.f === 'days' ? 'td-total-days' : 'td-total-ot') + cellOff(c) + '">' +
                    (c.f === 'days' ? f.days + 'd' : formatHour(f.ot)) + '</td>';
            });
            cols.emp.concat(cols.cli).forEach(function (c) {
                var cell = moneyCell(c, f);
                html += rowOff && !c.off ? cell.replace('class="td-rate', 'class="pp-off td-rate') : cell;
            });
            cols.pay.forEach(function (c) {
                html += '<td class="td-payment' + cellOff(c) + '">' + rupiah(f.pay[c.f]) + '</td>';
            });
            html += '</tr>';
        });

        html += '</tbody><tfoot>';

        // "Jumlah Orang Per Hari" (Arcon's sheet, built on dev 30-10-2026): how many of the
        // printed people worked on each date, by the same rule as Total Days, and the sum of
        // those person-days under Total Day.
        if (cols.dates.length) {
            var personDays = 0;
            html += '<tr class="tr-people-row"><td colspan="2" class="td-total-label">Jumlah Orang Per Hari</td>';
            cols.dates.forEach(function (c) {
                var counts = !c.off && !blank[c.date];
                var count = printedRows.filter(function (row) { var e = row.days[c.date]; return e && e.w; }).length;
                if (counts) personDays += count;
                html += '<td colspan="2" class="td-people-count' + offCls(c) + (blank[c.date] && ctl ? ' pp-blank' : '') + '">' + (blank[c.date] ? '' : count) + '</td>';
            });
            cols.totals.forEach(function (c) {
                html += '<td class="' + (c.f === 'days' ? 'td-people-count' : '') + offCls(c) + '">' + (c.f === 'days' ? personDays : '') + '</td>';
            });
            var restCols = cols.emp.length + cols.cli.length + cols.pay.length;
            if (restCols) html += '<td colspan="' + restCols + '"></td>';
            html += '</tr>';
        }

        // Total row: the printed people's figures.
        var sum = function (fn) {
            return printedRows.reduce(function (a, row) { return a + fn(figures[row.code]); }, 0);
        };
        var leftColspan = 2 + cols.dates.length * 2 + cols.totals.length;
        html += '<tr class="tr-total-row">';
        html += '<td colspan="' + leftColspan + '" class="td-total-label">Total</td>';
        cols.emp.concat(cols.cli).forEach(function (c) {
            var group = c.key.slice(0, 3) === 'emp' ? 'emp' : 'cli';
            var text = '';
            if (c.f === 'sub') text = rupiah(sum(function (f) { return f[group].sub; }));
            else if (c.f === 'totalR' || c.f === 'totalOT') text = rupiah(sum(function (f) { return f[group][c.f]; }));
            else if (c.f === 'add') text = rupiah(sum(function (f) { return c.id === 'transport' ? f.transport : (f.req[c.id] ? f.req[c.id].a : 0); }));
            else if (c.f === 'addtotal') text = rupiah(sum(function (f) { return f.add; }));
            html += '<td class="td-rate' + (c.f === 'sub' ? ' td-subtotal' : '') + ' td-total-cell' + offCls(c) + '">' + text + '</td>';
        });
        cols.pay.forEach(function (c) {
            html += '<td class="td-payment td-total-cell' + offCls(c) + '">' + rupiah(sum(function (f) { return f.pay[c.f]; })) + '</td>';
        });
        html += '</tr></tfoot></table>';
        html += '</div>';

        // Footer HTML
        html += '<div class="report-print-footer">';
        html += '  <div class="report-print-footer-url">' + escapeHTML(job.pageUrl) + '</div>';
        html += '  <div class="report-print-footer-page"></div>';
        html += '</div>';
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
        return job && job.v === 1 ? job : null;
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
        identifier: sheetIdentifier
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
