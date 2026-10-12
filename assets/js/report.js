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
        cellOverrides[row.dataset.employeeCode + '|' + cell.dataset.date] = {
            inTime: cell.dataset.inTime || '',
            outTime: cell.dataset.outTime || '',
            inNote: cell.dataset.inNote || '',
            outNote: cell.dataset.outNote || ''
        };
    }
    // Dropdown controls are drafts. Only Apply is allowed to replace this state.
    var appliedReportFilters = {
        missingTypes: [],
        occupations: []
    };

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

        var hasWork = inTime && outTime;
        var totalBadge = hasWork
            ? '<span class="badge feriiz-u-135">9h</span><span class="badge feriiz-u-136">2h OT</span>'
            : '<span class="badge feriiz-u-135">0h</span><span class="badge feriiz-u-136">0h OT</span>';

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

            var missingAttr = issue ? ' data-missing="' + issue + '"' : '';
            var dataAttrs = ' data-in-time="' + escapeHTML(inTime) + '" data-out-time="' + escapeHTML(outTime) + '" data-in-note="' + escapeHTML(inNote) + '" data-out-note="' + escapeHTML(outNote) + '"';
            var cellClass = 'day-col feriiz-u-132' + (issue ? ' no-log-cell' : '');
            var content = buildDayCellContent({ inTime: inTime, outTime: outTime, inNote: inNote, outNote: outNote, issue: issue });

            return '<td class="' + cellClass + '" data-date="' + date + '"' + missingAttr + dataAttrs + '>' +
                checkbox + content + '</td>';
        }).join('');
    }

    function createEmployeeRow(employee, dates) {
        var empRateOT = projectContext ? projectContext.overtimeRate || 0 : 0;
        var cliRateOT = projectContext ? projectContext.clientOvertimeRate || 0 : 0;
        return '<tr data-employee-code="' + escapeHTML(employee.code) + '" data-employee-name="' + escapeHTML(employee.name) + '">' +
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
            '<td class="col-additional-amount"></td>' +
            '<td class="col-additional-note"></td>' +
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
    function parseHourBadge(text) {
        var m = String(text || '').match(/(\d+(?:\.\d+)?)/);
        return m ? Number(m[1]) : 0;
    }

    function formatHour(h) {
        if (!Number.isFinite(h) || h <= 0) return '0h';
        return Number.isInteger(h) ? h + 'h' : h.toFixed(2).replace(/\.?0+$/, '') + 'h';
    }

    function updateVisibleTotals(datesToShow) {
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            var workDays = [];
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (datesToShow.indexOf(cell.dataset.date) >= 0 && !cell.classList.contains('weekend-off-cell')) {
                    workDays.push(cell);
                }
            });
            var totalWork = 0, totalOT = 0;
            workDays.forEach(function (cell) {
                cell.querySelectorAll('span').forEach(function (span) {
                    var t = span.textContent.trim();
                    if (t.indexOf('OT') >= 0) totalOT += parseHourBadge(t);
                    else if (/h$/.test(t)) totalWork += parseHourBadge(t);
                });
            });
            var d = row.querySelector('.col-totaldays');
            var h = row.querySelector('.col-totalhour');
            var o = row.querySelector('.col-totalovertime');
            if (d) d.textContent = workDays.length + 'd';
            if (h) h.textContent = formatHour(totalWork);
            if (o) o.textContent = formatHour(totalOT);
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

    function updateFilterIndicator() {
        var bar = document.getElementById('reportFilterIndicator');
        var chips = document.getElementById('filterIndicatorChips');
        var types = getSelectedMissingTypes();

        if (!bar || !chips) return;

        if (types.length === 0) {
            bar.style.display = 'none';
            return;
        }

        bar.style.display = '';
        var labels = { 'in': 'Log In', 'out': 'Log Out' };
        chips.innerHTML = types.map(function (t) {
            return '<span class="filter-indicator-chip">' + (labels[t] || t) +
                '<button class="filter-chip-close" data-filter-type="' + t + '">&times;</button></span>';
        }).join('');

        // Bind close buttons
        chips.querySelectorAll('.filter-chip-close').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.filterType;
                document.querySelectorAll('.filter-missing').forEach(function (cb) {
                    if (cb.value === type) cb.checked = false;
                });
                appliedReportFilters.missingTypes = appliedReportFilters.missingTypes.filter(function (item) {
                    return item !== type;
                });
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

                cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                    buildDayCellContent({ inTime: newIn, outTime: newOut, inNote: newInNote, outNote: newOutNote, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true });
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

                if (backToDayOff) {
                    cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';
                } else {
                    cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                        buildDayCellContent({ inTime: existIn, outTime: existOut, inNote: existInNote, outNote: existOutNote, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true });
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
    function init() {
        initPeriodPresets();
        resetDateDraft();
        showDays(datesInRange());

        // Apply filter
        var applyBtn = document.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                appliedReportFilters.missingTypes = getDraftMissingTypes();
                appliedReportFilters.occupations = (window.FeriizFilters && window.FeriizFilters.getOccupationValues)
                    ? window.FeriizFilters.getOccupationValues(document)
                    : [];
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
        var reportLink = document.getElementById('reportBackLink');
        if (reportLink) reportLink.href = 'project_report.html?project=' + encodeURIComponent(projectContext.code);
        // Build attendance index for just this project's dates
        attendanceIndex = {};
        var relevant = new Set(reportEmployees.map(function (e) { return e.code; }));
        for (var i = 0; i < data.attendance.length; i++) {
            var a = data.attendance[i];
            if (relevant.has(a.employeeCode) && a.projectCode === projectContext.code) {
                attendanceIndex[a.employeeCode + '|' + a.date] = a;
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
