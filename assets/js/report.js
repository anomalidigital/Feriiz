(function () {
    'use strict';

    /* =============================================
       DATA
       ============================================= */
    /* Day columns run from the start of the selected range up to TODAY and never
       past it: a day that has not happened yet has no attendance, so it gets no
       column. Default range = Monday of the current week through today, so on a
       Monday the table shows one day, on Tuesday two, and so on.

       All dates are 'YYYY-MM-DD' strings in local time (never toISOString(),
       which shifts the day in UTC+7). */
    var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                       'August', 'September', 'October', 'November', 'December'];

    function pad2(n) { return String(n).padStart(2, '0'); }
    function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function fromISO(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
    function addDays(iso, n) { var d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
    function mondayOf(iso) { var day = fromISO(iso).getDay(); return addDays(iso, day === 0 ? -6 : 1 - day); }

    // Set once the dataset loads (see loadProjectContext).
    var reportToday = toISO(new Date());
    var dataStart = '';

    function defaultRange() {
        return { start: mondayOf(reportToday), end: reportToday };
    }

    // Every day from start to end, cut off at today and at the first day with data.
    function datesInRange(start, end) {
        var from = start || defaultRange().start;
        var to = end || reportToday;
        if (to > reportToday) to = reportToday;
        if (dataStart && from < dataStart) from = dataStart;
        var dates = [];
        for (var d = from; d <= to; d = addDays(d, 1)) dates.push(d);
        return dates;
    }

    // Project + employees are resolved from URL ?project=CODE (&employee=CODE) and FERIIZ_DATA.
    var projectContext = null;
    var reportEmployees = [];
    // Fast lookup for attendance records keyed by employeeCode + '|' + date
    var attendanceIndex = {};
    // Last day with a log per employee in this project (Assign Template sorts by it).
    var lastActiveByCode = {};
    // Logs added or deleted with Batch Update in this visit, keyed like attendanceIndex.
    // Presentation-only (never sent anywhere) but survives a change of date range.
    var cellOverrides = {};

    function isOffDay(date) {
        var days = projectContext && projectContext.workingDays;
        if (!days || !days.length) return false;
        return days.indexOf(DAY_NAMES[fromISO(date).getDay()]) < 0;
    }

    // Weekend or holiday for this person: from their record, else the project's working days.
    function isOffCell(employeeCode, date) {
        var rec = attendanceIndex[employeeCode + '|' + date];
        return rec ? (rec.status === 'weekend' || rec.status === 'holiday') : isOffDay(date);
    }

    function rememberCell(cell) {
        var row = cell.closest('tr');
        if (!row) return;
        var key = row.dataset.employeeCode + '|' + cell.dataset.date;
        var prev = cellOverrides[key] || {};
        cellOverrides[key] = {
            inTime: cell.dataset.inTime || '',
            outTime: cell.dataset.outTime || '',
            inNote: cell.dataset.inNote || '',
            outNote: cell.dataset.outNote || '',
            otAdjust: prev.otAdjust || 0,     // minutes, sum of the ledger below
            otLog: prev.otLog || []           // [{ minutes, note, at, by }], append-only
        };
    }
    // Dropdown controls are drafts. Only Apply is allowed to replace this state.
    var appliedReportFilters = {
        missingTypes: [],
        occupations: [],
        occupationLabels: [],
        range: null            // { start, end } chosen in the filter; null = the default week
    };

    function appliedRange() {
        return appliedReportFilters.range || defaultRange();
    }

    // The range typed in the filter (both empty = the default week).
    function draftRange() {
        var di = document.querySelectorAll('.filter-date');
        var s = di[0] ? di[0].value : '';
        var e = di[1] ? di[1].value : '';
        if (!s && !e) return defaultRange();
        if (s && e && s > e) { var t = s; s = e; e = t; }
        return { start: s || e, end: e || s };
    }

    function selectedOccupationLabels() {
        var select = document.querySelector('.filter-occ');
        if (!select) return [];
        return Array.prototype.filter.call(select.options, function (o) { return o.selected && !/^all\b/i.test(o.textContent.trim()); })
            .map(function (o) { return o.textContent.trim(); });
    }

    function formatIDR(n) {
        if (!n && n !== 0) return 'IDR0';
        return 'IDR' + Number(n).toLocaleString('id-ID');
    }

    function attendanceFor(employeeCode, date) {
        return attendanceIndex[employeeCode + '|' + date] || null;
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* =============================================
       HOURS
       Same rule as the attendance data: worked = log out - log in;
       overtime = time after the project's end hour. A record keeps its own
       numbers until one of its logs is changed here.
       ============================================= */
    function toSeconds(t) {
        var p = String(t || '').split(':').map(Number);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }

    function computeHours(inTime, outTime) {
        if (!inTime || !outTime) return { work: 0, ot: 0 };
        var i = toSeconds(inTime), o = toSeconds(outTime);
        if (o <= i) return { work: 0, ot: 0 };
        var end = toSeconds(((projectContext && projectContext.workEnd) || '17:00') + ':00');
        return { work: (o - i) / 3600, ot: Math.max(0, o - Math.max(end, i)) / 3600 };
    }

    function cellHours(code, date, inTime, outTime) {
        var rec = attendanceIndex[code + '|' + date];
        if (rec && (rec.inTime || '') === inTime && (rec.outTime || '') === outTime) {
            return { work: rec.workHours || 0, ot: rec.overtimeHours || 0 };
        }
        return computeHours(inTime, outTime);
    }

    function otAdjustFor(code, date) {
        var o = cellOverrides[code + '|' + date];
        return (o && o.otAdjust) || 0;
    }

    function otLogCountFor(code, date) {
        var o = cellOverrides[code + '|' + date];
        return (o && o.otLog && o.otLog.length) || 0;
    }

    // '+1h', '+1h 30m', '-45m'
    function formatAdjust(minutes) {
        if (!minutes) return '±0m';
        var a = Math.abs(minutes), h = Math.floor(a / 60), m = a % 60;
        return (minutes < 0 ? '−' : '+') + (h ? h + 'h' : '') + (h && m ? ' ' : '') + (m || !h ? m + 'm' : '');
    }

    // Stamp the numbers totals and print read from.
    function setCellHours(cell, hours, adjust) {
        var complete = Boolean(cell.dataset.inTime && cell.dataset.outTime);
        cell.dataset.work = (hours.work || 0).toFixed(4);
        cell.dataset.ot = (hours.ot || 0).toFixed(4);
        cell.dataset.otAdjust = String(adjust || 0);
        cell.dataset.otTotal = complete ? Math.max(0, (hours.ot || 0) + (adjust || 0) / 60).toFixed(4) : '0';
    }

    /* =============================================
       CELL RENDERING
       ============================================= */
    function buildClockLine(type, value, options) {
        var fixed = (options && options.fixed) || false;
        var note = (options && options.note) || '';
        var iconClass = type === 'in'
            ? 'fa-arrow-right-to-bracket feriiz-u-142'
            : 'fa-arrow-right-from-bracket feriiz-u-144';
        var fixedClass = fixed ? ' fixed-clock-line' : '';
        var noteButton = note
            ? '<button type="button" class="report-log-note-btn" data-log-type="' + type + '" title="View log note" aria-label="View ' + (type === 'in' ? 'log in' : 'log out') + ' note"><i class="fa-solid fa-note-sticky"></i></button>'
            : '';
        return '<div class="feriiz-u-141' + fixedClass + '">' +
            '<span><i class="fa-solid ' + iconClass + '"></i>' + escapeHTML(value) + '</span>' +
            noteButton + '</div>';
    }

    function buildDayCellContent(opts) {
        var inTime = (opts && opts.inTime) || '';
        var outTime = (opts && opts.outTime) || '';
        var issue = (opts && opts.issue) || '';
        var inNote = (opts && opts.inNote) || '';
        var outNote = (opts && opts.outNote) || '';
        var clockLines = opts && opts.clockLines;
        var isEmpty = (opts && opts.isEmpty) || false;
        var isUpdated = Boolean(opts && opts.updated);

        if (isEmpty) return '';

        var hours = (opts && opts.hours) || computeHours(inTime, outTime);
        var adjust = (opts && opts.otAdjust) || 0;
        var ledger = (opts && opts.otLogCount) || 0;
        var complete = Boolean(inTime && outTime);
        var otTotal = complete ? Math.max(0, hours.ot + adjust / 60) : 0;
        // The yellow badge always shows the total; the chip shows what was added or taken off.
        // Shown while the day has any history, even when the changes cancel out.
        var adjustChip = complete && (adjust || ledger)
            ? '<button type="button" class="ot-adjust-chip ' + (adjust > 0 ? 'is-plus' : adjust < 0 ? 'is-minus' : 'is-zero') + '" ' +
                'title="System ' + formatHour(hours.ot) + ', adjusted ' + formatAdjust(adjust) + '. Click for history." ' +
                'aria-label="Overtime adjusted ' + formatAdjust(adjust) + ', show history">' + formatAdjust(adjust) + '</button>'
            : '';
        var totalBadge = '<span class="badge feriiz-u-135">' + formatHour(complete ? hours.work : 0) + '</span>' +
            '<span class="badge feriiz-u-136">' + formatHour(otTotal) + ' OT</span>' + adjustChip;

        var renderedLines = Array.isArray(clockLines) ? clockLines : null;

        var html = '';
        if (totalBadge) {
            var updateBadge = isUpdated
                ? '<span class="cell-updated-badge"><i class="fa-solid fa-check"></i>Updated</span>'
                : '';
            html += '<div class="feriiz-u-133"><div class="feriiz-u-134">' + totalBadge + '</div>' + updateBadge + '</div>';
        }

        if (renderedLines) {
            // Custom clock lines (from batch update)
            // Sort: in first, out second
            var inLines = renderedLines.filter(function (l) { return l.type === 'in'; });
            var outLines = renderedLines.filter(function (l) { return l.type === 'out'; });
            html += '<div class="feriiz-u-140">';
            if (inLines.length > 0) {
                html += inLines.map(function (l) { return buildClockLine('in', l.value, { fixed: l.fixed, note: l.note || inNote }); }).join('');
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            if (outLines.length > 0) {
                html += outLines.map(function (l) { return buildClockLine('out', l.value, { fixed: l.fixed, note: l.note || outNote }); }).join('');
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            html += '</div>';
        } else {
            // Default rendering: always show in row on top, out row on bottom
            html += '<div class="feriiz-u-140">';
            if (inTime) {
                html += buildClockLine('in', inTime, { note: inNote });
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            if (outTime) {
                html += buildClockLine('out', outTime, { note: outNote });
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            html += '</div>';
        }

        return html;
    }

    /* =============================================
       TABLE GENERATION
       ============================================= */
    function getMissingType(inTime, outTime) {
        if (!inTime && !outTime) return 'both';
        if (!inTime && outTime) return 'in';
        if (inTime && !outTime) return 'out';
        return '';
    }

    function createDayCells(employee, dates) {
        return dates.map(function (date) {
            var rec = attendanceFor(employee.code, date);
            var override = cellOverrides[employee.code + '|' + date];
            var checkbox = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';
            var dayOff = rec ? (rec.status === 'weekend' || rec.status === 'holiday') : isOffDay(date);

            if (dayOff && !(override && (override.inTime || override.outTime))) {
                return '<td class="day-col feriiz-u-132 weekend-off-cell" data-date="' + date + '" data-in-time="" data-out-time="" data-in-note="" data-out-note="">' +
                    checkbox + '</td>';
            }

            var src = override || rec || {};
            var inTime = src.inTime || '';
            var outTime = src.outTime || '';
            var inNote = src.inNote || '';
            var outNote = src.outNote || '';
            var issue = getMissingType(inTime, outTime);
            var hours = cellHours(employee.code, date, inTime, outTime);
            var adjust = otAdjustFor(employee.code, date);
            var otTotal = inTime && outTime ? Math.max(0, hours.ot + adjust / 60) : 0;

            var missingAttr = issue ? ' data-missing="' + issue + '"' : '';
            var dataAttrs = ' data-in-time="' + escapeHTML(inTime) + '" data-out-time="' + escapeHTML(outTime) + '" data-in-note="' + escapeHTML(inNote) + '" data-out-note="' + escapeHTML(outNote) + '"' +
                ' data-work="' + hours.work.toFixed(4) + '" data-ot="' + hours.ot.toFixed(4) + '" data-ot-adjust="' + adjust + '" data-ot-total="' + otTotal.toFixed(4) + '"';
            var cellClass = 'day-col feriiz-u-132' + (issue ? ' no-log-cell' : '');
            var content = buildDayCellContent({ inTime: inTime, outTime: outTime, inNote: inNote, outNote: outNote, issue: issue, hours: hours, otAdjust: adjust, otLogCount: otLogCountFor(employee.code, date) });

            return '<td class="' + cellClass + '" data-date="' + date + '"' + missingAttr + dataAttrs + '>' +
                checkbox + content + '</td>';
        }).join('');
    }

    // Additional = request templates given to this person on the visible days
    // (meal, transport, holiday incentive...). Total for print, lines per template on screen.
    function additionalCells(employeeCode, dates) {
        var add = window.FeriizTemplates && projectContext
            ? window.FeriizTemplates.additionalFor(employeeCode, projectContext.code, dates) : { total: 0, items: [], notes: [] };
        if (!add.items.length) {
            return '<td class="col-additional-amount"></td><td class="col-additional-note"></td>';
        }
        var lines = add.items.map(function (it) {
            return '<div class="add-line"><span>' + escapeHTML(it.name) + (it.count > 1 ? ' \u00d7' + it.count : '') + '</span>' +
                '<span>' + formatIDR(it.amount) + '</span></div>';
        }).join('');
        return '<td class="col-additional-amount"><div class="add-total">' + formatIDR(add.total) + '</div>' +
                '<div class="add-lines screen-only">' + lines + '</div></td>' +
            '<td class="col-additional-note">' + escapeHTML(add.notes.join('; ')) + '</td>';
    }

    function refreshAdditional() {
        document.querySelectorAll('.report-table tbody tr[data-employee-code]').forEach(function (row) {
            var holder = document.createElement('tbody');
            holder.innerHTML = '<tr>' + additionalCells(row.dataset.employeeCode, currentVisibleDates) + '</tr>';
            var fresh = holder.querySelectorAll('td');
            var amount = row.querySelector('.col-additional-amount');
            var note = row.querySelector('.col-additional-note');
            if (amount) amount.innerHTML = fresh[0].innerHTML;
            if (note) note.innerHTML = fresh[1].innerHTML;
        });
        updateFieldsVisibility();
    }

    // Assign a request template from the toolbar: pick people and days in the dialog.
    function openTemplateAssign() {
        if (!window.FeriizTemplates || !projectContext) return;
        window.FeriizTemplates.openAssign({
            project: { code: projectContext.code, name: projectContext.name },
            people: reportEmployees.map(function (e) {
                return { code: e.code, name: e.name, occupation: e.occupation, lastActive: lastActiveByCode[e.code] || '' };
            }),
            dates: currentVisibleDates.slice(),
            today: reportToday,
            onDone: refreshAdditional
        });
    }

    function createEmployeeRow(employee, dates) {
        var empRateOT = projectContext ? projectContext.overtimeRate || 0 : 0;
        var cliRateOT = projectContext ? projectContext.clientOvertimeRate || 0 : 0;
        return '<tr data-employee-code="' + escapeHTML(employee.code) + '" data-employee-name="' + escapeHTML(employee.name) + '"' +
            ' data-daily-rate="' + (Number(employee.dailyRate) || 0) + '" data-client-daily-rate="' + (Number(employee.clientDailyRate) || 0) + '">' +
            '<td class="col-name sticky-col">' +
                '<div class="report-identity-content">' +
                    '<div class="emp-code-cell">' + escapeHTML(employee.code) + '</div>' +
                    '<div class="emp-name-cell">' + escapeHTML(employee.name) + '</div>' +
                    '<div class="emp-occupation-cell">' + escapeHTML(employee.occupation) + '</div>' +
                    '<div class="emp-pin-cell">Pin: ' + escapeHTML(employee.pin) + '</div>' +
                '</div>' +
            '</td>' +
            '<td class="col-inouthour">' + (projectContext ? projectContext.workStart + ':00' : '08:00:00') + '</td>' +
            '<td class="col-inouthour">' + (projectContext ? projectContext.workEnd + ':00' : '17:00:00') + '</td>' +
            '<td class="col-activehour">9h</td>' +
            '<td class="col-totaldays">0d</td>' +
            '<td class="col-totalhour">0h</td>' +
            '<td class="col-totalovertime">0h</td>' +
            '<td class="col-emp-dailyrate rate-cell">' + formatIDR(employee.dailyRate) + '</td>' +
            '<td class="col-emp-rateovertime rate-cell">' + formatIDR(empRateOT) + '</td>' +
            '<td class="col-emp-totalrate rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-emp-totalovertime rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-cli-dailyrate rate-cell">' + formatIDR(employee.clientDailyRate) + '</td>' +
            '<td class="col-cli-rateovertime rate-cell">' + formatIDR(cliRateOT) + '</td>' +
            '<td class="col-cli-totalrate rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-cli-totalovertime rate-cell">' + formatIDR(0) + '</td>' +
            additionalCells(employee.code, dates) +
            createDayCells(employee, dates) +
        '</tr>';
    }

    // One month band per calendar month in the range, then one header per day.
    function renderDayHeaders(dates) {
        var table = document.querySelector('.report-table');
        if (!table) return;
        var groupRow = table.querySelector('thead tr:first-child');
        var dayRow = table.querySelector('thead tr:nth-child(2)');
        table.querySelectorAll('thead th.month-header, thead th.day-col').forEach(function (th) { th.remove(); });

        var months = [];
        dates.forEach(function (date) {
            var key = date.slice(0, 7);
            var last = months[months.length - 1];
            if (last && last.key === key) last.count++;
            else months.push({ key: key, count: 1 });
        });
        months.forEach(function (m) {
            var th = document.createElement('th');
            th.className = 'group-header month-header';
            th.colSpan = m.count;
            var d = fromISO(m.key + '-01');
            th.textContent = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
            groupRow.appendChild(th);
        });

        dates.forEach(function (date) {
            var th = document.createElement('th');
            th.className = 'day-col feriiz-u-130';
            th.dataset.date = date;
            th.innerHTML = '<span>' + DAY_NAMES[fromISO(date).getDay()] + ' ' + fromISO(date).getDate() + '</span>' +
                '<input type="checkbox" class="day-header-select" data-date="' + date + '" aria-label="Select every log on ' + date + '">';
            dayRow.appendChild(th);
        });
    }

    function renderTable(dates) {
        var tbody = document.getElementById('reportTableBody');
        if (!tbody) return;
        renderDayHeaders(dates);
        tbody.innerHTML = reportEmployees.map(function (emp) {
            return createEmployeeRow(emp, dates);
        }).join('');
    }

    /* =============================================
       DAY COLUMNS
       ============================================= */
    var currentVisibleDates = [];

    // Re-render only when the set of days actually changes; selection is reset.
    function showDays(datesToShow) {
        var same = datesToShow.length === currentVisibleDates.length &&
            datesToShow.every(function (d, i) { return d === currentVisibleDates[i]; });
        currentVisibleDates = datesToShow.slice();
        if (!same || !document.querySelector('#reportTableBody tr')) {
            renderTable(currentVisibleDates);
            updateFieldsVisibility();
        }
        updateVisibleTotals(currentVisibleDates);
    }

    /* =============================================
       TOTALS
       ============================================= */
    function formatHour(h) {
        if (!Number.isFinite(h) || h <= 0) return '0h';
        return Number.isInteger(h) ? h + 'h' : h.toFixed(2).replace(/\.?0+$/, '') + 'h';
    }

    // Pay is per day (decided Oct 2026):
    //   Total Rate          = Daily Rate x days with a log
    //   Total Rate Overtime = Overtime Rate per hour x overtime hours (adjustments included)
    // Client columns use the client rates the same way.
    function setText(row, selector, text) {
        var el = row.querySelector(selector);
        if (el) el.textContent = text;
    }

    function updateVisibleTotals(datesToShow) {
        var otRate = (projectContext && Number(projectContext.overtimeRate)) || 0;
        var clientOtRate = (projectContext && Number(projectContext.clientOvertimeRate)) || 0;
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            var days = 0, totalWork = 0, totalOT = 0;
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (datesToShow.indexOf(cell.dataset.date) < 0 || cell.classList.contains('weekend-off-cell')) return;
                if (cell.dataset.inTime || cell.dataset.outTime) days++;
                totalWork += Number(cell.dataset.work) || 0;
                totalOT += Number(cell.dataset.otTotal) || 0;
            });
            var daily = Number(row.dataset.dailyRate) || 0;
            var clientDaily = Number(row.dataset.clientDailyRate) || 0;
            setText(row, '.col-totaldays', days + 'd');
            setText(row, '.col-totalhour', formatHour(totalWork));
            setText(row, '.col-totalovertime', formatHour(totalOT));
            setText(row, '.col-emp-totalrate', formatIDR(days * daily));
            setText(row, '.col-emp-totalovertime', formatIDR(Math.round(totalOT * otRate)));
            setText(row, '.col-cli-totalrate', formatIDR(days * clientDaily));
            setText(row, '.col-cli-totalovertime', formatIDR(Math.round(totalOT * clientOtRate)));
        });
    }

    /* =============================================
       FILTERS
       ============================================= */
    function getDraftMissingTypes() {
        return Array.from(document.querySelectorAll('.filter-missing:checked')).map(function (i) { return i.value; });
    }

    function getSelectedMissingTypes() {
        return appliedReportFilters.missingTypes.slice();
    }

    // The ticked boxes must equal exactly what the cell is missing:
    //   Log In only        -> cells missing only the log in
    //   Log Out only       -> cells missing only the log out
    //   Log In + Log Out   -> cells missing both (one-sided cells stay hidden)
    // Same rule as the live Feriiz report.
    function cellMatchesMissing(cellMissing, types) {
        var wantIn = types.indexOf('in') >= 0;
        var wantOut = types.indexOf('out') >= 0;
        if (cellMissing === 'both') return wantIn && wantOut;
        if (cellMissing === 'in') return wantIn && !wantOut;
        if (cellMissing === 'out') return wantOut && !wantIn;
        return false;
    }

    function rowHasMissingType(row, types) {
        if (types.length === 0) return true;
        var cells = row.querySelectorAll('td.day-col');
        for (var i = 0; i < cells.length; i++) {
            if (currentVisibleDates.indexOf(cells[i].dataset.date) >= 0 &&
                cellMatchesMissing(cells[i].dataset.missing || '', types)) {
                return true;
            }
        }
        return false;
    }

    function rowMatchesSearch(row) {
        var q = ((document.getElementById('reportSearch') || {}).value || '').trim().toLowerCase();
        if (!q) return true;
        return ((row.querySelector('.col-name') || {}).textContent || '').toLowerCase().indexOf(q) >= 0;
    }

    function rowMatchesOccupation(row) {
        var sel = appliedReportFilters.occupations;
        if (sel.length === 0) return true;
        var occ = ((row.querySelector('.emp-occupation-cell') || {}).textContent || '').toLowerCase();
        return sel.some(function (s) { return occ.indexOf(s) >= 0; });
    }

    function applyReportFilters() {
        var types = getSelectedMissingTypes();
        var hasFilter = types.length > 0;

        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            var vis = rowMatchesSearch(row) && rowMatchesOccupation(row) && rowHasMissingType(row, types);
            row.hidden = !vis;
            if (!vis) {
                row.querySelectorAll('.day-cell-select:checked').forEach(function (cb) { cb.checked = false; });
            }

            // When filter active: only show cells that ARE missing the selected type
            // All other cells (normal + different missing type) get hidden
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (!hasFilter) {
                    cell.classList.remove('filtered-out-cell');
                    return;
                }
                var isMatch = cellMatchesMissing(cell.dataset.missing || '', types);
                cell.classList.toggle('filtered-out-cell', !isMatch);
            });
        });
        updateCellSelectionUI();
        updateFilterIndicator();
    }

    /* =============================================
       CELL SELECTION
       ============================================= */
    function getSelectedCells() {
        var cells = [];
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            if (row.hidden) return;
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (currentVisibleDates.indexOf(cell.dataset.date) < 0) return;
                var cb = cell.querySelector('.day-cell-select');
                if (cb && cb.checked) cells.push(cell);
            });
        });
        return cells;
    }

    function getAffectedEmployeeCount() {
        var codes = new Set();
        getSelectedCells().forEach(function (cell) {
            var row = cell.closest('tr');
            if (row) codes.add(row.dataset.employeeCode);
        });
        return codes.size;
    }

    function updateCellSelectionUI() {
        var selected = getSelectedCells();
        var bulkBar = document.getElementById('reportBulkActions');
        var countText = document.getElementById('selectedCellCount');
        var toggle = document.getElementById('batchUpdateToggle');
        var deselectBtn = document.getElementById('deselectAll');

        if (bulkBar) bulkBar.hidden = selected.length === 0;
        if (countText) countText.textContent = selected.length + ' selected';
        if (toggle) toggle.disabled = selected.length === 0;
        if (deselectBtn) deselectBtn.style.display = selected.length > 0 ? '' : 'none';

        var hasLogs = selected.some(function (cell) {
            return (cell.dataset.inTime && cell.dataset.inTime.trim() !== '') ||
                   (cell.dataset.outTime && cell.dataset.outTime.trim() !== '');
        });

        var deleteBtn = document.querySelector('#batchUpdateDropdown button[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.disabled = !hasLogs;
        }

        var otBtn = document.querySelector('#batchUpdateDropdown button[data-action="overtime"]');
        if (otBtn) {
            var anyComplete = selected.some(isCompleteCell);
            otBtn.disabled = !anyComplete;
            otBtn.title = anyComplete ? '' : 'Select days that have both a log in and a log out';
        }

        syncDayHeaderSelections();
    }

    function syncDayHeaderSelections() {
        document.querySelectorAll('.day-header-select').forEach(function (headerCb) {
            var date = headerCb.dataset.date;
            var checkboxes = [];

            document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
                if (row.hidden || currentVisibleDates.indexOf(date) < 0) return;
                var cell = row.querySelector('td.day-col[data-date="' + date + '"]');
                if (!cell || cell.classList.contains('filtered-out-cell')) return;
                var cb = cell.querySelector('.day-cell-select');
                if (cb) checkboxes.push(cb);
            });

            var checkedCount = checkboxes.filter(function (cb) { return cb.checked; }).length;
            headerCb.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
            headerCb.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        });
    }

    function shortDate(iso) {
        var d = fromISO(iso);
        return String(d.getDate()).padStart(2, '0') + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
    }

    // Always shows the date range in use (as the live Feriiz does), then any other
    // filter with an x to remove it.
    function updateFilterIndicator() {
        var bar = document.getElementById('reportFilterIndicator');
        var chips = document.getElementById('filterIndicatorChips');
        if (!bar || !chips) return;

        var range = appliedRange();
        var html = '<span class="filter-indicator-chip filter-indicator-chip--range">Date Range: ' + shortDate(range.start) + ' - ' + shortDate(range.end) + '</span>';
        if (appliedReportFilters.occupations.length) {
            var occ = appliedReportFilters.occupationLabels.length ? appliedReportFilters.occupationLabels : appliedReportFilters.occupations;
            html += '<span class="filter-indicator-chip">Occupation: ' + escapeHTML(occ.join(', ')) +
                '<button class="filter-chip-close" data-filter-type="occupation" aria-label="Remove the occupation filter">&times;</button></span>';
        }
        var labels = { 'in': 'Log In', 'out': 'Log Out' };
        getSelectedMissingTypes().forEach(function (t) {
            html += '<span class="filter-indicator-chip">' + (labels[t] || t) +
                '<button class="filter-chip-close" data-filter-type="' + t + '" aria-label="Remove the ' + (labels[t] || t) + ' filter">&times;</button></span>';
        });
        bar.style.display = '';
        chips.innerHTML = html;

        chips.querySelectorAll('.filter-chip-close').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.filterType;
                if (type === 'occupation') {
                    if (window.FeriizFilters && window.FeriizFilters.resetOccupationFilter) window.FeriizFilters.resetOccupationFilter(document);
                    appliedReportFilters.occupations = [];
                    appliedReportFilters.occupationLabels = [];
                } else {
                    document.querySelectorAll('.filter-missing').forEach(function (cb) {
                        if (cb.value === type) cb.checked = false;
                    });
                    appliedReportFilters.missingTypes = appliedReportFilters.missingTypes.filter(function (item) {
                        return item !== type;
                    });
                }
                applyReportFilters();
            });
        });
    }

    function deselectAllCells() {
        document.querySelectorAll('.day-cell-select').forEach(function (cb) { cb.checked = false; });
        document.querySelectorAll('.day-header-select').forEach(function (cb) {
            cb.checked = false;
            cb.indeterminate = false;
        });
        document.querySelectorAll('.report-table td.day-col').forEach(function (cell) {
            cell.classList.remove('cell-selected');
        });
        var dropdown = document.getElementById('batchUpdateDropdown');
        if (dropdown) dropdown.classList.remove('show');
        updateCellSelectionUI();
    }

    /* =============================================
       BATCH UPDATE MODAL
       ============================================= */
    var activeAction = 'add';

    function setLogType(type) {
        var label = document.getElementById('batchUpdateLabel');
        var input = document.getElementById('batchUpdateInput');
        document.querySelectorAll('.batch-log-type-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.logType === type);
        });
        if (label) label.textContent = type === 'in' ? 'Set Log In Time' : 'Set Log Out Time';
        if (input) input.value = type === 'in' ? '07:00:00' : '17:00:00';
    }

    function getActiveLogType() {
        var active = document.querySelector('.batch-log-type-btn.active');
        return active ? active.dataset.logType : 'in';
    }

    function showBatchModal(action) {
        var selected = getSelectedCells();
        if (selected.length === 0) {
            if (window.FeriizNotify) FeriizNotify.warning('Select at least one report cell first.', 'No log selected');
            return;
        }
        activeAction = action;

        // Close dropdown
        var dd = document.getElementById('batchUpdateDropdown');
        if (dd) dd.classList.remove('show');

        if (action === 'overtime') {
            openOvertimeModal();
            return;
        }


        // Delete actions go to confirmation modal
        if (action === 'delete') {
            var hasLogs = selected.some(function (cell) {
                return (cell.dataset.inTime && cell.dataset.inTime.trim() !== '') ||
                       (cell.dataset.outTime && cell.dataset.outTime.trim() !== '');
            });
            if (!hasLogs) {
                if (window.FeriizNotify) FeriizNotify.warning('The selected cells do not contain a log to delete.', 'No log found');
                return;
            }
            showDeleteConfirm(action, selected);
            return;
        }

        // Add Log modal
        var modal = document.getElementById('batchUpdateModal');
        var title = document.getElementById('batchUpdateTitle');
        var label = document.getElementById('batchUpdateLabel');
        var input = document.getElementById('batchUpdateInput');
        var note = document.getElementById('batchUpdateNote');
        var cellSum = document.getElementById('batchSelectedSummary');
        var empSum = document.getElementById('batchEmployeeSummary');

        if (label) label.style.display = '';
        if (input) input.style.display = '';

        if (title) title.textContent = 'Add Log';

        // Detect default log type based on selected cells
        var inCount = 0, outCount = 0;
        selected.forEach(function (c) {
            var m = c.dataset.missing || '';
            if (m === 'in') inCount++;
            else if (m === 'out') outCount++;
        });
        var defaultType = inCount >= outCount ? 'in' : 'out';
        setLogType(defaultType);
        if (note) note.value = '';
        if (cellSum) cellSum.textContent = selected.length + ' log';
        if (empSum) empSum.textContent = getAffectedEmployeeCount() + ' employee';
        if (modal) modal.classList.add('show');
    }

    function showDeleteConfirm(action, selected) {
        var modal = document.getElementById('deleteConfirmModal');
        var title = document.getElementById('deleteConfirmTitle');
        var msg = document.getElementById('deleteConfirmMessage');
        var cellSum = document.getElementById('deleteSelectedSummary');
        var empSum = document.getElementById('deleteEmployeeSummary');

        if (title) title.textContent = 'Delete Log';
        if (msg) msg.textContent = 'Are you sure you want to delete the selected log? This action cannot be undone.';
        if (cellSum) cellSum.textContent = selected.length + ' log';
        if (empSum) empSum.textContent = getAffectedEmployeeCount() + ' employee';
        if (modal) modal.classList.add('show');
    }

    function closeDeleteConfirm() {
        var modal = document.getElementById('deleteConfirmModal');
        if (modal) modal.classList.remove('show');
    }

    function closeBatchModal() {
        var modal = document.getElementById('batchUpdateModal');
        var label = document.getElementById('batchUpdateLabel');
        var input = document.getElementById('batchUpdateInput');
        if (modal) modal.classList.remove('show');
        if (label) label.style.display = '';
        if (input) input.style.display = '';
    }

    function formatLogNoteDate(value) {
        if (!value) return '-';
        var parts = value.split('-').map(Number);
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function openLogNote(cell, type) {
        if (!cell) return;
        var row = cell.closest('tr');
        var note = type === 'in' ? cell.dataset.inNote : cell.dataset.outNote;
        var clock = type === 'in' ? cell.dataset.inTime : cell.dataset.outTime;
        var modal = document.getElementById('logNoteModal');
        if (!modal || !note) return;

        document.getElementById('logNoteEmployee').textContent = row ? (row.dataset.employeeName || '-') : '-';
        document.getElementById('logNoteDate').textContent = formatLogNoteDate(cell.dataset.date);
        document.getElementById('logNoteType').textContent = type === 'in' ? 'Log In' : 'Log Out';
        document.getElementById('logNoteClock').textContent = clock || '-';
        document.getElementById('logNoteText').textContent = note;
        modal.classList.add('show');
    }

    function closeLogNote() {
        var modal = document.getElementById('logNoteModal');
        if (modal) modal.classList.remove('show');
    }

    function clearRecentUpdateMarkers() {
        // Presentation-only state: never persisted and never sent to the backend.
        document.querySelectorAll('.recently-updated-cell').forEach(function (cell) {
            cell.classList.remove('recently-updated-cell');
            var badge = cell.querySelector('.cell-updated-badge');
            if (badge) badge.remove();
        });
    }

    function getBatchDateSummary(cells) {
        var dates = Array.from(new Set(cells.map(function (cell) { return cell.dataset.date; }).filter(Boolean)));
        if (dates.length !== 1) return dates.length + ' selected dates';

        var parts = dates[0].split('-').map(Number);
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function applyBatchUpdate() {
        var input = document.getElementById('batchUpdateInput');
        var noteInput = document.getElementById('batchUpdateNote');
        var clockValue = input ? input.value : '07:00:00';
        var noteValue = noteInput ? noteInput.value.trim() : '';
        var selectedCells = getSelectedCells();
        var affectedEmployees = getAffectedEmployeeCount();
        var selectedLogType = getActiveLogType();
        var dateSummary = getBatchDateSummary(selectedCells);
        var updated = 0;

        if (selectedCells.length === 0) {
            if (window.FeriizNotify) FeriizNotify.warning('Select at least one report cell first.', 'No log selected');
            return;
        }
        if (activeAction === 'add' && !clockValue) {
            if (input) input.focus();
            if (window.FeriizNotify) FeriizNotify.warning('Set a valid clock time before saving.', 'Log not saved');
            return;
        }

        clearRecentUpdateMarkers();

        if (activeAction === 'add') {
            // Determine if we are adding log-in or log-out based on label
            var addingIn = getActiveLogType() === 'in';

            selectedCells.forEach(function (cell) {
                var missing = cell.dataset.missing || '';
                var existIn = cell.dataset.inTime || '';
                var existOut = cell.dataset.outTime || '';
                var existInNote = cell.dataset.inNote || '';
                var existOutNote = cell.dataset.outNote || '';

                var fillType = addingIn ? 'in' : 'out';

                var newIn = fillType === 'in' ? clockValue : existIn;
                var newOut = fillType === 'out' ? clockValue : existOut;
                // A blank optional note must not erase an existing audit note.
                var newInNote = fillType === 'in' ? (noteValue || existInNote) : existInNote;
                var newOutNote = fillType === 'out' ? (noteValue || existOutNote) : existOutNote;

                // Always: in on top, out on bottom
                var lines = [];
                if (newIn) lines.push({ type: 'in', value: newIn, fixed: true, note: newInNote });
                if (newOut) lines.push({ type: 'out', value: newOut, fixed: true, note: newOutNote });

                cell.dataset.inTime = newIn;
                cell.dataset.outTime = newOut;
                cell.dataset.inNote = newInNote;
                cell.dataset.outNote = newOutNote;
                rememberCell(cell);

                var issue = getMissingType(newIn, newOut);
                if (issue) {
                    cell.dataset.missing = issue;
                    cell.classList.add('no-log-cell');
                } else {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                }

                if (newIn || newOut) {
                    cell.classList.remove('weekend-off-cell');
                }

                cell.classList.add('recently-updated-cell');
                cell.classList.remove('cell-selected');

                var addCode = cell.closest('tr').dataset.employeeCode;
                var addHours = cellHours(addCode, cell.dataset.date, newIn, newOut);
                var addAdjust = otAdjustFor(addCode, cell.dataset.date);
                setCellHours(cell, addHours, addAdjust);
                cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                    buildDayCellContent({ inTime: newIn, outTime: newOut, inNote: newInNote, outNote: newOutNote, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true, hours: addHours, otAdjust: addAdjust, otLogCount: otLogCountFor(addCode, cell.dataset.date) });
                updated++;
            });
        } else if (activeAction.indexOf('delete') === 0) {
            selectedCells.forEach(function (cell) {
                var existIn = cell.dataset.inTime || '';
                var existOut = cell.dataset.outTime || '';
                var existInNote = cell.dataset.inNote || '';
                var existOutNote = cell.dataset.outNote || '';
                var date = cell.dataset.date;

                if (activeAction === 'delete-in') {
                    existIn = '';
                    existInNote = '';
                } else if (activeAction === 'delete-out') {
                    existOut = '';
                    existOutNote = '';
                } else {
                    existIn = '';
                    existOut = '';
                    existInNote = '';
                    existOutNote = '';
                }

                cell.dataset.inTime = existIn;
                cell.dataset.outTime = existOut;
                cell.dataset.inNote = existInNote;
                cell.dataset.outNote = existOutNote;
                rememberCell(cell);

                // An emptied day off goes back to grey; an emptied work day is missing both logs.
                var backToDayOff = !existIn && !existOut && isOffCell(cell.closest('tr').dataset.employeeCode, date);
                var issue = backToDayOff ? '' : getMissingType(existIn, existOut);
                if (issue) {
                    cell.dataset.missing = issue;
                    cell.classList.add('no-log-cell');
                } else {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                    if (backToDayOff) cell.classList.add('weekend-off-cell');
                }

                cell.classList.add('recently-updated-cell');
                cell.classList.remove('cell-selected');

                var lines = [];
                if (existIn) lines.push({ type: 'in', value: existIn, note: existInNote });
                if (existOut) lines.push({ type: 'out', value: existOut, note: existOutNote });

                var delCode = cell.closest('tr').dataset.employeeCode;
                var delHours = cellHours(delCode, date, existIn, existOut);
                var delAdjust = otAdjustFor(delCode, date);
                setCellHours(cell, delHours, delAdjust);
                if (backToDayOff) {
                    cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';
                } else {
                    cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                        buildDayCellContent({ inTime: existIn, outTime: existOut, inNote: existInNote, outNote: existOutNote, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true, hours: delHours, otAdjust: delAdjust, otLogCount: otLogCountFor(delCode, date) });
                }
                updated++;
            });
        }

        closeBatchModal();
        deselectAllCells();
        applyReportFilters();
        updateVisibleTotals(currentVisibleDates);
        if (updated > 0 && window.FeriizNotify) {
            var isAdd = activeAction === 'add';
            var logLabel = selectedLogType === 'in' ? 'log in' : 'log out';
            var title = isAdd ? (selectedLogType === 'in' ? 'Log in added' : 'Log out added') : 'Log deleted';
            var employeeLabel = affectedEmployees === 1 ? 'employee' : 'employees';
            var entryLabel = updated === 1 ? 'entry was' : 'entries were';
            var message = isAdd
                ? updated + ' ' + logLabel + ' ' + entryLabel + ' added for ' + affectedEmployees + ' ' + employeeLabel + ' on ' + dateSummary +
                    (noteValue ? ' A note was attached to each updated log.' : '') +
                    (selectedLogType === 'in'
                        ? ' Cells that still need log out remain yellow.'
                        : ' The updated cells are highlighted in blue.')
                : updated + ' selected log entries were deleted on ' + dateSummary + '.';
            window.FeriizNotify.success(message, title);
        }
    }

    /* =============================================
       ADD OVERTIME (named like Add Log in Batch Update)
       Adds overtime on the selected days. The system value is
       never overwritten: each change is appended to the day's ledger, the
       yellow badge shows the new total and a chip shows the adjustment.
       Mistakes are corrected with another adjustment, not by editing.
       Only days with both logs qualify; incomplete days are deselected.
       ============================================= */
    var overtimeModal = null;
    var overtimeHistoryModal = null;

    function isCompleteCell(cell) {
        return Boolean(cell.dataset.inTime && cell.dataset.outTime) && !cell.classList.contains('weekend-off-cell');
    }

    function overtimeMinutes() {
        var h = parseInt(overtimeModal.querySelector('#otHours').value, 10) || 0;
        var m = parseInt(overtimeModal.querySelector('#otMinutes').value, 10) || 0;
        return Math.max(0, h) * 60 + Math.min(Math.max(0, m), 59);
    }

    function refreshOvertimePreview() {
        var minutes = overtimeMinutes();
        var cells = getSelectedCells().filter(isCompleteCell);
        overtimeModal.querySelector('#otSubmit').textContent = 'Add ' + (minutes ? formatAdjust(minutes).slice(1) : 'overtime') +
            ' on ' + cells.length + (cells.length === 1 ? ' day' : ' days');
    }

    function buildOvertimeModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'overtimeModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'overtimeModalTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<h2 class="modal-title" id="overtimeModalTitle">Add Overtime</h2>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="ot-summary">' +
                            '<div><span>Days</span><strong id="otDays">0</strong></div>' +
                            '<div><span>Employees</span><strong id="otEmployees">0</strong></div>' +
                        '</div>' +
                        '<p class="ot-skipped" id="otSkipped" hidden></p>' +
                        '<label class="form-label" for="otHours">Amount per day</label>' +
                        '<div class="row g-2 mb-1">' +
                            '<div class="col-6"><div class="input-group">' +
                                '<input type="number" class="form-control" id="otHours" min="0" max="12" step="1" value="1" aria-label="Hours">' +
                                '<span class="input-group-text">hours</span></div></div>' +
                            '<div class="col-6"><div class="input-group">' +
                                '<input type="number" class="form-control" id="otMinutes" min="0" max="59" step="5" value="0" aria-label="Minutes">' +
                                '<span class="input-group-text">minutes</span></div></div>' +
                        '</div>' +
                        '<div class="mb-3"></div>' +
                        '<label class="form-label" for="otReason">Reason</label>' +
                        '<textarea class="form-control" id="otReason" rows="2" placeholder="For example: the concrete pour ran until 20:00, approved by the site manager"></textarea>' +
                        '<div class="form-text">The recorded overtime is kept. This is added on top and saved in each day\u2019s history.</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="otSubmit">Add overtime</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelectorAll('#otHours, #otMinutes').forEach(function (input) {
            input.addEventListener('input', refreshOvertimePreview);
            input.addEventListener('change', refreshOvertimePreview);
        });
        el.querySelector('#otSubmit').addEventListener('click', applyOvertimeUpdate);
        return el;
    }

    function openOvertimeModal() {
        var selected = getSelectedCells();
        var eligible = selected.filter(isCompleteCell);
        if (!eligible.length) {
            if (window.FeriizNotify) FeriizNotify.warning('Select days that have both a log in and a log out.', 'No overtime to add');
            return;
        }
        // Incomplete days cannot take overtime: drop them from the selection.
        var skipped = selected.length - eligible.length;
        selected.forEach(function (cell) {
            if (!isCompleteCell(cell)) {
                var cb = cell.querySelector('.day-cell-select');
                if (cb) cb.checked = false;
            }
        });
        updateCellSelectionUI();

        if (!overtimeModal) overtimeModal = buildOvertimeModal();
        var employees = new Set(eligible.map(function (c) { return c.closest('tr').dataset.employeeCode; }));
        overtimeModal.querySelector('#otDays').textContent = eligible.length;
        overtimeModal.querySelector('#otEmployees').textContent = employees.size;
        var skippedNote = overtimeModal.querySelector('#otSkipped');
        skippedNote.hidden = !skipped;
        skippedNote.textContent = skipped + (skipped === 1 ? ' selected day was' : ' selected days were') +
            ' left out because the log is incomplete. Fix the log first, then add its overtime.';
        overtimeModal.querySelector('#otHours').value = 1;
        overtimeModal.querySelector('#otMinutes').value = 0;
        overtimeModal.querySelector('#otReason').value = '';
        overtimeModal.querySelector('#otReason').classList.remove('is-invalid');
        refreshOvertimePreview();
        window.bootstrap.Modal.getOrCreateInstance(overtimeModal).show();
    }

    function applyOvertimeUpdate() {
        var minutes = overtimeMinutes();
        var reasonInput = overtimeModal.querySelector('#otReason');
        var reason = reasonInput.value.trim();
        if (!minutes) {
            overtimeModal.querySelector('#otHours').focus();
            if (window.FeriizNotify) FeriizNotify.warning('Enter how much overtime to add.', 'Overtime not added');
            return;
        }
        if (!reason) {
            reasonInput.classList.add('is-invalid');
            reasonInput.focus();
            if (window.FeriizNotify) FeriizNotify.warning('Write the reason so the change can be checked later.', 'Reason required');
            return;
        }
        var cells = getSelectedCells().filter(isCompleteCell);
        var employees = new Set();
        var at = new Date();
        clearRecentUpdateMarkers();

        cells.forEach(function (cell) {
            var row = cell.closest('tr');
            var code = row.dataset.employeeCode;
            var key = code + '|' + cell.dataset.date;
            rememberCell(cell);
            var entry = cellOverrides[key];
            entry.otAdjust = (entry.otAdjust || 0) + minutes;
            entry.otLog = entry.otLog.concat([{ minutes: minutes, note: reason, at: at.toISOString(), by: 'Admin' }]);
            employees.add(code);

            var hours = { work: Number(cell.dataset.work) || 0, ot: Number(cell.dataset.ot) || 0 };
            setCellHours(cell, hours, entry.otAdjust);
            cell.classList.add('recently-updated-cell');
            cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                buildDayCellContent({ inTime: cell.dataset.inTime, outTime: cell.dataset.outTime, inNote: cell.dataset.inNote, outNote: cell.dataset.outNote, issue: '', updated: true, hours: hours, otAdjust: entry.otAdjust, otLogCount: entry.otLog.length });
        });

        window.bootstrap.Modal.getInstance(overtimeModal).hide();
        deselectAllCells();
        applyReportFilters();
        updateVisibleTotals(currentVisibleDates);
        if (window.FeriizNotify) {
            FeriizNotify.success('Overtime ' + formatAdjust(minutes) + ' was added to ' + cells.length +
                (cells.length === 1 ? ' day' : ' days') + ' for ' + employees.size + (employees.size === 1 ? ' employee.' : ' employees.'),
                'Overtime added');
        }
    }

    function openOvertimeHistory(cell) {
        var row = cell.closest('tr');
        var entry = cellOverrides[row.dataset.employeeCode + '|' + cell.dataset.date];
        if (!entry || !entry.otLog.length) return;
        if (!overtimeHistoryModal) {
            overtimeHistoryModal = document.createElement('div');
            overtimeHistoryModal.className = 'modal fade';
            overtimeHistoryModal.id = 'overtimeHistoryModal';
            overtimeHistoryModal.tabIndex = -1;
            overtimeHistoryModal.setAttribute('aria-labelledby', 'otHistoryTitle');
            overtimeHistoryModal.setAttribute('aria-hidden', 'true');
            overtimeHistoryModal.innerHTML =
                '<div class="modal-dialog modal-dialog-centered">' +
                    '<div class="modal-content">' +
                        '<div class="modal-header">' +
                            '<div><h2 class="modal-title" id="otHistoryTitle">Overtime history</h2>' +
                            '<p class="ot-history-sub" id="otHistorySub"></p></div>' +
                            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                        '</div>' +
                        '<div class="modal-body">' +
                            '<div class="ot-history-total" id="otHistoryTotal"></div>' +
                            '<ol class="ot-history-list" id="otHistoryList"></ol>' +
                        '</div>' +
                        '<div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">Done</button></div>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(overtimeHistoryModal);
        }
        var system = Number(cell.dataset.ot) || 0;
        overtimeHistoryModal.querySelector('#otHistorySub').textContent =
            row.dataset.employeeName + ', ' + formatLogNoteDate(cell.dataset.date);
        overtimeHistoryModal.querySelector('#otHistoryTotal').innerHTML =
            '<div><span>Recorded</span><strong>' + formatHour(system) + '</strong></div>' +
            '<div><span>Adjusted</span><strong>' + formatAdjust(entry.otAdjust) + '</strong></div>' +
            '<div><span>Total overtime</span><strong>' + formatHour(Number(cell.dataset.otTotal) || 0) + '</strong></div>';
        var list = overtimeHistoryModal.querySelector('#otHistoryList');
        list.innerHTML = '';
        entry.otLog.forEach(function (log) {
            var li = document.createElement('li');
            var when = new Date(log.at);
            li.innerHTML = '<span class="ot-history-amount ' + (log.minutes > 0 ? 'is-plus' : 'is-minus') + '"></span>' +
                '<div><p class="ot-history-note"></p><p class="ot-history-meta"></p></div>';
            li.querySelector('.ot-history-amount').textContent = formatAdjust(log.minutes);
            li.querySelector('.ot-history-note').textContent = log.note;
            li.querySelector('.ot-history-meta').textContent = log.by + ', ' +
                when.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
                when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            list.appendChild(li);
        });
        window.bootstrap.Modal.getOrCreateInstance(overtimeHistoryModal).show();
    }

    /* =============================================
       FIELDS TOGGLE
       ============================================= */
    var colMap = {
        colActiveHour: ['.col-activehour'],
        colInOutHour: ['.col-inouthour'],
        colEmpDailyRate: ['.col-emp-dailyrate'],
        colEmpRateOvertime: ['.col-emp-rateovertime'],
        colEmpTotalRate: ['.col-emp-totalrate'],
        colEmpTotalOvertime: ['.col-emp-totalovertime'],
        colClientDailyRate: ['.col-cli-dailyrate'],
        colClientRateOvertime: ['.col-cli-rateovertime'],
        colClientTotalRate: ['.col-cli-totalrate'],
        colClientTotalOvertime: ['.col-cli-totalovertime']
    };
    var masterGroups = {
        colEmployee: ['colEmpDailyRate', 'colEmpRateOvertime', 'colEmpTotalRate', 'colEmpTotalOvertime'],
        colClient: ['colClientDailyRate', 'colClientRateOvertime', 'colClientTotalRate', 'colClientTotalOvertime']
    };
    var groupHeaders = {
        grpTimePeriod: ['.col-inouthour', '.col-activehour'],
        grpEmployee: ['.col-emp-dailyrate', '.col-emp-rateovertime', '.col-emp-totalrate', '.col-emp-totalovertime'],
        grpClient: ['.col-cli-dailyrate', '.col-cli-rateovertime', '.col-cli-totalrate', '.col-cli-totalovertime'],
        grpAdditional: ['.col-additional-amount', '.col-additional-note']
    };

    function updateFieldsVisibility() {
        Object.keys(colMap).forEach(function (id) {
            var cb = document.getElementById(id);
            if (!cb) return;
            colMap[id].forEach(function (cls) {
                document.querySelectorAll(cls).forEach(function (el) {
                    el.classList.toggle('day-col-hidden', !cb.checked);
                });
            });
        });
        Object.keys(groupHeaders).forEach(function (hId) {
            var th = document.getElementById(hId);
            if (!th) return;
            var firstRow = document.querySelector('.report-table tbody tr');
            if (!firstRow) return;
            var count = 0;
            groupHeaders[hId].forEach(function (cls) {
                firstRow.querySelectorAll(cls).forEach(function (c) {
                    if (!c.classList.contains('day-col-hidden')) count++;
                });
            });
            if (count > 0) { th.colSpan = count; th.classList.remove('day-col-hidden'); }
            else { th.classList.add('day-col-hidden'); }
        });
    }

    /* =============================================
       PERIOD PRESETS
       ============================================= */
    function initPeriodPresets() {
        var ps = document.querySelector('.filter-period');
        var di = document.querySelectorAll('.filter-date');
        if (!ps || di.length < 2) return;
        ps.addEventListener('change', function () {
            var v = this.value, today = reportToday, s = '', e = '';
            var monthStart = today.slice(0, 8) + '01';
            if (v === 'today') { s = e = today; }
            else if (v === 'yesterday') { s = e = addDays(today, -1); }
            else if (v === 'this_week') { s = mondayOf(today); e = today; }
            else if (v === 'last_week') { s = addDays(mondayOf(today), -7); e = addDays(s, 6); }
            else if (v === 'this_month') { s = monthStart; e = today; }
            else if (v === 'last_month') { e = addDays(monthStart, -1); s = e.slice(0, 8) + '01'; }
            else if (v === 'this_year') { s = today.slice(0, 4) + '-01-01'; e = today; }
            else if (v === 'all_time') { s = dataStart || ''; e = today; }
            else return; // Custom: leave the dates as typed
            di[0].value = s; di[1].value = e;
        });
        // Typing a date by hand turns the period into Custom (as in the old Feriiz).
        di.forEach(function (input) {
            input.addEventListener('input', function () { ps.value = 'custom'; });
        });
    }

    // The date fields show the range in use, so "This Week" is visible as real dates.
    function resetDateDraft() {
        var range = defaultRange();
        var di = document.querySelectorAll('.filter-date');
        var ps = document.querySelector('.filter-period');
        if (di.length >= 2) { di[0].value = range.start; di[1].value = range.end; }
        if (ps) ps.value = 'this_week';
    }

    function datesFromDraft() {
        var di = document.querySelectorAll('.filter-date');
        var s = di[0] ? di[0].value : '';
        var e = di[1] ? di[1].value : '';
        if (!s && !e) return datesInRange();
        if (s && e && s > e) { var t = s; s = e; e = t; }
        var dates = datesInRange(s || e, e || s);
        if (dates.length === 0 && window.FeriizNotify) {
            FeriizNotify.info('There is no attendance for these days yet. Only days up to today are shown.', 'Nothing to show yet');
        }
        return dates;
    }

    /* =============================================
       INIT
       ============================================= */
    /* =============================================
       IMPORT XLSX
       Upload a timesheet to add logs in bulk. The file is checked here
       (type, size, CSV row count); the server does the real import once
       Feriiz is connected to the API.
       ============================================= */
    var IMPORT_TYPES = ['.xlsx', '.xls', '.csv'];
    var IMPORT_MAX = 5 * 1024 * 1024;
    var importModal = null;
    var importFile = null;

    function importSize(bytes) {
        return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function downloadTemplate() {
        var rows = [
            ['Employee Code', 'Date (YYYY-MM-DD)', 'Log In (HH:mm:ss)', 'Log Out (HH:mm:ss)', 'Note'],
            [reportEmployees[0] ? reportEmployees[0].code : 'EMPLOYEECODE', reportToday, '08:00:00', '17:00:00', '']
        ];
        var csv = rows.map(function (r) {
            return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\r\n');
        var url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
        var a = document.createElement('a');
        a.href = url;
        a.download = 'feriiz-attendance-template.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function setImportFile(file) {
        var error = importModal.querySelector('#importError');
        var chosen = importModal.querySelector('#importChosen');
        var submit = importModal.querySelector('#importSubmit');
        error.hidden = true;
        importFile = null;
        submit.disabled = true;
        chosen.hidden = true;
        if (!file) return;
        var ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (IMPORT_TYPES.indexOf(ext) < 0) {
            error.textContent = file.name + ' is not a spreadsheet. Choose an .xlsx, .xls or .csv file.';
            error.hidden = false;
            return;
        }
        if (file.size > IMPORT_MAX) {
            error.textContent = file.name + ' is ' + importSize(file.size) + '. The limit is 5 MB.';
            error.hidden = false;
            return;
        }
        importFile = file;
        chosen.hidden = false;
        chosen.querySelector('.import-file-name').textContent = file.name;
        chosen.querySelector('.import-file-meta').textContent = importSize(file.size);
        submit.disabled = false;
        if (ext === '.csv') {
            file.text().then(function (text) {
                var rows = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).length - 1;
                chosen.querySelector('.import-file-meta').textContent = importSize(file.size) + ', ' + Math.max(rows, 0) + ' rows';
            });
        }
    }

    function buildImportModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'importModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'importModalTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<h2 class="modal-title" id="importModalTitle">Import attendance</h2>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<p class="import-intro">Add log in and log out times for many employees at once from a spreadsheet. ' +
                            'Use the Feriiz template so every column is read correctly.</p>' +
                        '<label class="import-drop" for="importInput">' +
                            '<i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>' +
                            '<span class="import-drop-title">Drag a file here or <u>choose a file</u></span>' +
                            '<span class="import-drop-hint">.xlsx, .xls or .csv, up to 5 MB</span>' +
                            '<input type="file" id="importInput" class="visually-hidden" accept="' + IMPORT_TYPES.join(',') + '">' +
                        '</label>' +
                        '<div class="import-chosen" id="importChosen" hidden>' +
                            '<i class="fa-solid fa-file-excel" aria-hidden="true"></i>' +
                            '<div class="import-file-text"><div class="import-file-name"></div><div class="import-file-meta"></div></div>' +
                            '<button type="button" class="btn-close" id="importClear" aria-label="Remove file"></button>' +
                        '</div>' +
                        '<div class="import-error" id="importError" role="alert" hidden></div>' +
                        '<button type="button" class="import-template" id="importTemplate">' +
                            '<i class="fa-solid fa-download" aria-hidden="true"></i> Download template (.csv)</button>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="importSubmit" disabled>Import file</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);

        var input = el.querySelector('#importInput');
        var drop = el.querySelector('.import-drop');
        input.addEventListener('change', function () { setImportFile(input.files[0]); });
        ['dragenter', 'dragover'].forEach(function (t) {
            drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
        });
        ['dragleave', 'drop'].forEach(function (t) {
            drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
        });
        drop.addEventListener('drop', function (e) { setImportFile(e.dataTransfer.files[0]); });
        el.querySelector('#importClear').addEventListener('click', function () { input.value = ''; setImportFile(null); });
        el.querySelector('#importTemplate').addEventListener('click', downloadTemplate);
        el.querySelector('#importSubmit').addEventListener('click', function () {
            if (!importFile) return;
            var name = importFile.name;
            window.bootstrap.Modal.getInstance(el).hide();
            if (window.FeriizNotify) {
                FeriizNotify.info(name + ' was uploaded. Its logs will be added once Feriiz is connected to the server.', 'Import received');
            }
        });
        el.addEventListener('hidden.bs.modal', function () { input.value = ''; setImportFile(null); });
        return el;
    }

    function initImport() {
        var btn = document.getElementById('reportImportBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            if (!importModal) importModal = buildImportModal();
            window.bootstrap.Modal.getOrCreateInstance(importModal).show();
        });
    }

    function init() {
        initPeriodPresets();
        initImport();
        var templateBtn = document.getElementById('reportTemplateBtn');
        if (templateBtn) templateBtn.addEventListener('click', openTemplateAssign);
        resetDateDraft();
        showDays(datesInRange());
        updateFilterIndicator();

        // Apply filter
        var applyBtn = document.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                appliedReportFilters.missingTypes = getDraftMissingTypes();
                appliedReportFilters.occupations = (window.FeriizFilters && window.FeriizFilters.getOccupationValues)
                    ? window.FeriizFilters.getOccupationValues(document)
                    : [];
                appliedReportFilters.occupationLabels = selectedOccupationLabels();
                appliedReportFilters.range = draftRange();
                showDays(datesFromDraft());
                applyReportFilters();
            });
        }

        // Clear filter
        var clearBtn = document.querySelector('.filter-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                resetDateDraft();
                document.querySelectorAll('.filter-missing').forEach(function (i) { i.checked = false; });
                if (window.FeriizFilters && window.FeriizFilters.resetOccupationFilter) window.FeriizFilters.resetOccupationFilter(document);
                appliedReportFilters.missingTypes = [];
                appliedReportFilters.occupations = [];
                appliedReportFilters.occupationLabels = [];
                appliedReportFilters.range = null;
                deselectAllCells();
                showDays(datesInRange());
                applyReportFilters();
            });
        }

        // Search
        var searchInput = document.getElementById('reportSearch');
        if (searchInput) searchInput.addEventListener('input', applyReportFilters);

        // Day header select-all checkboxes (headers are re-rendered, so delegate)
        var thead = document.querySelector('.report-table thead');
        if (thead) {
            thead.addEventListener('change', function (e) {
                var headerCb = e.target;
                if (!headerCb.classList.contains('day-header-select')) return;
                var date = headerCb.dataset.date;
                document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
                    if (row.hidden) return;
                    var cell = row.querySelector('td.day-col[data-date="' + date + '"]');
                    if (!cell || cell.classList.contains('filtered-out-cell')) return;
                    var cb = cell.querySelector('.day-cell-select');
                    if (cb) cb.checked = headerCb.checked;
                });
                updateCellSelectionUI();
            });
        }

        // Log type toggle in modal
        document.querySelectorAll('.batch-log-type-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                setLogType(btn.dataset.logType);
            });
        });

        // Cell checkbox change (event delegation)
        var tbody = document.querySelector('.report-table tbody');
        if (tbody) {
            tbody.addEventListener('change', function (e) {
                if (e.target.classList.contains('day-cell-select')) {
                    updateCellSelectionUI();
                }
            });
            tbody.addEventListener('click', function (e) {
                var chip = e.target.closest('.ot-adjust-chip');
                if (!chip) return;
                e.preventDefault();
                e.stopPropagation();
                openOvertimeHistory(chip.closest('td.day-col'));
            });
            tbody.addEventListener('click', function (e) {
                var noteButton = e.target.closest('.report-log-note-btn');
                if (!noteButton) return;
                e.preventDefault();
                e.stopPropagation();
                openLogNote(noteButton.closest('td.day-col'), noteButton.dataset.logType);
            });
        }

        // Batch Update toggle
        var batchToggle = document.getElementById('batchUpdateToggle');
        var batchDD = document.getElementById('batchUpdateDropdown');
        if (batchToggle) {
            batchToggle.addEventListener('click', function (e) {
                e.stopPropagation();
                if (batchDD) batchDD.classList.toggle('show');
            });
        }
        document.addEventListener('click', function (e) {
            if (!batchDD || !batchDD.classList.contains('show')) return;
            if (batchDD.contains(e.target) || (batchToggle && batchToggle.contains(e.target))) return;
            batchDD.classList.remove('show');
        });
        if (batchDD) {
            batchDD.querySelectorAll('[data-action]').forEach(function (btn) {
                btn.addEventListener('click', function () { showBatchModal(btn.dataset.action); });
            });
        }

        // Add Log Modal
        var closeBtn = document.getElementById('batchUpdateClose');
        var cancelBtn = document.getElementById('batchUpdateCancel');
        var saveBtn = document.getElementById('batchUpdateSave');
        var modal = document.getElementById('batchUpdateModal');
        if (closeBtn) closeBtn.addEventListener('click', closeBatchModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeBatchModal);
        if (saveBtn) saveBtn.addEventListener('click', applyBatchUpdate);
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeBatchModal(); });

        // Log note detail
        var noteModal = document.getElementById('logNoteModal');
        var noteClose = document.getElementById('logNoteClose');
        var noteDone = document.getElementById('logNoteDone');
        if (noteClose) noteClose.addEventListener('click', closeLogNote);
        if (noteDone) noteDone.addEventListener('click', closeLogNote);
        if (noteModal) noteModal.addEventListener('click', function (e) {
            if (e.target === noteModal) closeLogNote();
        });

        // Delete Confirmation Modal
        var delConfirmModal = document.getElementById('deleteConfirmModal');
        var delCloseBtn = document.getElementById('deleteConfirmClose');
        var delCancelBtn = document.getElementById('deleteConfirmCancel');
        var delYesBtn = document.getElementById('deleteConfirmYes');
        if (delCloseBtn) delCloseBtn.addEventListener('click', closeDeleteConfirm);
        if (delCancelBtn) delCancelBtn.addEventListener('click', closeDeleteConfirm);
        if (delYesBtn) delYesBtn.addEventListener('click', function () {
            closeDeleteConfirm();
            applyBatchUpdate();
        });
        if (delConfirmModal) delConfirmModal.addEventListener('click', function (e) {
            if (e.target === delConfirmModal) closeDeleteConfirm();
        });

        // Fields toggle
        Object.keys(masterGroups).forEach(function (mId) {
            var mCb = document.getElementById(mId);
            if (!mCb) return;
            var slaves = masterGroups[mId];
            mCb.addEventListener('change', function () {
                slaves.forEach(function (id) { var cb = document.getElementById(id); if (cb) cb.checked = mCb.checked; });
                mCb.indeterminate = false;
                updateFieldsVisibility();
            });
            slaves.forEach(function (id) {
                var cb = document.getElementById(id);
                if (!cb) return;
                cb.addEventListener('change', function () {
                    var allOn = slaves.every(function (sid) { return document.getElementById(sid).checked; });
                    var someOn = slaves.some(function (sid) { return document.getElementById(sid).checked; });
                    mCb.checked = allOn;
                    mCb.indeterminate = someOn && !allOn;
                });
            });
        });
        Object.keys(colMap).forEach(function (id) {
            var cb = document.getElementById(id);
            if (cb) cb.addEventListener('change', updateFieldsVisibility);
        });
        updateFieldsVisibility();
        applyReportFilters();

        // Download dropdown
        var dlBtn = document.getElementById('downloadToggleBtn');
        if (dlBtn) {
            dlBtn.addEventListener('click', function () {
                var dd = document.getElementById('downloadDropdown');
                if (dd) dd.classList.toggle('show');
            });
        }
        document.addEventListener('click', function (e) {
            var dd = document.getElementById('downloadDropdown');
            var btn = document.getElementById('downloadToggleBtn');
            if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) dd.classList.remove('show');
        });
    }

    // Today, unless the dataset stops earlier: the bundled dummy data ends on
    // meta.periodEnd, so "today" is held there to keep the demo populated.
    // With the live API, periodEnd is today and this is simply the real date.
    function resolveToday(data) {
        var meta = data.meta || {};
        var first = meta.periodStart || '';
        var last = meta.periodEnd || '';
        if (!first || !last) {
            data.attendance.forEach(function (a) {
                if (!first || a.date < first) first = a.date;
                if (!last || a.date > last) last = a.date;
            });
        }
        dataStart = first;
        var today = toISO(new Date());
        reportToday = last && today > last ? last : today;
    }

    function loadProjectContext(data) {
        var url = new URL(location.href);
        var code = url.searchParams.get('project');
        var employeeCode = url.searchParams.get('employee');
        var employee = employeeCode ? data.findEmployeeByCode(employeeCode) : null;
        if (!code && employee && employee.projects && employee.projects.length) code = employee.projects[0];
        if (!code) {
            try { code = sessionStorage.getItem('feriiz_active_project'); } catch (e) {}
        }
        projectContext = code ? data.findProjectByCode(code) : data.projects[0];
        if (!projectContext) projectContext = data.projects[0];
        if (projectContext && projectContext.code) {
            try { sessionStorage.setItem('feriiz_active_project', projectContext.code); } catch (e) {}
        }
        resolveToday(data);

        reportEmployees = data.employees.filter(function (e) {
            return (e.projects || []).indexOf(projectContext.code) >= 0;
        });
        // Employee report: the same table, narrowed to one person.
        if (employeeCode) {
            reportEmployees = reportEmployees.filter(function (e) { return e.code === employeeCode; });
            var who = employee ? employee.name : employeeCode;
            document.querySelectorAll('[data-report-employee]').forEach(function (el) { el.textContent = who; });
            document.title = 'Feriiz - ' + who + ' - Report';
            if (!reportEmployees.length && window.FeriizNotify) {
                FeriizNotify.warning(who + ' is not assigned to ' + projectContext.name + '.', 'No report to show');
            }
        }
        var reportHref = 'project_report.html?project=' + encodeURIComponent(projectContext.code);
        var reportLink = document.getElementById('reportBackLink');
        if (reportLink) reportLink.href = reportHref;
        // Back: return to wherever the person came from (Activity or the project
        // report); opened directly, fall back to the project report.
        var backBtn = document.getElementById('reportBackBtn');
        if (backBtn) {
            backBtn.href = reportHref;
            backBtn.addEventListener('click', function (e) {
                var fromHere = document.referrer && document.referrer.indexOf(location.origin + '/') === 0;
                if (fromHere && window.history.length > 1) {
                    e.preventDefault();
                    window.history.back();
                }
            });
        }
        // Build attendance index for just this project's dates
        attendanceIndex = {};
        var relevant = new Set(reportEmployees.map(function (e) { return e.code; }));
        for (var i = 0; i < data.attendance.length; i++) {
            var a = data.attendance[i];
            if (relevant.has(a.employeeCode) && a.projectCode === projectContext.code) {
                attendanceIndex[a.employeeCode + '|' + a.date] = a;
                if ((a.inTime || a.outTime) && (!lastActiveByCode[a.employeeCode] || a.date > lastActiveByCode[a.employeeCode])) {
                    lastActiveByCode[a.employeeCode] = a.date;
                }
            }
        }
        var bc = document.querySelector('[data-project-name]');
        if (bc) {
            bc.textContent = projectContext.name;
            if (bc.tagName === 'A') {
                bc.href = 'project_employees.html?project=' + encodeURIComponent(projectContext.code);
            }
        }
        if (projectContext.name && !employeeCode) {
            document.title = 'Feriiz - ' + projectContext.name + ' - Report';
        }
    }

    function startWhenReady() {
        if (window.FERIIZ_DATA && window.FERIIZ_DATA.ready) {
            window.FERIIZ_DATA.ready.then(function (data) {
                loadProjectContext(data);
                init();
            });
        } else {
            init();
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWhenReady);
    else startWhenReady();
})();
