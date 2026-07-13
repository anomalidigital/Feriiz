(function () {
    'use strict';

    /* =============================================
       DATA
       ============================================= */
    var ALL_DATES = [
        '2026-06-15', '2026-06-16', '2026-06-17',
        '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21'
    ];
    var WEEKEND_DATES = new Set(['2026-06-20', '2026-06-21']);
    // Smart default: Monday of current week through today
    // For demo purposes, simulate "today" as within the data range
    var DEMO_TODAY = '2026-06-18'; // Thursday — shows Mon 15 to Thu 18
    function getDefaultDates() {
        var today = new Date(DEMO_TODAY);
        var day = today.getDay(); // 0=Sun, 1=Mon...
        var monday = new Date(today);
        monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
        var dates = [];
        var d = new Date(monday);
        while (d <= today) {
            var str = d.toISOString().slice(0, 10);
            if (ALL_DATES.indexOf(str) >= 0) dates.push(str);
            d.setDate(d.getDate() + 1);
        }
        return dates.length > 0 ? dates : [ALL_DATES[0]];
    }
    var DEFAULT_DATES = getDefaultDates();

    // Project + employees are resolved from URL ?project=CODE and FERIIZ_DATA.
    var projectContext = null;
    var reportEmployees = [];
    // Fast lookup for attendance records keyed by employeeCode + '|' + date
    var attendanceIndex = {};
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

    /* =============================================
       CELL RENDERING
       ============================================= */
    function buildClockLine(type, value, options) {
        var fixed = (options && options.fixed) || false;
        var iconClass = type === 'in'
            ? 'fa-arrow-right-to-bracket feriiz-u-142'
            : 'fa-arrow-right-from-bracket feriiz-u-144';
        var fixedClass = fixed ? ' fixed-clock-line' : '';
        var lockIcon = false
            ? ''
            : '';
        return '<div class="feriiz-u-141' + fixedClass + '">' +
            '<span><i class="fa-solid ' + iconClass + '"></i>' + value + '</span>' +
            lockIcon + '</div>';
    }

    function buildDayCellContent(opts) {
        var inTime = (opts && opts.inTime) || '';
        var outTime = (opts && opts.outTime) || '';
        var issue = (opts && opts.issue) || '';
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
                html += inLines.map(function (l) { return buildClockLine('in', l.value, { fixed: l.fixed }); }).join('');
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            if (outLines.length > 0) {
                html += outLines.map(function (l) { return buildClockLine('out', l.value, { fixed: l.fixed }); }).join('');
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            html += '</div>';
        } else {
            // Default rendering: always show in row on top, out row on bottom
            html += '<div class="feriiz-u-140">';
            if (inTime) {
                html += buildClockLine('in', inTime);
            } else {
                html += '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';
            }
            if (outTime) {
                html += buildClockLine('out', outTime);
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
            var isWeekend = WEEKEND_DATES.has(date);
            var checkbox = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';

            if (rec && (rec.status === 'weekend' || rec.status === 'holiday')) {
                return '<td class="day-col feriiz-u-132 weekend-off-cell" data-date="' + date + '" data-in-time="" data-out-time="">' +
                    checkbox + '</td>';
            }
            if (!rec && isWeekend) {
                return '<td class="day-col feriiz-u-132 weekend-off-cell" data-date="' + date + '" data-in-time="" data-out-time="">' +
                    checkbox + '</td>';
            }

            var inTime = rec ? (rec.inTime || '') : '';
            var outTime = rec ? (rec.outTime || '') : '';
            var issue = getMissingType(inTime, outTime);

            var missingAttr = issue ? ' data-missing="' + issue + '"' : '';
            var dataAttrs = ' data-in-time="' + inTime + '" data-out-time="' + outTime + '"';
            var cellClass = 'day-col feriiz-u-132' + (issue ? ' no-log-cell' : '');
            var content = buildDayCellContent({ inTime: inTime, outTime: outTime, issue: issue });

            return '<td class="' + cellClass + '" data-date="' + date + '"' + missingAttr + dataAttrs + '>' +
                checkbox + content + '</td>';
        }).join('');
    }

    function createEmployeeRow(employee, dates) {
        var empRateOT = projectContext ? projectContext.overtimeRate || 0 : 0;
        var cliRateOT = projectContext ? projectContext.clientOvertimeRate || 0 : 0;
        return '<tr data-employee-code="' + employee.code + '" data-employee-name="' + employee.name + '">' +
            '<td class="col-name sticky-col">' +
                '<div class="report-identity-content">' +
                    '<div class="emp-code-cell">' + employee.code + '</div>' +
                    '<div class="emp-name-cell">' + employee.name + '</div>' +
                    '<div class="emp-occupation-cell">' + employee.occupation + '</div>' +
                    '<div class="emp-pin-cell">Pin: ' + employee.pin + '</div>' +
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

    function renderTable() {
        var tbody = document.getElementById('reportTableBody');
        if (!tbody) return;
        tbody.innerHTML = reportEmployees.map(function (emp) {
            return createEmployeeRow(emp, ALL_DATES);
        }).join('');
    }

    /* =============================================
       DAY COLUMN VISIBILITY
       ============================================= */
    var currentVisibleDates = DEFAULT_DATES.slice();

    function showDays(datesToShow) {
        currentVisibleDates = datesToShow.slice();
        document.querySelectorAll('.day-col').forEach(function (el) {
            el.classList.toggle('day-col-hidden', datesToShow.indexOf(el.dataset.date) < 0);
        });
        var header = document.getElementById('monthHeader');
        if (header) header.colSpan = datesToShow.length || 1;
        updateVisibleTotals(datesToShow);
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

    function rowHasMissingType(row, types) {
        if (types.length === 0) return true;
        var cells = row.querySelectorAll('td.day-col');
        for (var i = 0; i < cells.length; i++) {
            if (currentVisibleDates.indexOf(cells[i].dataset.date) >= 0) {
                var m = cells[i].dataset.missing || '';
                if (m === 'both' && (types.indexOf('in') >= 0 || types.indexOf('out') >= 0)) return true;
                if (types.indexOf(m) >= 0) return true;
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
                var cellMissing = cell.dataset.missing || '';
                var isMatch = false;
                if (cellMissing === 'both') {
                    isMatch = types.indexOf('in') >= 0 || types.indexOf('out') >= 0;
                } else {
                    isMatch = cellMissing && types.indexOf(cellMissing) >= 0;
                }
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
        if (selected.length === 0) return;
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
            if (!hasLogs) return; // Prevent action if no logs to delete
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
        var clockValue = input ? input.value : '07:00:00';
        var selectedCells = getSelectedCells();
        var affectedEmployees = getAffectedEmployeeCount();
        var selectedLogType = getActiveLogType();
        var dateSummary = getBatchDateSummary(selectedCells);
        var updated = 0;

        clearRecentUpdateMarkers();

        if (activeAction === 'add') {
            // Determine if we are adding log-in or log-out based on label
            var addingIn = getActiveLogType() === 'in';

            selectedCells.forEach(function (cell) {
                var missing = cell.dataset.missing || '';
                var existIn = cell.dataset.inTime || '';
                var existOut = cell.dataset.outTime || '';

                var fillType = addingIn ? 'in' : 'out';

                var newIn = fillType === 'in' ? clockValue : existIn;
                var newOut = fillType === 'out' ? clockValue : existOut;

                // Always: in on top, out on bottom
                var lines = [];
                if (newIn) lines.push({ type: 'in', value: newIn, fixed: true });
                if (newOut) lines.push({ type: 'out', value: newOut, fixed: true });

                cell.dataset.inTime = newIn;
                cell.dataset.outTime = newOut;

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
                    buildDayCellContent({ inTime: newIn, outTime: newOut, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true });
                updated++;
            });
        } else if (activeAction.indexOf('delete') === 0) {
            selectedCells.forEach(function (cell) {
                var existIn = cell.dataset.inTime || '';
                var existOut = cell.dataset.outTime || '';
                var date = cell.dataset.date;

                if (activeAction === 'delete-in') {
                    existIn = '';
                } else if (activeAction === 'delete-out') {
                    existOut = '';
                } else {
                    existIn = '';
                    existOut = '';
                }

                cell.dataset.inTime = existIn;
                cell.dataset.outTime = existOut;

                var issue = getMissingType(existIn, existOut);
                if (issue) {
                    cell.dataset.missing = issue;
                    cell.classList.add('no-log-cell');
                } else if (!existIn && !existOut) {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                    if (WEEKEND_DATES.has(date)) {
                        cell.classList.add('weekend-off-cell');
                    }
                } else {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                }

                cell.classList.add('recently-updated-cell');
                cell.classList.remove('cell-selected');

                var lines = [];
                if (existIn) lines.push({ type: 'in', value: existIn });
                if (existOut) lines.push({ type: 'out', value: existOut });

                if (!existIn && !existOut && WEEKEND_DATES.has(date)) {
                    cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';
                } else {
                    cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                        buildDayCellContent({ inTime: existIn, outTime: existOut, issue: issue, clockLines: lines.length > 0 ? lines : null, updated: true });
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
            var message = isAdd
                ? updated + ' ' + logLabel + ' entries were added for ' + affectedEmployees + ' employees on ' + dateSummary +
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
            var v = this.value, now = new Date(), s = '', e = '';
            var fmt = function (d) { return d.toISOString().slice(0, 10); };
            if (v === 'today') { s = e = fmt(now); }
            else if (v === 'yesterday') { var y = new Date(now); y.setDate(y.getDate() - 1); s = e = fmt(y); }
            else if (v === 'this_week') { var d = new Date(now); d.setDate(d.getDate() - d.getDay() + 1); s = fmt(d); e = fmt(now); }
            else if (v === 'last_week') { var d2 = new Date(now); d2.setDate(d2.getDate() - d2.getDay() - 6); s = fmt(d2); var d3 = new Date(d2); d3.setDate(d2.getDate() + 6); e = fmt(d3); }
            else if (v === 'this_month') { s = fmt(new Date(now.getFullYear(), now.getMonth(), 1)); e = fmt(now); }
            else if (v === 'last_month') { s = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)); e = fmt(new Date(now.getFullYear(), now.getMonth(), 0)); }
            else if (v === 'this_year') { s = fmt(new Date(now.getFullYear(), 0, 1)); e = fmt(now); }
            else if (v === 'all_time') { s = ''; e = ''; }
            di[0].value = s; di[1].value = e;
        });
    }

    /* =============================================
       INIT
       ============================================= */
    function init() {
        renderTable();
        showDays(DEFAULT_DATES);
        initPeriodPresets();

        var dateInputs = document.querySelectorAll('.filter-date');

        // Apply filter
        var applyBtn = document.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                appliedReportFilters.missingTypes = getDraftMissingTypes();
                appliedReportFilters.occupations = (window.FeriizFilters && window.FeriizFilters.getOccupationValues)
                    ? window.FeriizFilters.getOccupationValues(document)
                    : [];
                var s = dateInputs[0] ? dateInputs[0].value : '';
                var e = dateInputs[1] ? dateInputs[1].value : '';
                if (s || e) {
                    var sT = s ? new Date(s).getTime() : -Infinity;
                    var eT = e ? new Date(e).getTime() : Infinity;
                    var vis = ALL_DATES.filter(function (d) { var t = new Date(d).getTime(); return t >= sT && t <= eT; });
                    showDays(vis.length > 0 ? vis : DEFAULT_DATES);
                } else {
                    showDays(DEFAULT_DATES);
                }
                applyReportFilters();
            });
        }

        // Clear filter
        var clearBtn = document.querySelector('.filter-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                dateInputs.forEach(function (i) { i.value = ''; });
                var ps = document.querySelector('.filter-period');
                if (ps) ps.selectedIndex = 0;
                document.querySelectorAll('.filter-missing').forEach(function (i) { i.checked = false; });
                if (window.FeriizFilters && window.FeriizFilters.resetOccupationFilter) window.FeriizFilters.resetOccupationFilter(document);
                appliedReportFilters.missingTypes = [];
                appliedReportFilters.occupations = [];
                deselectAllCells();
                showDays(DEFAULT_DATES);
                applyReportFilters();
            });
        }

        // Search
        var searchInput = document.getElementById('reportSearch');
        if (searchInput) searchInput.addEventListener('input', applyReportFilters);

        // Day header select-all checkboxes
        document.querySelectorAll('.day-header-select').forEach(function (headerCb) {
            headerCb.addEventListener('change', function () {
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
        });

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

    function loadProjectContext(data) {
        var url = new URL(location.href);
        var code = url.searchParams.get('project');
        projectContext = code ? data.findProjectByCode(code) : data.projects[0];
        if (!projectContext) projectContext = data.projects[0];
        reportEmployees = data.employees.filter(function (e) {
            return (e.projects || []).indexOf(projectContext.code) >= 0;
        });
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
        if (bc) bc.textContent = projectContext.name;
        if (projectContext.name) {
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
