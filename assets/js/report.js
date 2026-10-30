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
    // Accepted requests (sick, leave, remote, permission) keyed the same way.
    var requestIndex = {};
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
        range: null,           // { start, end } chosen in the filter; null = the default week
        original: false        // Show original data: the system's logs instead of an import
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
       Hours are the working hours, at most the Time Period (9h for 08:00-17:00);
       whatever is worked beyond it is overtime (Baldy, 30-10-2026, like the old
       Feriiz: in 08:54, out 18:06 shows 9h / 0.21h). The Time Period is the
       person's own hours, else the project's.
       ============================================= */
    function toSeconds(t) {
        var p = String(t || '').split(':').map(Number);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }

    function periodOf(code) {
        var emp = code && window.FERIIZ_DATA ? window.FERIIZ_DATA.findEmployeeByCode(code) : null;
        var start = toSeconds(((emp && emp.workStart) || (projectContext && projectContext.workStart) || '08:00') + ':00');
        var end = toSeconds(((emp && emp.workEnd) || (projectContext && projectContext.workEnd) || '17:00') + ':00');
        return end > start ? (end - start) / 3600 : 0;
    }

    function computeHours(inTime, outTime, period) {
        if (!inTime || !outTime) return { work: 0, ot: 0 };
        var i = toSeconds(inTime), o = toSeconds(outTime);
        if (o <= i) return { work: 0, ot: 0 };
        var worked = (o - i) / 3600;
        var limit = period == null ? periodOf('') : period;
        return { work: Math.min(worked, limit), ot: Math.max(0, worked - limit) };
    }

    function cellHours(code, date, inTime, outTime) {
        return computeHours(inTime, outTime, periodOf(code));
    }

    function otAdjustFor(code, date) {
        var o = cellOverrides[code + '|' + date];
        return (o && o.otAdjust) || 0;
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
       IMPORTED LOG (Import XLSX > Import Log)
       An import replaces what the Report counts for its days: Daily (1 = paid day,
       0 = not) and Overtime hours, plus the rates in the file (Feriiz team, 27-10-2026).
       A day column with an import is split in two (Baldy, 30-10-2026): the system on
       the left, as always, and the import on the right, shown like a normal day with
       the file's Time Start / Time End as log in / log out and its Overtime. Filter >
       Show original data shows only the system again. Prototype only: kept in this
       browser until the API exists.
       ============================================= */
    var IMPORT_KEY = 'feriiz_report_imports_v1';
    var RATE_LABELS = { daily: 'Daily Rate', ot: 'Rate Overtime', clientDaily: 'Client Daily Rate', clientOt: 'Client Rate Overtime' };
    var importStore = {};
    try { importStore = JSON.parse(localStorage.getItem(IMPORT_KEY) || '{}') || {}; } catch (e) { importStore = {}; }

    // { cells: the day each import shows now, rates, batches: every import in order, with its own numbers }
    function projectImports() {
        var code = projectContext ? projectContext.code : '';
        var p = importStore[code] || (importStore[code] = { cells: {}, rates: {}, batches: [] });
        if (!p.batches) p.batches = batchesFromCells(p.cells);
        return p;
    }

    // Imports kept before 30-10-2026 had no history: each file and time becomes one import.
    function batchesFromCells(cells) {
        var byId = {};
        Object.keys(cells).forEach(function (key) {
            var c = cells[key];
            var id = (c.file || '') + '|' + (c.at || '');
            var b = byId[id] || (byId[id] = { id: 'IMP-' + Object.keys(byId).length, file: c.file || '', at: c.at || '', by: c.by || 'Admin', cells: {} });
            b.cells[key] = { daily: c.daily, ot: c.ot, start: c.start, end: c.end, period: c.period };
        });
        return Object.keys(byId).map(function (id) { return byId[id]; })
            .sort(function (a, b) { return a.at.localeCompare(b.at); });
    }

    // Who is signed in, for the import history.
    function currentAdmin() {
        try {
            var user = JSON.parse(localStorage.getItem('feriiz_user') || '{}');
            return user.name || user.email || 'Admin';
        } catch (e) { return 'Admin'; }
    }

    // The imports that included this day for someone in this report, oldest first.
    function importsOn(date) {
        var inReport = {};
        reportEmployees.forEach(function (e) { inReport[e.code] = true; });
        return projectImports().batches.filter(function (b) {
            return Object.keys(b.cells).some(function (key) {
                var parts = key.split('|');
                return parts[1] === date && inReport[parts[0]];
            });
        });
    }

    function saveImports() {
        try { localStorage.setItem(IMPORT_KEY, JSON.stringify(importStore)); } catch (e) { /* kept for this page only */ }
    }

    function hasImports() {
        var p = projectImports();
        return Object.keys(p.cells).length > 0 || Object.keys(p.rates).length > 0;
    }

    function showImported() { return !appliedReportFilters.original; }

    function storedImport(code, date) { return projectImports().cells[code + '|' + date] || null; }

    // The imported day the Report shows, or null (none, or Show original data is on).
    function importedDay(code, date) { return showImported() ? storedImport(code, date) : null; }


    // What the system says for one day, Add Log and Add Overtime included.
    function systemDay(code, date) {
        var rec = attendanceFor(code, date);
        var override = cellOverrides[code + '|' + date];
        var dayOff = rec ? (rec.status === 'weekend' || rec.status === 'holiday') : isOffDay(date);
        if (dayOff && !(override && (override.inTime || override.outTime))) return { daily: 0, ot: 0 };
        var src = override || rec || {};
        var inTime = src.inTime || '', outTime = src.outTime || '';
        var hours = cellHours(code, date, inTime, outTime);
        var ot = inTime && outTime ? Math.max(0, hours.ot + otAdjustFor(code, date) / 60) : 0;
        return { daily: inTime || outTime ? 1 : 0, ot: Math.round(ot * 100) / 100 };
    }

    // "Daily 1 · OT 1.47h", in the words of the Excel columns.
    function dayText(d) { return 'Daily ' + d.daily + ' · OT ' + formatHour(d.ot); }

    function stampText(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return shortDate(toISO(d)) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    // The rates a row is paid with: the imported ones while they are shown, else the system's.
    function ratesFor(employee, anyView) {
        var r = {
            daily: Number(employee.dailyRate) || 0,
            ot: projectContext ? Number(projectContext.overtimeRate) || 0 : 0,
            clientDaily: Number(employee.clientDailyRate) || 0,
            clientOt: projectContext ? Number(projectContext.clientOvertimeRate) || 0 : 0
        };
        var imp = anyView || showImported() ? projectImports().rates[employee.code] : null;
        if (imp) Object.keys(r).forEach(function (k) { if (imp[k] != null) r[k] = imp[k]; });
        return r;
    }

    // The working day an imported day shows: the file's Time Start / Time End / Period for
    // the person, else their own hours, else the project's (imports from before 30-10-2026
    // kept only Daily and Overtime).
    function importHours(employee, imp) {
        var start = imp.start || ((employee.workStart || (projectContext && projectContext.workStart) || '08:00') + ':00');
        var end = imp.end || ((employee.workEnd || (projectContext && projectContext.workEnd) || '17:00') + ':00');
        var period = imp.period != null ? imp.period : Math.max(0, (toSeconds(end) - toSeconds(start)) / 3600);
        return { start: start, end: end, period: period };
    }

    function dayOffFor(code, date) {
        var rec = attendanceFor(code, date);
        return rec ? (rec.status === 'weekend' || rec.status === 'holiday') : isOffDay(date);
    }

    // An imported day is shown unless it is a day off the file also says nobody worked.
    function showsImport(code, date, imp) {
        return Boolean(imp) && !(dayOffFor(code, date) && !imp.daily && !imp.ot);
    }

    // { 'YYYY-MM-DD': true } for the days on screen that are split into System | Import.
    var splitDates = {};

    function computeSplitDates(dates) {
        splitDates = {};
        if (!showImported()) return;
        var cells = projectImports().cells;
        var inReport = {};
        reportEmployees.forEach(function (e) { inReport[e.code] = true; });
        Object.keys(cells).forEach(function (key) {
            var parts = key.split('|');
            if (inReport[parts[0]] && dates.indexOf(parts[1]) >= 0 && showsImport(parts[0], parts[1], cells[key])) splitDates[parts[1]] = true;
        });
    }

    // The right half of a split day: the file's numbers shown like a normal day, and
    // "Changed" when they differ from the system on the left.
    function importHalfHTML(employee, date, imp) {
        var hours = importHours(employee, imp);
        var work = imp.daily ? hours.period : 0;
        var changed = differs(systemDay(employee.code, date), imp);
        var title = 'Imported from ' + imp.file + ' on ' + stampText(imp.at) + '.';
        return '<div class="day-half day-half--import" title="' + escapeHTML(title) + '">' +
            '<div class="feriiz-u-133"><div class="feriiz-u-134">' +
                '<span class="badge feriiz-u-135">' + formatHour(work) + '</span>' +
                '<span class="badge feriiz-u-136">' + formatHour(imp.ot) + ' OT</span>' +
            '</div>' + (changed ? '<span class="cell-import-changed">Changed</span>' : '') + '</div>' +
            '<div class="feriiz-u-140">' +
                (imp.daily ? buildClockLine('in', hours.start) + buildClockLine('out', hours.end)
                    : '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>' +
                      '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>') +
            '</div></div>';
    }

    /* Import history of one day (the clock button in its header, from the second import on).
       Every import of that day side by side, oldest first: log in, log out, hours and
       overtime per person, plus who imported it and when. The newest is what the day shows. */
    var historyModal = null;

    function sameImport(a, b) {
        if (!a || !b) return a === b;
        return a.daily === b.daily && Math.abs((a.ot || 0) - (b.ot || 0)) < 0.01 &&
            (a.start || '') === (b.start || '') && (a.end || '') === (b.end || '') && (a.period || 0) === (b.period || 0);
    }

    function historyValueHTML(employee, value, changed) {
        if (!value) return '<span class="import-history-none">–</span>';
        var hours = importHours(employee, value);
        return '<div class="import-history-value' + (changed ? ' is-changed' : '') + '">' +
            (value.daily ? hours.start.slice(0, 5) + ' – ' + hours.end.slice(0, 5) : 'Not worked') +
            '<small>' + formatHour(value.daily ? hours.period : 0) + ' · ' + formatHour(value.ot) + ' OT</small></div>';
    }

    function buildHistoryModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'importHistoryModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'importHistoryTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="importHistoryTitle">Import history</h2>' +
                            '<p class="tpl-subtitle" id="importHistoryContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<ol class="import-history-versions" id="importHistoryVersions"></ol>' +
                        '<div class="tpl-people-head">' +
                            '<span class="tpl-people-label" id="importHistoryCount"></span>' +
                            '<div class="tpl-people-tools">' +
                                '<input type="search" class="form-control form-control-sm" id="importHistorySearch" placeholder="Search name or code" aria-label="Search people">' +
                            '</div>' +
                        '</div>' +
                        '<div class="import-history-wrap"><table class="data-table import-history-table">' +
                            '<thead id="importHistoryHead"></thead><tbody id="importHistoryRows"></tbody>' +
                        '</table></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Close</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#importHistorySearch').addEventListener('input', function (e) {
            var q = e.target.value.trim().toLowerCase();
            el.querySelectorAll('#importHistoryRows tr').forEach(function (tr) {
                tr.hidden = Boolean(q) && tr.dataset.search.indexOf(q) < 0;
            });
        });
        return el;
    }

    function openImportHistory(date) {
        var batches = importsOn(date);
        if (batches.length < 2) return;
        if (!historyModal) historyModal = buildHistoryModal();
        var last = batches.length - 1;
        historyModal.querySelector('#importHistoryContext').textContent = projectContext.name + ' · ' +
            DAY_NAMES[fromISO(date).getDay()] + ', ' + shortDate(date) + ' · ' + batches.length + ' imports';
        // Newest first: who imported which file, and when.
        historyModal.querySelector('#importHistoryVersions').innerHTML = batches.map(function (b, i) {
            return '<li' + (i === last ? ' class="is-current"' : '') + '>' +
                '<span class="import-history-no">#' + (i + 1) + '</span>' +
                '<span>' + escapeHTML(stampText(b.at)) + ' · by ' + escapeHTML(b.by || 'Admin') + '</span>' +
                '<span class="import-history-file">' + escapeHTML(b.file) + '</span>' +
                (i === last ? '<span class="import-history-now">Shown now</span>' : '') +
            '</li>';
        }).reverse().join('');
        historyModal.querySelector('#importHistoryHead').innerHTML = '<tr><th>Name</th>' + batches.map(function (b, i) {
            return '<th' + (i === last ? ' class="is-current"' : '') + '>#' + (i + 1) + (i === last ? ' · now' : '') +
                '<small>' + escapeHTML(stampText(b.at)) + '</small></th>';
        }).join('') + '</tr>';
        // People whose numbers changed between imports come first.
        var rows = reportEmployees.map(function (e) {
            var values = batches.map(function (b) { return b.cells[e.code + '|' + date] || null; });
            if (!values.some(Boolean)) return null;
            var changed = values.some(function (v, i) { return i > 0 && !sameImport(v, values[i - 1]); });
            return { e: e, values: values, changed: changed };
        }).filter(Boolean).sort(function (a, b) {
            return (b.changed - a.changed) || a.e.name.localeCompare(b.e.name);
        });
        var changedCount = rows.filter(function (r) { return r.changed; }).length;
        historyModal.querySelector('#importHistoryCount').textContent = changedCount + ' of ' + rows.length + ' people changed between imports';
        historyModal.querySelector('#importHistoryRows').innerHTML = rows.map(function (r) {
            return '<tr data-search="' + escapeHTML((r.e.name + ' ' + r.e.code).toLowerCase()) + '"' + (r.changed ? ' class="is-changed"' : '') + '>' +
                '<td><div class="import-history-name">' + escapeHTML(r.e.name) + '</div><small>' + escapeHTML(r.e.code) +
                    (r.e.occupation ? ' · ' + escapeHTML(r.e.occupation) : '') + '</small></td>' +
                r.values.map(function (v, i) { return '<td>' + historyValueHTML(r.e, v, i > 0 && !sameImport(v, r.values[i - 1])) + '</td>'; }).join('') +
            '</tr>';
        }).join('');
        historyModal.querySelector('#importHistorySearch').value = '';
        window.bootstrap.Modal.getOrCreateInstance(historyModal).show();
    }

    // A day from an import: the totals count the file's numbers, the cell shows both sides.
    function importedCellHTML(employee, date, imp, sys, checkbox) {
        var work = imp.daily ? importHours(employee, imp).period : 0;
        return '<td class="day-col feriiz-u-132 imported-cell day-split-cell" data-date="' + date + '" data-imported="1" data-daily="' + imp.daily + '"' +
            ' data-in-time="" data-out-time="" data-in-note="" data-out-note=""' +
            ' data-work="' + work.toFixed(4) + '" data-ot="' + imp.ot.toFixed(4) + '" data-ot-adjust="0" data-ot-total="' + imp.ot.toFixed(4) + '">' +
            checkbox + '<div class="day-split">' + systemHalfHTML(sys) + importHalfHTML(employee, date, imp) + '</div></td>';
    }

    function differs(a, b) { return a.daily !== b.daily || Math.abs(a.ot - b.ot) >= 0.01; }

    // In original view a day the import changed gets a small tag with the imported numbers
    // (days it left the same get none, so the tags show what the import changed).
    function importNote(code, date) {
        if (showImported()) return '';
        var imp = storedImport(code, date);
        return imp && differs(imp, systemDay(code, date)) ? 'Imported: ' + dayText(imp) : '';
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
        var complete = Boolean(inTime && outTime);
        var otTotal = complete ? Math.max(0, hours.ot + adjust / 60) : 0;
        var totalBadge = '<span class="badge feriiz-u-135">' + formatHour(complete ? hours.work : 0) + '</span>' +
            '<span class="badge feriiz-u-136">' + formatHour(otTotal) + ' OT</span>';

        var renderedLines = Array.isArray(clockLines) ? clockLines : null;

        var html = '';
        if (totalBadge) {
            var updateBadge = isUpdated
                ? '<span class="cell-updated-badge"><i class="fa-solid fa-check"></i>Updated</span>'
                : '';
            var importTag = opts && opts.importNote
                ? '<span class="cell-import-tag" title="' + escapeHTML(opts.importNote) + '"><i class="fa-solid fa-file-import" aria-hidden="true"></i>Import</span>'
                : '';
            html += '<div class="feriiz-u-133"><div class="feriiz-u-134">' + totalBadge + '</div>' + (updateBadge || importTag) + '</div>';
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

    function requestFor(code, date) { return requestIndex[code + '|' + date] || null; }

    // Same categories and colours as the Calendar.
    function requestCategory(type) {
        var t = String(type || '').toLowerCase();
        if (t.indexOf('sick') >= 0) return 'sick';
        if (t.indexOf('remote') >= 0) return 'work';
        if (t.indexOf('leave') >= 0 || t.indexOf('permission') >= 0) return 'leave';
        return 'other';
    }

    // A day without logs covered by an accepted request shows the request instead of
    // "log incomplete" (backlog A1, 28-10-2026). It is not a missing log, so the Log In /
    // Log Out filter skips it, and it still counts as no day worked.
    function requestChipHTML(req) {
        var title = req.type + ' (' + req.id + '), accepted' + (req.reason ? ': ' + req.reason : '');
        return '<div class="feriiz-u-133"><div class="feriiz-u-134">' +
            '<span class="badge cell-request-chip cat-' + requestCategory(req.type) + '-bg" title="' + escapeHTML(title) + '">' + escapeHTML(req.type) + '</span>' +
        '</div></div>';
    }

    var EMPTY_LOG_ATTRS = ' data-in-time="" data-out-time="" data-in-note="" data-out-note=""';

    /* Request chips: what a day was given with Assign Request (Uang Makan...), as the
       template's initials in the row of hour badges, so the day keeps its height
       (Baldy 29-10-2026: "keliatan di daily, jangan terlalu besar"). A chip opens
       everyone who has that request. Print leaves them out. */
    var requestDayIndex = {};   // FeriizTemplates.dayIndex for the days on screen

    function requestDayChips(code, date) {
        var items = requestDayIndex[code + '|' + date];
        if (!items || !items.length) return '';
        return items.map(function (it) {
            var tip = it.name + ' · ' + formatIDR(it.amount) + (it.note ? ' · ' + it.note : '') + '. Click to see who has it.';
            return '<button type="button" class="req-chip" data-template="' + escapeHTML(it.templateId) + '" title="' + escapeHTML(tip) + '"' +
                ' aria-label="' + escapeHTML(it.name + ', ' + formatIDR(it.amount)) + '">' + escapeHTML(it.short) + '</button>';
        }).join('');
    }

    // The chips go at the end of the badge row; a day without badges (a day off) gets a row for them.
    function withRequestChips(content, code, date) {
        var chips = requestDayChips(code, date);
        if (!chips) return content;
        var group = '<div class="feriiz-u-134">';
        var start = content.indexOf(group);
        if (start < 0) return '<div class="feriiz-u-133">' + group + chips + '</div></div>' + content;
        var end = content.indexOf('</div>', start + group.length);
        return content.slice(0, end) + chips + content.slice(end);
    }

    // What the system shows for one day: the cell's class and data, and what goes inside.
    // noteAttrs lets the left half of a split day open its own log notes.
    function systemCell(employee, date) {
        var override = cellOverrides[employee.code + '|' + date];
        if (dayOffFor(employee.code, date) && !(override && (override.inTime || override.outTime))) {
            return { cls: 'weekend-off-cell', attrs: EMPTY_LOG_ATTRS, content: withRequestChips('', employee.code, date), off: true };
        }
        var src = override || attendanceFor(employee.code, date) || {};
        var inTime = src.inTime || '';
        var outTime = src.outTime || '';
        var request = !inTime && !outTime ? requestFor(employee.code, date) : null;
        if (request) {
            return { cls: 'request-day-cell', content: withRequestChips(requestChipHTML(request), employee.code, date),
                     attrs: ' data-request="' + escapeHTML(request.type) + '"' + EMPTY_LOG_ATTRS + ' data-work="0" data-ot="0" data-ot-adjust="0" data-ot-total="0"' };
        }
        var inNote = src.inNote || '';
        var outNote = src.outNote || '';
        var issue = getMissingType(inTime, outTime);
        var hours = cellHours(employee.code, date, inTime, outTime);
        var adjust = otAdjustFor(employee.code, date);
        var otTotal = inTime && outTime ? Math.max(0, hours.ot + adjust / 60) : 0;
        var logAttrs = ' data-in-time="' + escapeHTML(inTime) + '" data-out-time="' + escapeHTML(outTime) + '" data-in-note="' + escapeHTML(inNote) + '" data-out-note="' + escapeHTML(outNote) + '"';
        return {
            cls: issue ? 'no-log-cell' : '',
            attrs: (issue ? ' data-missing="' + issue + '"' : '') + logAttrs +
                ' data-work="' + hours.work.toFixed(4) + '" data-ot="' + hours.ot.toFixed(4) + '" data-ot-adjust="' + adjust + '" data-ot-total="' + otTotal.toFixed(4) + '"',
            noteAttrs: ' data-date="' + date + '"' + logAttrs,
            content: withRequestChips(buildDayCellContent({ inTime: inTime, outTime: outTime, inNote: inNote, outNote: outNote, issue: issue, hours: hours, otAdjust: adjust, importNote: importNote(employee.code, date) }), employee.code, date)
        };
    }

    // The left half of a split day: the system as it always looks, yellow when a log is missing.
    // A day off keeps its request chips (a red-date incentive).
    function systemHalfHTML(sys) {
        if (sys.off) return '<div class="day-half day-half--system is-empty">' + (sys.content || '') + '<span class="day-half-empty">Day off</span></div>';
        return '<div class="day-half day-half--system' + (sys.cls === 'no-log-cell' ? ' is-incomplete' : '') + '"' + (sys.noteAttrs || '') + '>' + sys.content + '</div>';
    }

    var NO_IMPORT_HALF = '<div class="day-half day-half--import is-empty"><span class="day-half-empty">Not in the import</span></div>';

    // After Add Log, Delete Log or Add Overtime: the day keeps its request chips, and a day
    // in a System | Import column keeps its two halves.
    function setCellContent(cell, content) {
        var checkbox = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';
        content = withRequestChips(content, cell.closest('tr').dataset.employeeCode, cell.dataset.date);
        if (!cell.classList.contains('day-split-cell') || cell.classList.contains('weekend-off-cell')) {
            cell.innerHTML = checkbox + content;
            return;
        }
        var d = cell.dataset;
        var noteAttrs = ' data-date="' + d.date + '" data-in-time="' + escapeHTML(d.inTime || '') + '" data-out-time="' + escapeHTML(d.outTime || '') + '"' +
            ' data-in-note="' + escapeHTML(d.inNote || '') + '" data-out-note="' + escapeHTML(d.outNote || '') + '"';
        cell.innerHTML = checkbox + '<div class="day-split">' +
            systemHalfHTML({ cls: cell.classList.contains('no-log-cell') ? 'no-log-cell' : '', noteAttrs: noteAttrs, content: content }) +
            NO_IMPORT_HALF + '</div>';
    }

    function createDayCells(employee, dates) {
        return dates.map(function (date) {
            var checkbox = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';
            var sys = systemCell(employee, date);
            var imported = importedDay(employee.code, date);
            if (showsImport(employee.code, date, imported)) return importedCellHTML(employee, date, imported, sys, checkbox);
            // A day of a split column without an import for this person: the system, and an empty right half.
            var split = splitDates[date] && !sys.off;
            return '<td class="day-col feriiz-u-132' + (sys.cls ? ' ' + sys.cls : '') + (split ? ' day-split-cell' : '') + '" data-date="' + date + '"' + sys.attrs + '>' +
                checkbox + (split ? '<div class="day-split">' + systemHalfHTML(sys) + NO_IMPORT_HALF + '</div>' : sys.content) + '</td>';
        }).join('');
    }

    /* =============================================
       TRANSPORT (Arcon MoM 20-10-2026, built 28-10-2026)
       Every day someone worked pays the Transport / Day from their employee data,
       without anyone assigning it: a day with a log, or an imported Daily 1. Who gets
       transport is decided per person, not per day: someone who lives on the site has
       no Transport / Day (Arcon's note on the timeline, 28-10-2026), and the per-day
       skip in Batch Update was removed (Baldy, 30-10-2026). It is the first of the
       Client group's additional columns and counts in Total Additional; like every
       summary column it shows only the total.
       ============================================= */
    var TRANSPORT_COL = 'transport';

    function transportRateOf(employee) {
        return employee && window.FERIIZ_DATA && window.FERIIZ_DATA.transportOf ? window.FERIIZ_DATA.transportOf(employee) : 0;
    }

    // A worked day, by the same rule as Total Days.
    function workedCell(cell) {
        if (cell.classList.contains('weekend-off-cell')) return false;
        if (cell.dataset.imported) return Number(cell.dataset.daily) > 0;
        return Boolean(cell.dataset.inTime || cell.dataset.outTime);
    }

    // The Transport cell and Total Additional of one row, from its worked days.
    function paintTransport(row, rate, days) {
        var total = rate * days;
        var cell = row.querySelector('td.col-cli-add[data-template="' + TRANSPORT_COL + '"]');
        // Empty when there is nothing to pay, so print leaves it blank too.
        if (cell) cell.textContent = total ? formatIDR(total) : '';
        var sum = row.querySelector('td.col-cli-addtotal');
        if (sum) {
            var all = (Number(sum.dataset.requests) || 0) + total;
            sum.textContent = all ? formatIDR(all) : '';
        }
    }

    // Additional columns at the end of the Client group: Transport first (when anyone here has
    // a Transport / Day), then one column per request template given on the visible days,
    // shown only when someone here has it (whiteboard 20-10-2026). With two or more,
    // "Total Additional" adds them up (meeting 1:59, 2:01). They show only totals and
    // cannot be clicked: requests are opened and removed from the chips in the days
    // (Baldy, 29-10-2026: "di tabel ya total nya aja").
    var addColumns = [];

    function computeAddColumns(dates) {
        var templates = window.FeriizTemplates && projectContext
            ? window.FeriizTemplates.usedIn(projectContext.code, reportEmployees.map(function (e) { return e.code; }), dates) : [];
        var transport = reportEmployees.some(function (e) { return transportRateOf(e) > 0; });
        addColumns = (transport ? [{ id: TRANSPORT_COL, name: 'Transport' }] : []).concat(templates);
    }

    function hasAddTotal() { return addColumns.length > 1; }

    function addColumnCells(employeeCode, dates) {
        if (!addColumns.length) return '';
        var add = window.FeriizTemplates ? window.FeriizTemplates.additionalFor(employeeCode, projectContext.code, dates) : { total: 0, items: [] };
        var byId = {};
        add.items.forEach(function (it) { byId[it.templateId] = it; });
        var cells = addColumns.map(function (col) {
            var it = byId[col.id];
            var attrs = ' class="col-cli-add rate-cell" data-template="' + escapeHTML(col.id) + '"';
            // Transport is painted by updateVisibleTotals, from the days on screen.
            if (col.id === TRANSPORT_COL) return '<td' + attrs + '></td>';
            return '<td' + attrs + '>' + (it ? formatIDR(it.amount) : '') + '</td>';
        }).join('');
        // Total Additional = these requests + Transport, which updateVisibleTotals adds.
        if (hasAddTotal()) cells += '<td class="col-cli-addtotal rate-cell" data-requests="' + add.total + '">' + (add.total ? formatIDR(add.total) : '') + '</td>';
        return cells;
    }

    // Header cells for the template columns (and Total Additional), with a checkbox each in the column list.
    function renderAddColumnHeaders() {
        document.querySelectorAll('.report-table thead th.col-cli-add, .report-table thead th.col-cli-addtotal').forEach(function (th) { th.remove(); });
        var anchor = document.querySelector('.report-table thead th.col-cli-totalovertime');
        if (anchor) {
            anchor.insertAdjacentHTML('afterend', addColumns.map(function (col) {
                return '<th class="col-cli-add" data-template="' + escapeHTML(col.id) + '">' + escapeHTML(col.name) + '</th>';
            }).join('') + (hasAddTotal() ? '<th class="col-cli-addtotal">Total Additional</th>' : ''));
        }
        var list = document.getElementById('colClientAdditional');
        if (!list) return;
        var wasOn = {};
        list.querySelectorAll('input').forEach(function (cb) { wasOn[cb.id] = cb.checked; });
        Object.keys(colMap).forEach(function (id) { if (id.indexOf('colCliAdd') === 0) delete colMap[id]; });
        var slaves = masterGroups.colClient;
        for (var i = slaves.length - 1; i >= 0; i--) {
            if (slaves[i].indexOf('colCliAdd') === 0) slaves.splice(i, 1);
        }
        var items = addColumns.map(function (col) {
            return { id: 'colCliAdd-' + col.id, label: col.name, cols: ['.col-cli-add[data-template="' + col.id + '"]'], request: col.id !== TRANSPORT_COL };
        });
        if (hasAddTotal()) items.push({ id: 'colCliAddTotal', label: 'Total Additional', cols: ['.col-cli-addtotal'], request: true });
        // New columns start visible, so an assignment shows right away. Transport sits
        // above the "Requests" sub-heading: it is not a request.
        var headed = false;
        list.innerHTML = items.map(function (it) {
            colMap[it.id] = it.cols;
            slaves.push(it.id);
            var heading = it.request && !headed ? '<div class="col-picker-sub">Requests</div>' : '';
            if (it.request) headed = true;
            return heading + '<div class="feriiz-u-119">' +
                '<input type="checkbox" id="' + escapeHTML(it.id) + '" class="feriiz-u-120"' + (wasOn[it.id] === false ? '' : ' checked') + '>' +
                '<label for="' + escapeHTML(it.id) + '" class="feriiz-u-121">' + escapeHTML(it.label) + '</label>' +
            '</div>';
        }).join('');
        list.querySelectorAll('input').forEach(function (cb) {
            cb.addEventListener('change', function () {
                syncMasterState('colClient');
                updateFieldsVisibility();
            });
        });
        syncMasterState('colClient');
    }

    // After an Assign or a Remove: the request columns and the day chips both change.
    function refreshRequests() {
        showDays(currentVisibleDates.slice(), true);
        applyReportFilters();
    }

    // Did the person come in that day: a log, or an imported Daily 1 while imports are shown.
    // Assign Request gives Daily templates only on these days.
    function workedOn(code, date) {
        var imported = importedDay(code, date);
        return imported ? imported.daily > 0 : systemDay(code, date).daily > 0;
    }

    // Everyone who has one request on the days shown; focusCode = the row whose day chip was clicked.
    function openRequestList(templateId, focusCode) {
        if (!window.FeriizTemplates || !projectContext) return;
        window.FeriizTemplates.openDetail({
            project: { code: projectContext.code, name: projectContext.name },
            templateId: templateId,
            dates: currentVisibleDates.slice(),
            people: reportEmployees.map(function (e) { return { code: e.code, name: e.name, occupation: e.occupation }; }),
            focusCode: focusCode || '',
            onDone: refreshRequests
        });
    }

    // Assign Request from the toolbar: pick people and days in the dialog.
    function openTemplateAssign() {
        if (!window.FeriizTemplates || !projectContext) return;
        window.FeriizTemplates.openAssign({
            workedOn: workedOn,
            project: { code: projectContext.code, name: projectContext.name },
            people: reportEmployees.map(function (e) {
                return { code: e.code, name: e.name, occupation: e.occupation, lastActive: lastActiveByCode[e.code] || '' };
            }),
            dates: currentVisibleDates.slice(),
            today: reportToday,
            onDone: refreshRequests
        });
    }

    function createEmployeeRow(employee, dates) {
        var rates = ratesFor(employee);
        return '<tr data-employee-code="' + escapeHTML(employee.code) + '" data-employee-name="' + escapeHTML(employee.name) + '"' +
            ' data-daily-rate="' + rates.daily + '" data-client-daily-rate="' + rates.clientDaily + '"' +
            ' data-ot-rate="' + rates.ot + '" data-client-ot-rate="' + rates.clientOt + '"' +
            ' data-transport-rate="' + transportRateOf(employee) + '">' +
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
            '<td class="col-emp-dailyrate rate-cell">' + formatIDR(rates.daily) + '</td>' +
            '<td class="col-emp-rateovertime rate-cell">' + formatIDR(rates.ot) + '</td>' +
            '<td class="col-emp-totalrate rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-emp-totalovertime rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-cli-dailyrate rate-cell">' + formatIDR(rates.clientDaily) + '</td>' +
            '<td class="col-cli-rateovertime rate-cell">' + formatIDR(rates.clientOt) + '</td>' +
            '<td class="col-cli-totalrate rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-cli-totalovertime rate-cell">' + formatIDR(0) + '</td>' +
            addColumnCells(employee.code, dates) +
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

        // A day with an import gets "System | Import" over its two halves. From its second
        // import on, a clock button right after the date opens the history: it belongs to
        // the day, and stays away from the column's checkbox (Baldy, 30-10-2026).
        dates.forEach(function (date) {
            var th = document.createElement('th');
            var split = splitDates[date];
            var label = DAY_NAMES[fromISO(date).getDay()] + ' ' + fromISO(date).getDate();
            var imports = split ? importsOn(date).length : 0;
            var history = imports > 1
                ? '<button type="button" class="import-history-btn" data-date="' + date + '" title="Imported ' + imports + ' times. Click for the history."' +
                    ' aria-label="Import history of ' + label + ', ' + imports + ' imports"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>' + imports + '</button>'
                : '';
            th.className = 'day-col feriiz-u-130' + (split ? ' day-split-col' : '');
            th.dataset.date = date;
            th.innerHTML = (split ? '<div class="day-split-top"><span>' + label + '</span>' + history + '</div>' : '<span>' + label + '</span>') +
                '<input type="checkbox" class="day-header-select" data-date="' + date + '" aria-label="Select every log on ' + date + '">' +
                (split ? '<div class="day-split-labels"><b>System</b><b><i class="fa-solid fa-file-import" aria-hidden="true"></i>Import</b></div>' : '');
            dayRow.appendChild(th);
        });
    }

    function renderTable(dates) {
        var tbody = document.getElementById('reportTableBody');
        if (!tbody) return;
        computeSplitDates(dates);
        requestDayIndex = window.FeriizTemplates && projectContext ? window.FeriizTemplates.dayIndex(projectContext.code, dates) : {};
        renderDayHeaders(dates);
        computeAddColumns(dates);
        renderAddColumnHeaders();
        tbody.innerHTML = reportEmployees.map(function (emp) {
            return createEmployeeRow(emp, dates);
        }).join('');
    }

    /* =============================================
       DAY COLUMNS
       ============================================= */
    var currentVisibleDates = [];

    // Re-render only when the set of days actually changes (or the data shown does,
    // force); selection is reset.
    function showDays(datesToShow, force) {
        var same = datesToShow.length === currentVisibleDates.length &&
            datesToShow.every(function (d, i) { return d === currentVisibleDates[i]; });
        currentVisibleDates = datesToShow.slice();
        if (force || !same || !document.querySelector('#reportTableBody tr')) {
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

    // An imported day counts its Daily (1 or 0) instead of "has a log". Transport is paid
    // on the same days.
    function updateVisibleTotals(datesToShow) {
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            var otRate = Number(row.dataset.otRate) || 0;
            var clientOtRate = Number(row.dataset.clientOtRate) || 0;
            var transportRate = Number(row.dataset.transportRate) || 0;
            var days = 0, totalWork = 0, totalOT = 0, paid = 0;
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (datesToShow.indexOf(cell.dataset.date) < 0 || cell.classList.contains('weekend-off-cell')) return;
                if (cell.dataset.imported) days += Number(cell.dataset.daily) || 0;
                else if (cell.dataset.inTime || cell.dataset.outTime) days++;
                if (transportRate && workedCell(cell)) paid++;
                totalWork += Number(cell.dataset.work) || 0;
                totalOT += Number(cell.dataset.otTotal) || 0;
            });
            paintTransport(row, transportRate, paid);
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

    // Exact match: "Surveyor" must not also pick "Quantity Surveyor".
    function rowMatchesOccupation(row) {
        var sel = appliedReportFilters.occupations;
        if (sel.length === 0) return true;
        var occ = ((row.querySelector('.emp-occupation-cell') || {}).textContent || '').trim().toLowerCase();
        return sel.indexOf(occ) >= 0;
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
        if (appliedReportFilters.original) {
            html += '<span class="filter-indicator-chip">Original data' +
                '<button class="filter-chip-close" data-filter-type="original" aria-label="Show the imported data again">&times;</button></span>';
        }
        bar.style.display = '';
        chips.innerHTML = html;

        chips.querySelectorAll('.filter-chip-close').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.filterType;
                if (type === 'original') {
                    appliedReportFilters.original = false;
                    var originalBox = document.getElementById('filterOriginal');
                    if (originalBox) originalBox.checked = false;
                    showDays(currentVisibleDates.slice(), true);
                } else if (type === 'occupation') {
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
        // Starts at the project's working hours (meeting 1:28); the admin can still change it.
        var start = ((projectContext && projectContext.workStart) || '08:00') + ':00';
        var end = ((projectContext && projectContext.workEnd) || '17:00') + ':00';
        if (input) input.value = type === 'in' ? start : end;
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

        // An imported day shows the file's numbers; its system logs are changed in original view.
        if (showImported()) {
            var imported = selected.filter(function (cell) { return cell.dataset.imported === '1'; });
            if (imported.length) {
                imported.forEach(function (cell) {
                    var cb = cell.querySelector('.day-cell-select');
                    if (cb) cb.checked = false;
                });
                updateCellSelectionUI();
                selected = getSelectedCells();
                if (!selected.length) {
                    if (window.FeriizNotify) FeriizNotify.warning('These days come from an import. To change their system logs, turn on Filter > Show original data.', 'Imported days');
                    return;
                }
                if (window.FeriizNotify) FeriizNotify.info(imported.length + (imported.length === 1 ? ' imported day was' : ' imported days were') +
                    ' left out. Only days with system logs are changed.', 'Imported days skipped');
            }
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
                    cell.classList.remove('weekend-off-cell', 'request-day-cell');
                    cell.removeAttribute('data-request');
                }

                cell.classList.add('recently-updated-cell');
                cell.classList.remove('cell-selected');

                var addCode = cell.closest('tr').dataset.employeeCode;
                var addHours = cellHours(addCode, cell.dataset.date, newIn, newOut);
                var addAdjust = otAdjustFor(addCode, cell.dataset.date);
                setCellHours(cell, addHours, addAdjust);
                setCellContent(cell, buildDayCellContent({ inTime: newIn, outTime: newOut, inNote: newInNote, outNote: newOutNote, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true, hours: addHours, otAdjust: addAdjust }));
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

                // An emptied day off goes back to grey, an emptied day with an accepted request
                // shows the request again, and an emptied work day is missing both logs.
                var backToDayOff = !existIn && !existOut && isOffCell(cell.closest('tr').dataset.employeeCode, date);
                var backToRequest = !existIn && !existOut && !backToDayOff ? requestFor(cell.closest('tr').dataset.employeeCode, date) : null;
                var issue = backToDayOff || backToRequest ? '' : getMissingType(existIn, existOut);
                if (issue) {
                    cell.dataset.missing = issue;
                    cell.classList.add('no-log-cell');
                } else {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                    if (backToDayOff) cell.classList.add('weekend-off-cell');
                    if (backToRequest) {
                        cell.classList.add('request-day-cell');
                        cell.dataset.request = backToRequest.type;
                    }
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
                    setCellContent(cell, '');
                } else if (backToRequest) {
                    setCellContent(cell, requestChipHTML(backToRequest));
                } else {
                    setCellContent(cell, buildDayCellContent({ inTime: existIn, outTime: existOut, inNote: existInNote, outNote: existOutNote, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true, hours: delHours, otAdjust: delAdjust }));
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
        grpClient: ['.col-cli-dailyrate', '.col-cli-rateovertime', '.col-cli-totalrate', '.col-cli-totalovertime', '.col-cli-add', '.col-cli-addtotal']
    };

    // Ticked, unticked or partly ticked, from the columns under it.
    function syncMasterState(mId) {
        var mCb = document.getElementById(mId);
        if (!mCb) return;
        var slaves = masterGroups[mId].map(function (id) { return document.getElementById(id); }).filter(Boolean);
        var on = slaves.filter(function (cb) { return cb.checked; }).length;
        mCb.checked = slaves.length > 0 && on === slaves.length;
        mCb.indeterminate = on > 0 && on < slaves.length;
    }

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
       One menu with the two steps of the live Feriiz:
       - Download Log: the period as an Excel to fill in, one row per person with
         Daily (1 or 0) and Overtime (hours) under every date, then the rates.
       - Import Log: upload that file. Its numbers replace what the Report counts
         for those days (Feriiz team, 27-10-2026); each of those days shows the
         system on the left and the import on the right (Baldy, 30-10-2026). The
         preview shows what changes before anything is replaced.
       The Excel library (SheetJS) loads the first time it is needed.
       ============================================= */
    var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    var IMPORT_TYPES = ['.xlsx', '.xls'];
    var IMPORT_MAX = 5 * 1024 * 1024;
    var IMPORT_LIST_MAX = 200;   // rows listed in the preview; the counts cover everything
    var xlsxLoading = null;
    var importModal = null;
    var importPlan = null;

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

    function importSize(bytes) {
        return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

    // 2026-10-26 -> "26/10/2026", the date titles of the live Feriiz file.
    function slashDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

    // "261026_261027_MENARA-KUNINGAN-PHASE-2_FOR_IMPORT.xlsx", named like the live Feriiz file.
    function logFileName(dates) {
        function yymmdd(iso) { return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10); }
        var name = String((projectContext && projectContext.name) || 'Report').toUpperCase().trim()
            .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
        return yymmdd(dates[0]) + '_' + yymmdd(dates[dates.length - 1]) + '_' + name + '_FOR_IMPORT.xlsx';
    }

    // The same file as the old Feriiz export (checked cell by cell against its
    // 261026_261029 file, 29-10-2026): one plain "Sheet1" with no widths or styles, every
    // person in the project (search and filters do not matter) sorted by first name,
    // empty cells left empty. The days hold what the table shows now (imported days
    // included), so the file imports back unchanged.
    function downloadLog() {
        var dates = currentVisibleDates.slice();
        var rows = Array.prototype.slice.call(document.querySelectorAll('.report-table tbody tr[data-employee-code]'));
        if (!dates.length || !rows.length) {
            if (window.FeriizNotify) FeriizNotify.warning('This project has nobody in the Report for these days.', 'Nothing to download');
            return;
        }
        loadXLSX().then(function (XLSX) {
            var byCode = {};
            reportEmployees.forEach(function (e) { byCode[e.code] = e; });
            var people = rows.map(function (row) {
                var emp = byCode[row.dataset.employeeCode] || {};
                var first = emp.firstName || String(emp.name || row.dataset.employeeName || '').trim().split(/\s+/)[0];
                return { row: row, emp: emp, first: first };
            }).sort(function (a, b) {
                return a.first.localeCompare(b.first, undefined, { sensitivity: 'base' }) ||
                    String(a.emp.name || '').localeCompare(String(b.emp.name || ''), undefined, { sensitivity: 'base' });
            });
            var head = ['No', 'Code', 'Pin', 'First Name', 'Occupation', 'Time Start', 'Time End', 'Period'];
            var sub = [null, null, null, null, null, null, null, null];
            dates.forEach(function (d) { head.push(slashDate(d), slashDate(d)); sub.push('Daily', 'Overtime'); });
            // Titles exactly as in the old Feriiz file ("Employe" included), so the two files match.
            head.push('Employee', 'Employe Overtime', 'Client', 'Client Overtime');
            sub.push('Rate Daily', 'Rate Overtime', 'Rate Daily', 'Rate Overtime');
            var aoa = [head, sub];
            people.forEach(function (p, i) {
                var emp = p.emp;
                var row = p.row;
                // A person's own working hours (employee form), else the project's.
                var start = (emp.workStart || (projectContext && projectContext.workStart) || '08:00') + ':00';
                var end = (emp.workEnd || (projectContext && projectContext.workEnd) || '17:00') + ':00';
                var hours = Math.max(0, toSeconds(end) - toSeconds(start)) / 3600;
                var line = [i + 1, row.dataset.employeeCode, emp.pin ? String(emp.pin) : null, p.first,
                            emp.occupation || null, start, end, round2(hours)];
                dates.forEach(function (d) {
                    var cell = row.querySelector('td.day-col[data-date="' + d + '"]');
                    var daily = 0;
                    if (cell && cell.dataset.imported) daily = Number(cell.dataset.daily) || 0;
                    else if (cell && !cell.classList.contains('weekend-off-cell') && (cell.dataset.inTime || cell.dataset.outTime)) daily = 1;
                    line.push(daily, round2(cell ? cell.dataset.otTotal : 0));
                });
                line.push(Number(row.dataset.dailyRate) || 0, Number(row.dataset.otRate) || 0,
                          Number(row.dataset.clientDailyRate) || 0, Number(row.dataset.clientOtRate) || 0);
                aoa.push(line);
            });
            var ws = XLSX.utils.aoa_to_sheet(aoa);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            var name = logFileName(dates);
            XLSX.writeFile(wb, name);
            if (window.FeriizNotify) {
                FeriizNotify.success('Fill in Daily (1 or 0) and Overtime (hours) for each day, then upload it with Import Log.', name + ' downloaded');
            }
        }).catch(function () {
            if (window.FeriizNotify) FeriizNotify.error('The Excel tool could not be loaded. Check the internet connection and try again.', 'Download failed');
        });
    }

    /* ---------- Reading an uploaded file ---------- */
    function headKey(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, ''); }

    // A column title as a date: "26/10/2026", "2026-10-26", or an Excel date number.
    function headDate(v) {
        if (typeof v === 'number' && v > 20000 && v < 80000) {
            return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
        }
        var s = String(v == null ? '' : v).trim();
        var m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
        if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    }

    // null = left empty, NaN = not a number. "1,5" counts as 1.5.
    function cellNumber(v) {
        if (v === '' || v == null) return null;
        if (typeof v === 'number') return v;
        var s = String(v).trim().replace(/\s/g, '').replace(',', '.');
        if (!s) return null;
        var n = Number(s);
        return Number.isFinite(n) ? n : NaN;
    }

    // "08:00:00" from "8:00", "08:00:00", or an Excel time (a fraction of a day); '' otherwise.
    function clockText(v) {
        if (typeof v === 'number' && v >= 0 && v < 1) {
            var s = Math.round(v * 86400);
            return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
        }
        var m = String(v == null ? '' : v).trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] || 0) > 59) return '';
        return m[1].padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00');
    }

    // Rates may be typed as "150.000".
    function rateNumber(v) {
        if (typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(v.trim())) v = v.trim().replace(/\./g, '');
        return cellNumber(v);
    }

    // The Download Log layout: titles in row 1, "Daily" / "Overtime" under each date in row 2.
    function readLogSheet(aoa) {
        var head = aoa[0] || [], sub = aoa[1] || [];
        var col = { code: -1, pin: -1, name: -1, start: -1, end: -1, period: -1 }, days = [], rates = {};
        head.forEach(function (h, i) {
            var k = headKey(h), s = headKey(sub[i]), date = headDate(h);
            if (k === 'code') col.code = i;
            else if (k === 'pin') col.pin = i;
            else if (k === 'firstname' || k === 'name') col.name = i;
            else if (k === 'timestart') col.start = i;
            else if (k === 'timeend') col.end = i;
            else if (k === 'period') col.period = i;
            else if (date && (s === 'daily' || s === 'overtime')) {
                var day = days.filter(function (x) { return x.date === date; })[0];
                if (!day) days.push(day = { date: date, daily: -1, ot: -1 });
                if (s === 'daily') day.daily = i; else day.ot = i;
            }
            else if (k === 'employee') rates.daily = i;
            else if (k === 'employeovertime' || k === 'employeeovertime') rates.ot = i;
            else if (k === 'client') rates.clientDaily = i;
            else if (k === 'clientovertime') rates.clientOt = i;
        });
        return { col: col, days: days.filter(function (d) { return d.daily >= 0; }), rates: rates, rows: aoa.slice(2) };
    }

    // What the import would do, compared with what the Report uses now (an earlier import, else the system).
    function buildImportPlan(sheet, fileName) {
        var plan = { file: fileName, dates: [], people: 0, cells: [], rates: [], changed: [], rateChanges: [], same: 0, problems: [] };
        if (sheet.col.code < 0 || !sheet.days.length) { plan.fatal = true; return plan; }
        plan.dates = sheet.days.map(function (d) { return d.date; }).sort();
        var byCode = {}, byPin = {};
        reportEmployees.forEach(function (e) {
            byCode[String(e.code).toUpperCase()] = e;
            if (e.pin) byPin[String(e.pin)] = e;
        });
        var stored = projectImports();
        sheet.rows.forEach(function (r, idx) {
            var line = idx + 3;   // the row number in Excel
            var code = String(r[sheet.col.code] == null ? '' : r[sheet.col.code]).trim();
            var pin = sheet.col.pin >= 0 ? String(r[sheet.col.pin] == null ? '' : r[sheet.col.pin]).trim() : '';
            if (!code && !pin) return;
            var who = (sheet.col.name >= 0 && r[sheet.col.name] ? String(r[sheet.col.name]) + ' · ' : '') + (code || 'Pin ' + pin);
            var emp = byCode[code.toUpperCase()] || (pin && byPin[pin]);
            if (!emp) { plan.problems.push({ line: line, who: who, why: 'Not in this report' }); return; }
            plan.people++;
            // The person's working day in the file: shown as log in / log out on imported days.
            var start = sheet.col.start >= 0 ? clockText(r[sheet.col.start]) : '';
            var end = sheet.col.end >= 0 ? clockText(r[sheet.col.end]) : '';
            var period = sheet.col.period >= 0 ? cellNumber(r[sheet.col.period]) : null;
            if (!(period > 0 && period <= 24)) period = null;
            sheet.days.forEach(function (d) {
                var daily = cellNumber(r[d.daily]);
                var ot = d.ot >= 0 ? cellNumber(r[d.ot]) : null;
                if (daily === null && ot === null) return;   // left empty: that day stays as it is
                var on = ' on ' + shortDate(d.date);
                if (daily !== 0 && daily !== 1) { plan.problems.push({ line: line, who: emp.name, why: 'Daily' + on + ' must be 1 or 0' }); return; }
                if (ot === null) ot = 0;
                if (!(ot >= 0 && ot <= 24)) { plan.problems.push({ line: line, who: emp.name, why: 'Overtime' + on + ' must be hours between 0 and 24' }); return; }
                var key = emp.code + '|' + d.date;
                var prev = stored.cells[key];
                var now = prev ? { daily: prev.daily, ot: prev.ot } : systemDay(emp.code, d.date);
                var next = { daily: daily, ot: round2(ot) };
                plan.cells.push({ key: key, daily: next.daily, ot: next.ot, start: start, end: end, period: period });
                if (differs(now, next)) plan.changed.push({ name: emp.name, date: d.date, now: now, next: next });
                else plan.same++;
            });
            var rate = {}, bad = false;
            Object.keys(sheet.rates).forEach(function (k) {
                var v = rateNumber(r[sheet.rates[k]]);
                if (v === null) return;
                if (!(v >= 0)) { bad = true; return; }
                rate[k] = Math.round(v);
            });
            if (bad) plan.problems.push({ line: line, who: emp.name, why: 'A rate is not a number, so the rates were left as they are' });
            else if (Object.keys(rate).length) {
                var was = ratesFor(emp, true);
                var diff = Object.keys(rate).filter(function (k) { return rate[k] !== was[k]; });
                plan.rates.push({ code: emp.code, rate: rate });
                diff.forEach(function (k) { plan.rateChanges.push({ name: emp.name, label: RATE_LABELS[k], from: was[k], to: rate[k] }); });
            }
        });
        return plan;
    }

    // A new import replaces what its days show; the earlier ones stay in the history.
    function commitImport(plan) {
        var stored = projectImports();
        var at = new Date().toISOString();
        var by = currentAdmin();
        var batch = { id: 'IMP-' + Date.now().toString(36).toUpperCase(), file: plan.file, at: at, by: by, cells: {} };
        plan.cells.forEach(function (c) {
            batch.cells[c.key] = { daily: c.daily, ot: c.ot, start: c.start, end: c.end, period: c.period };
            stored.cells[c.key] = { daily: c.daily, ot: c.ot, start: c.start, end: c.end, period: c.period, file: plan.file, at: at, by: by };
        });
        stored.batches.push(batch);
        plan.rates.forEach(function (r) {
            var merged = stored.rates[r.code] || {};
            Object.keys(r.rate).forEach(function (k) { merged[k] = r.rate[k]; });
            merged.file = plan.file;
            merged.at = at;
            stored.rates[r.code] = merged;
        });
        saveImports();
        syncDataFilter();
        deselectAllCells();
        showDays(currentVisibleDates.slice(), true);
        applyReportFilters();
    }

    // "Show original data" is offered once the project has an import.
    function syncDataFilter() {
        var block = document.getElementById('reportDataFilter');
        if (!block) return;
        block.hidden = !hasImports();
        if (window.bootstrap && window.bootstrap.Tooltip) {
            block.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) { window.bootstrap.Tooltip.getOrCreateInstance(el); });
        }
    }

    /* ---------- The Import Log dialog: choose → reading → preview ---------- */
    function importStep(step) {
        importModal.querySelector('#importStepChoose').hidden = step !== 'choose';
        importModal.querySelector('#importStepLoading').hidden = step !== 'loading';
        importModal.querySelector('#importStepPreview').hidden = step !== 'preview';
        importModal.querySelector('#importBack').hidden = step !== 'preview';
        var count = step === 'preview' && importPlan ? importPlan.cells.length : 0;
        var submit = importModal.querySelector('#importSubmit');
        submit.disabled = !count;
        submit.textContent = count ? 'Import ' + count + (count === 1 ? ' day' : ' days') : 'Import';
    }

    function importError(message) {
        var box = importModal.querySelector('#importError');
        box.textContent = message || '';
        box.hidden = !message;
    }

    function previewTable(heads, rows) {
        return '<div class="import-table-wrap"><table class="data-table import-table"><thead><tr>' +
            heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
            rows.slice(0, IMPORT_LIST_MAX).join('') + '</tbody></table></div>' +
            (rows.length > IMPORT_LIST_MAX ? '<p class="form-text">And ' + (rows.length - IMPORT_LIST_MAX) + ' more.</p>' : '');
    }

    function renderImportPreview(plan) {
        var first = plan.dates[0], last = plan.dates[plan.dates.length - 1];
        var html = '<div class="import-chosen">' +
                '<i class="fa-solid fa-file-excel" aria-hidden="true"></i>' +
                '<div class="import-file-text"><div class="import-file-name">' + escapeHTML(plan.file) + '</div>' +
                '<div class="import-file-meta">' + shortDate(first) + (last !== first ? ' – ' + shortDate(last) : '') + ' · ' +
                    plan.people + (plan.people === 1 ? ' person' : ' people') + '</div></div>' +
            '</div>' +
            '<div class="import-counts">' +
                '<span class="import-count' + (plan.changed.length ? ' is-changed' : '') + '"><strong>' + plan.changed.length + '</strong> changed</span>' +
                '<span class="import-count"><strong>' + plan.same + '</strong> same as now</span>' +
                (plan.rateChanges.length ? '<span class="import-count is-changed"><strong>' + plan.rateChanges.length + '</strong> rate ' +
                    (plan.rateChanges.length === 1 ? 'change' : 'changes') + '</span>' : '') +
                (plan.problems.length ? '<span class="import-count is-problem"><strong>' + plan.problems.length + '</strong> not imported</span>' : '') +
            '</div>';
        if (!plan.cells.length) {
            html += '<div class="import-empty">Nothing in this file can be imported. ' +
                (plan.problems.length ? 'See why below.' : 'Every Daily and Overtime cell is empty.') + '</div>';
        }
        if (plan.changed.length) {
            html += '<h3 class="import-section-title">Changes</h3>' + previewTable(['Name', 'Date', 'Now', 'After import'], plan.changed.map(function (c) {
                return '<tr><td>' + escapeHTML(c.name) + '</td><td class="tpl-nowrap">' + shortDate(c.date) + '</td>' +
                    '<td>' + escapeHTML(dayText(c.now)) + '</td><td class="import-new">' + escapeHTML(dayText(c.next)) + '</td></tr>';
            }));
        }
        if (plan.rateChanges.length) {
            html += '<h3 class="import-section-title">Rates</h3>' + previewTable(['Name', 'Rate', 'Now', 'After import'], plan.rateChanges.map(function (c) {
                return '<tr><td>' + escapeHTML(c.name) + '</td><td>' + c.label + '</td><td>' + formatIDR(c.from) + '</td><td class="import-new">' + formatIDR(c.to) + '</td></tr>';
            }));
        }
        if (plan.problems.length) {
            html += '<h3 class="import-section-title">Not imported</h3>' + previewTable(['Row', 'Who', 'Why'], plan.problems.map(function (p) {
                return '<tr><td>' + p.line + '</td><td>' + escapeHTML(p.who) + '</td><td>' + escapeHTML(p.why) + '</td></tr>';
            }));
        }
        if (plan.cells.length) {
            html += '<p class="import-keep"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
                'The system data is not deleted: each imported day shows System on the left and Import on the right.</p>';
        }
        importModal.querySelector('#importStepPreview').innerHTML = html;
    }

    function readImportFile(file) {
        importError('');
        importPlan = null;
        if (!file) { importStep('choose'); return; }
        var ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (IMPORT_TYPES.indexOf(ext) < 0) {
            importStep('choose');
            importError(file.name + ' is not an Excel file. Upload the .xlsx you got from Download Log.');
            return;
        }
        if (file.size > IMPORT_MAX) {
            importStep('choose');
            importError(file.name + ' is ' + importSize(file.size) + '. The limit is 5 MB.');
            return;
        }
        importModal.querySelector('#importLoadingName').textContent = file.name;
        importStep('loading');
        Promise.all([loadXLSX(), file.arrayBuffer()]).then(function (res) {
            var XLSX = res[0];
            var wb = XLSX.read(res[1], { type: 'array' });
            var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
            var plan = buildImportPlan(readLogSheet(aoa), file.name);
            if (plan.fatal) {
                importStep('choose');
                importError(file.name + ' does not look like a Feriiz log: it has no Code column or no Daily/Overtime dates. ' +
                    'Get the right file with Download Log, fill it in, and upload that one.');
                return;
            }
            importPlan = plan;
            renderImportPreview(plan);
            importStep('preview');
        }).catch(function () {
            importStep('choose');
            importError(file.name + ' could not be read. Save it again as .xlsx, or check the internet connection (the Excel tool loads online).');
        });
    }

    function buildImportModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'importModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'importModalTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="importModalTitle">Import Log</h2>' +
                            '<p class="tpl-subtitle" id="importContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div id="importStepChoose">' +
                            '<p class="import-intro">Upload the Excel from <strong>Download Log</strong> after filling in Daily (1 or 0) and Overtime (hours). ' +
                                'Its numbers replace what the Report counts for those days. The system\'s own logs are kept and shown next to them.</p>' +
                            '<label class="import-drop" for="importInput">' +
                                '<i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>' +
                                '<span class="import-drop-title">Drag the file here or <u>choose a file</u></span>' +
                                '<span class="import-drop-hint">.xlsx or .xls, up to 5 MB</span>' +
                                '<input type="file" id="importInput" class="visually-hidden" accept="' + IMPORT_TYPES.join(',') + '">' +
                            '</label>' +
                            '<div class="import-error" id="importError" role="alert" hidden></div>' +
                        '</div>' +
                        '<div class="import-loading" id="importStepLoading" role="status" hidden>' +
                            '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>' +
                            '<span>Reading <span id="importLoadingName"></span>…</span>' +
                        '</div>' +
                        '<div id="importStepPreview" hidden></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline me-auto" id="importBack" hidden>Choose another file</button>' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="importSubmit" disabled>Import</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);

        var input = el.querySelector('#importInput');
        var drop = el.querySelector('.import-drop');
        input.addEventListener('change', function () { readImportFile(input.files[0]); });
        ['dragenter', 'dragover'].forEach(function (t) {
            drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
        });
        ['dragleave', 'drop'].forEach(function (t) {
            drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
        });
        drop.addEventListener('drop', function (e) { readImportFile(e.dataTransfer.files[0]); });
        el.querySelector('#importBack').addEventListener('click', function () { input.value = ''; readImportFile(null); });
        el.querySelector('#importSubmit').addEventListener('click', function () {
            var plan = importPlan;
            if (!plan || !plan.cells.length) return;
            window.bootstrap.Modal.getInstance(el).hide();
            commitImport(plan);
            if (window.FeriizNotify) {
                FeriizNotify.success(plan.cells.length + (plan.cells.length === 1 ? ' day' : ' days') + ' for ' + plan.people + (plan.people === 1 ? ' person' : ' people') +
                    ' now show System and Import side by side (' + plan.changed.length + ' changed). The totals count the import.', 'Log imported');
            }
        });
        el.addEventListener('hidden.bs.modal', function () { input.value = ''; readImportFile(null); });
        return el;
    }

    function openImportLog() {
        if (!importModal) importModal = buildImportModal();
        importModal.querySelector('#importContext').textContent = projectContext ? projectContext.name : '';
        readImportFile(null);
        window.bootstrap.Modal.getOrCreateInstance(importModal).show();
        loadXLSX().catch(function () { /* reported when the file is read */ });
    }

    function initImport() {
        var btn = document.getElementById('reportImportBtn');
        var menu = document.getElementById('reportImportDropdown');
        if (!btn || !menu) return;
        function setOpen(open) {
            menu.classList.toggle('show', open);
            btn.setAttribute('aria-expanded', String(open));
        }
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            setOpen(!menu.classList.contains('show'));
        });
        document.addEventListener('click', function (e) {
            if (menu.classList.contains('show') && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menu.classList.contains('show')) { setOpen(false); btn.focus(); }
        });
        menu.addEventListener('click', function (e) {
            var item = e.target.closest('[data-import]');
            if (!item) return;
            setOpen(false);
            if (item.dataset.import === 'download') downloadLog();
            else openImportLog();
        });
    }

    function init() {
        initPeriodPresets();
        initImport();
        var templateBtn = document.getElementById('reportTemplateBtn');
        if (templateBtn) templateBtn.addEventListener('click', openTemplateAssign);
        // A request chip in a day opens everyone who has that request; the summary columns only show totals.
        var reportBody = document.getElementById('reportTableBody');
        if (reportBody) reportBody.addEventListener('click', function (e) {
            var chip = e.target.closest('.req-chip');
            if (!chip) return;
            e.preventDefault();
            e.stopPropagation();
            openRequestList(chip.dataset.template, chip.closest('tr').dataset.employeeCode);
        });
        // The clock button over a day's Import half opens that day's import history.
        var reportHead = document.querySelector('.report-table thead');
        if (reportHead) reportHead.addEventListener('click', function (e) {
            var historyBtn = e.target.closest('.import-history-btn');
            if (!historyBtn) return;
            e.preventDefault();
            e.stopPropagation();
            openImportHistory(historyBtn.dataset.date);
        });
        syncDataFilter();
        resetDateDraft();
        showDays(datesInRange());
        updateFilterIndicator();

        // Apply filter
        var applyBtn = document.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                var wasOriginal = appliedReportFilters.original;
                var originalBox = document.getElementById('filterOriginal');
                appliedReportFilters.missingTypes = getDraftMissingTypes();
                appliedReportFilters.occupations = (window.FeriizFilters && window.FeriizFilters.getOccupationValues)
                    ? window.FeriizFilters.getOccupationValues(document)
                    : [];
                appliedReportFilters.occupationLabels = selectedOccupationLabels();
                appliedReportFilters.range = draftRange();
                appliedReportFilters.original = Boolean(originalBox && originalBox.checked && hasImports());
                showDays(datesFromDraft(), wasOriginal !== appliedReportFilters.original);
                applyReportFilters();
            });
        }

        // Clear filter
        var clearBtn = document.querySelector('.filter-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                var wasOriginal = appliedReportFilters.original;
                var originalBox = document.getElementById('filterOriginal');
                resetDateDraft();
                document.querySelectorAll('.filter-missing').forEach(function (i) { i.checked = false; });
                if (originalBox) originalBox.checked = false;
                if (window.FeriizFilters && window.FeriizFilters.resetOccupationFilter) window.FeriizFilters.resetOccupationFilter(document);
                appliedReportFilters.missingTypes = [];
                appliedReportFilters.occupations = [];
                appliedReportFilters.occupationLabels = [];
                appliedReportFilters.range = null;
                appliedReportFilters.original = false;
                deselectAllCells();
                showDays(datesInRange(), wasOriginal);
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
                var noteButton = e.target.closest('.report-log-note-btn');
                if (!noteButton) return;
                e.preventDefault();
                e.stopPropagation();
                // The left half of a split day carries the system's own notes.
                openLogNote(noteButton.closest('[data-in-note]'), noteButton.dataset.logType);
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
                if (cb) cb.addEventListener('change', function () { syncMasterState(mId); });
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
        // A request covers the person, whichever project it was filed under.
        requestIndex = {};
        (data.generatedRequests || []).forEach(function (r) {
            if (r.status !== 'Accepted' || !relevant.has(r.employeeCode) || !r.dateStart) return;
            for (var d = r.dateStart; d <= (r.dateEnd || r.dateStart); d = addDays(d, 1)) {
                requestIndex[r.employeeCode + '|' + d] = r;
            }
        });
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
