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
    var DEFAULT_DATE = '2026-06-15';

    var officialEmployees = [
        { code: 'ADA27B1B2E650H0X', name: 'Adam Ferial', occupation: 'Graphic Design', pin: '3131' },
        { code: 'APR8940K8VB44L8', name: 'Apriyanto Apriyanto', occupation: 'Teknisi', pin: '2714' },
        { code: 'BILFBY9N8YJ1YDN', name: 'Baldyas Satrio', occupation: 'Graphic Design', pin: '2218' },
        { code: 'IFAT8WJ2DM', name: 'Ifan Faizal Adnan', occupation: 'Sr.Programmer', pin: '1840' },
        { code: 'IND693283053999', name: 'Indra Naftali', occupation: 'Manager', pin: '5190' },
        { code: 'MAUNZITL5HOQ7GG', name: 'Mauli Hidayat', occupation: 'Backend', pin: '7402' },
        { code: 'RADYBYR517IFSC6', name: 'Raden Maulana', occupation: 'Frontend', pin: '6629' },
        { code: 'STEPRQTY99', name: 'Steven Febrianto', occupation: 'Marketing', pin: '8027' },
        { code: 'VER2FWV8L80S5SX', name: 'Veronica Nathalia', occupation: 'HR Administrator', pin: '4075' },
        { code: 'YENX6LH3X9', name: 'Yenni Tedjakoesoemo', occupation: '3D Artist', pin: '9064' },
        { code: 'ZICOJMQN8SQSFRDT', name: 'Zicky Affan', occupation: 'Teknisi', pin: '5861' },
        { code: 'SAN79P3WFFK4MQM', name: 'Sandy Santuy', occupation: 'Frontend', pin: '7903' }
    ];

    var dummyEmployees = [
        {
            code: 'DMS001ANM', name: 'Dimas Pratama', occupation: 'Frontend', pin: '4501',
            isDummy: true,
            schedule: {
                '2026-06-15': { inTime: '08:52:14', outTime: '17:31:42' },
                '2026-06-16': { inTime: '09:01:33', outTime: '17:45:18' },
                '2026-06-17': { inTime: '', outTime: '17:28:55' },
                '2026-06-18': { inTime: '', outTime: '18:02:41' },
                '2026-06-19': { inTime: '08:47:29', outTime: '17:35:10' },
                '2026-06-20': { inTime: '08:55:03', outTime: '' },
                '2026-06-21': { inTime: '09:10:22', outTime: '17:20:15' }
            }
        },
        {
            code: 'NAD002ANM', name: 'Nadia Permata', occupation: 'Backend', pin: '4502',
            isDummy: true,
            schedule: {
                '2026-06-15': { inTime: '08:45:18', outTime: '17:38:42' },
                '2026-06-16': { inTime: '', outTime: '17:55:30' },
                '2026-06-17': { inTime: '09:05:11', outTime: '17:42:08' },
                '2026-06-18': { inTime: '', outTime: '18:10:25' },
                '2026-06-19': { inTime: '08:58:44', outTime: '17:30:55' },
                '2026-06-20': { inTime: '', outTime: '17:48:33' },
                '2026-06-21': { inTime: '09:12:07', outTime: '17:25:40' }
            }
        },
        {
            code: 'RZK003ANM', name: 'Rizky Mahendra', occupation: 'Graphic Design', pin: '4503',
            isDummy: true,
            schedule: {
                '2026-06-15': { inTime: '08:50:32', outTime: '17:40:18' },
                '2026-06-16': { inTime: '08:42:55', outTime: '' },
                '2026-06-17': { inTime: '09:08:14', outTime: '17:35:22' },
                '2026-06-18': { inTime: '08:55:40', outTime: '17:50:33' },
                '2026-06-19': { inTime: '08:48:17', outTime: '' },
                '2026-06-20': { inTime: '09:02:38', outTime: '' },
                '2026-06-21': { inTime: '08:58:45', outTime: '17:28:10' }
            }
        }
    ];

    var officialDayTimes = [
        { inTime: '09:10:29', outTime: '18:45:07' },
        { inTime: '08:55:41', outTime: '17:52:33' },
        { inTime: '09:22:15', outTime: '18:10:48' },
        { inTime: '08:48:37', outTime: '17:38:22' },
        { inTime: '09:05:50', outTime: '18:25:14' }
    ];

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

        if (isEmpty) return '';

        var hasWork = inTime && outTime;
        var totalBadge = hasWork
            ? '<span class="badge feriiz-u-135">9h</span><span class="badge feriiz-u-136">2h OT</span>'
            : '<span class="badge feriiz-u-135">0h</span><span class="badge feriiz-u-136">0h OT</span>';

        var renderedLines = Array.isArray(clockLines) ? clockLines : null;

        var html = '';
        if (totalBadge) {
            html += '<div class="feriiz-u-133"><div class="feriiz-u-134">' + totalBadge + '</div></div>';
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
        if (!inTime && outTime) return 'in';
        if (inTime && !outTime) return 'out';
        return '';
    }

    function createDayCells(employee, dates) {
        return dates.map(function (date) {
            var isWeekend = WEEKEND_DATES.has(date);
            var isDummy = employee.isDummy;

            // Official: off weekends
            if (!isDummy && isWeekend) {
                return '<td class="day-col feriiz-u-132 weekend-off-cell" data-date="' + date + '"></td>';
            }

            var dayData;
            if (isDummy && employee.schedule && employee.schedule[date]) {
                dayData = employee.schedule[date];
            } else if (!isDummy) {
                var weekdays = dates.filter(function (d) { return !WEEKEND_DATES.has(d); });
                var dayIndex = weekdays.indexOf(date);
                if (dayIndex < 0) dayIndex = 0;
                dayData = officialDayTimes[dayIndex % officialDayTimes.length];
            } else {
                dayData = { inTime: '09:00:00', outTime: '17:00:00' };
            }

            var inTime = dayData.inTime || '';
            var outTime = dayData.outTime || '';
            var issue = getMissingType(inTime, outTime);

            var missingAttr = issue ? ' data-missing="' + issue + '"' : '';
            var dataAttrs = ' data-in-time="' + inTime + '" data-out-time="' + outTime + '"';
            var cellClass = 'day-col feriiz-u-132' + (issue ? ' no-log-cell' : '');

            // Checkbox inside each cell with content
            var checkbox = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';

            var content = buildDayCellContent({ inTime: inTime, outTime: outTime, issue: issue });

            return '<td class="' + cellClass + '" data-date="' + date + '"' + missingAttr + dataAttrs + '>' +
                checkbox + content + '</td>';
        }).join('');
    }

    function createEmployeeRow(employee, dates) {
        return '<tr data-employee-code="' + employee.code + '" data-employee-name="' + employee.name + '"' +
            (employee.isDummy ? ' data-demo-missing="true"' : '') + '>' +
            '<td class="col-name sticky-col">' +
                '<div class="report-identity-content">' +
                    '<div class="emp-code-cell">' + employee.code + '</div>' +
                    '<div class="emp-name-cell">' + employee.name + '</div>' +
                    '<div class="emp-occupation-cell">' + employee.occupation + '</div>' +
                    '<div class="emp-pin-cell">Pin: ' + employee.pin + '</div>' +
                '</div>' +
            '</td>' +
            '<td class="col-inouthour">08:00:00</td>' +
            '<td class="col-inouthour">17:00:00</td>' +
            '<td class="col-activehour">9h</td>' +
            '<td class="col-totaldays">0d</td>' +
            '<td class="col-totalhour">0h</td>' +
            '<td class="col-totalovertime">0h</td>' +
            '<td class="col-emp-dailyrate rate-cell">IDR0.00</td>' +
            '<td class="col-emp-rateovertime rate-cell">IDR0.00</td>' +
            '<td class="col-emp-totalrate rate-cell">IDR0.00</td>' +
            '<td class="col-emp-totalovertime rate-cell">IDR0.00</td>' +
            '<td class="col-cli-dailyrate rate-cell">IDR0.00</td>' +
            '<td class="col-cli-rateovertime rate-cell">IDR0.00</td>' +
            '<td class="col-cli-totalrate rate-cell">IDR0.00</td>' +
            '<td class="col-cli-totalovertime rate-cell">IDR0.00</td>' +
            '<td class="col-additional-amount"></td>' +
            '<td class="col-additional-note"></td>' +
            createDayCells(employee, dates) +
        '</tr>';
    }

    function renderTable() {
        var tbody = document.getElementById('reportTableBody');
        if (!tbody) return;
        var all = officialEmployees.concat(dummyEmployees);
        tbody.innerHTML = all.map(function (emp) {
            return createEmployeeRow(emp, ALL_DATES);
        }).join('');
    }

    /* =============================================
       DAY COLUMN VISIBILITY
       ============================================= */
    var currentVisibleDates = [DEFAULT_DATE];

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
    function getSelectedMissingTypes() {
        return Array.from(document.querySelectorAll('.filter-missing:checked')).map(function (i) { return i.value; });
    }

    function rowHasMissingType(row, types) {
        if (types.length === 0) return true;
        var cells = row.querySelectorAll('td.day-col');
        for (var i = 0; i < cells.length; i++) {
            if (currentVisibleDates.indexOf(cells[i].dataset.date) >= 0 && types.indexOf(cells[i].dataset.missing) >= 0) return true;
        }
        return false;
    }

    function rowMatchesSearch(row) {
        var q = ((document.getElementById('reportSearch') || {}).value || '').trim().toLowerCase();
        if (!q) return true;
        return ((row.querySelector('.col-name') || {}).textContent || '').toLowerCase().indexOf(q) >= 0;
    }

    function rowMatchesOccupation(row) {
        var sel = (window.FeriizFilters && window.FeriizFilters.getOccupationValues) ? window.FeriizFilters.getOccupationValues(document) : [];
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
                var isMatch = cellMissing && types.indexOf(cellMissing) >= 0;
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
                applyReportFilters();
            });
        });
    }

    function selectCellsByMissing(type) {
        // First deselect all
        document.querySelectorAll('td.day-col.cell-selected').forEach(function (c) { c.classList.remove('cell-selected'); });

        // Select cells matching the missing type
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            if (row.hidden) return;
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (currentVisibleDates.indexOf(cell.dataset.date) < 0) return;
                if (cell.dataset.missing === type) {
                    var isSelected = cell.classList.contains('cell-selected');
                    if (cb) cb.checked = true;
                }
            });
        });
        updateCellSelectionUI();
    }

    function deselectAllCells() {
        document.querySelectorAll('.day-cell-select').forEach(function (cb) { cb.checked = false; });
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

    function applyBatchUpdate() {
        var input = document.getElementById('batchUpdateInput');
        var clockValue = input ? input.value : '07:00:00';
        var updated = 0;

        if (activeAction === 'add') {
            // Determine if we are adding log-in or log-out based on label
            var addingIn = getActiveLogType() === 'in';

            getSelectedCells().forEach(function (cell) {
                var missing = cell.dataset.missing || '';
                var existIn = cell.dataset.inTime || '';
                var existOut = cell.dataset.outTime || '';

                var fillType = missing || (addingIn ? 'in' : 'out');

                var newIn = fillType === 'in' ? clockValue : existIn;
                var newOut = fillType === 'out' ? clockValue : existOut;

                // Always: in on top, out on bottom
                var lines = [];
                lines.push({ type: 'in', value: newIn, fixed: fillType === 'in' && !!newIn });
                lines.push({ type: 'out', value: newOut, fixed: fillType === 'out' && !!newOut });

                cell.dataset.inTime = newIn;
                cell.dataset.outTime = newOut;
                cell.removeAttribute('data-missing');
                cell.classList.remove('no-log-cell');

                cell.classList.remove('cell-selected');

                cell.innerHTML = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>' +
                    buildDayCellContent({ inTime: newIn, outTime: newOut, issue: '', clockLines: lines });
                updated++;
            });
        } else if (activeAction.indexOf('delete') === 0) {
            getSelectedCells().forEach(function (cell) {
                var existIn = cell.dataset.inTime || '';
                var existOut = cell.dataset.outTime || '';

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

                var issue = (!existIn && existOut) ? 'in' : (existIn && !existOut) ? 'out' : '';
                if (issue) {
                    cell.dataset.missing = issue;
                    cell.classList.add('no-log-cell');
                } else if (!existIn && !existOut) {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                } else {
                    cell.removeAttribute('data-missing');
                    cell.classList.remove('no-log-cell');
                }

                var isSelected = cell.classList.contains('cell-selected');
                if (cb) cb.checked = false;

                var lines = [];
                if (existIn) lines.push({ type: 'in', value: existIn });
                if (existOut) lines.push({ type: 'out', value: existOut });

                cell.innerHTML =
                    buildDayCellContent({ inTime: existIn, outTime: existOut, issue: issue, clockLines: lines.length > 0 ? lines : null });
                updated++;
            });
        }

        closeBatchModal();
        applyReportFilters();
        updateVisibleTotals(currentVisibleDates);
        if (updated > 0) alert(updated + ' log entries updated.');
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

            // Auto-apply: show matching days and filter
            if (s || e) {
                var sT = s ? new Date(s).getTime() : -Infinity;
                var eT = e ? new Date(e).getTime() : Infinity;
                var vis = ALL_DATES.filter(function (d) { var t = new Date(d).getTime(); return t >= sT && t <= eT; });
                showDays(vis.length > 0 ? vis : [DEFAULT_DATE]);
            } else if (v === 'all_time') {
                showDays(ALL_DATES);
            } else {
                showDays([DEFAULT_DATE]);
            }
            applyReportFilters();
        });
    }

    /* =============================================
       INIT
       ============================================= */
    function init() {
        renderTable();
        showDays([DEFAULT_DATE]);
        initPeriodPresets();

        var dateInputs = document.querySelectorAll('.filter-date');

        // Apply filter
        var applyBtn = document.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                var s = dateInputs[0] ? dateInputs[0].value : '';
                var e = dateInputs[1] ? dateInputs[1].value : '';
                if (s || e) {
                    var sT = s ? new Date(s).getTime() : -Infinity;
                    var eT = e ? new Date(e).getTime() : Infinity;
                    var vis = ALL_DATES.filter(function (d) { var t = new Date(d).getTime(); return t >= sT && t <= eT; });
                    showDays(vis.length > 0 ? vis : [DEFAULT_DATE]);
                } else if (action === 'delete') {
                    showDays([DEFAULT_DATE]);
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
                deselectAllCells();
                showDays([DEFAULT_DATE]);
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
                    if (!cell || cell.classList.contains('filtered-out-cell') || cell.classList.contains('weekend-off-cell')) return;
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

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
