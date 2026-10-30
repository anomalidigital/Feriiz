(function () {
    'use strict';

    var printButton = null;
    var originalTitle = '';

    function isElementVisible(el) {
        if (!el || el.hidden || el.classList.contains('day-col-hidden')) return false;
        var style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function getVisibleRows() {
        return Array.from(document.querySelectorAll('.report-table tbody tr')).filter(isElementVisible);
    }

    function getVisibleDateHeaders() {
        return Array.from(document.querySelectorAll('.report-table thead th.day-col')).filter(isElementVisible);
    }

    function formatDateLabel(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-GB', {
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

    function sanitizeNameCell(td, tr) {
        if (!td) return '-';
        var empName = (td.querySelector('.emp-name-cell') || td).textContent.trim();
        var empOcc = '';
        if (td.querySelector('.emp-occupation-cell')) {
            empOcc = td.querySelector('.emp-occupation-cell').textContent.trim();
        } else if (tr) {
            var occEl = tr.querySelector('.emp-occupation-cell') || tr.querySelector('.col-occupation');
            if (occEl) empOcc = occEl.textContent.trim();
        }

        var html = '<div class="print-emp-name">' + escapeHTML(empName) + '</div>';
        if (empOcc && empOcc !== '-') {
            html += '<div class="print-emp-sub">' + escapeHTML(empOcc) + '</div>';
        }
        return html;
    }

    function sanitizeDailyCell(td) {
        if (!td) return '-';
        if (td.classList.contains('weekend-off-cell') || td.classList.contains('holiday-off-cell')) {
            return '<span class="print-day-off">Off</span>';
        }

        // A day without logs covered by an accepted request prints the request's name.
        if (td.dataset.request) {
            return '<div class="print-day-cell"><div class="print-day-log">' + escapeHTML(td.dataset.request) + '</div></div>';
        }

        var inTime = td.dataset.inTime || '';
        var outTime = td.dataset.outTime || '';

        if (!inTime && !outTime) {
            var clockLines = td.querySelectorAll('.feriiz-u-141');
            if (clockLines.length >= 1 && clockLines[0].querySelector('span')) {
                inTime = clockLines[0].querySelector('span').textContent.trim();
            }
            if (clockLines.length >= 2 && clockLines[1].querySelector('span')) {
                outTime = clockLines[1].querySelector('span').textContent.trim();
            }
        }

        var badges = Array.from(td.querySelectorAll('.badge, .feriiz-u-135, .feriiz-u-136'))
            .map(function (b) { return b.textContent.trim(); })
            .filter(Boolean);

        // An imported day has the file's numbers and no log times.
        if (td.dataset.imported === '1') {
            return '<div class="print-day-cell"><div class="print-day-badges">' + badges.map(function (b) {
                return '<span class="' + (b.toLowerCase().includes('ot') ? 'print-badge-ot' : 'print-badge-work') + '">' + escapeHTML(b) + '</span>';
            }).join('') + '</div><div class="print-day-log">Imported</div></div>';
        }

        if (!inTime && !outTime && badges.length === 0) {
            return '<span class="print-day-off">-</span>';
        }

        var html = '<div class="print-day-cell">';
        if (badges.length) {
            html += '<div class="print-day-badges">';
            badges.forEach(function (b) {
                var isOT = b.toLowerCase().includes('ot');
                html += '<span class="' + (isOT ? 'print-badge-ot' : 'print-badge-work') + '">' + escapeHTML(b) + '</span>';
            });
            html += '</div>';
        }

        if (inTime) {
            html += '<div class="print-day-log"><span class="print-log-label">In:</span> ' + escapeHTML(inTime) + '</div>';
        } else {
            html += '<div class="print-day-log print-no-log"><span class="print-log-label">In:</span> --:--:--</div>';
        }

        if (outTime) {
            html += '<div class="print-day-log"><span class="print-log-label">Out:</span> ' + escapeHTML(outTime) + '</div>';
        } else {
            html += '<div class="print-day-log print-no-log"><span class="print-log-label">Out:</span> --:--:--</div>';
        }

        html += '</div>';
        return html;
    }

    function sanitizeTextCell(td) {
        if (!td) return '-';
        var clone = td.cloneNode(true);
        clone.querySelectorAll('button, input, select, .day-cell-checkbox, .cell-updated-badge, .note-icon, .screen-only').forEach(function (el) {
            el.remove();
        });
        var text = clone.textContent.trim();
        return text ? escapeHTML(text) : '-';
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

    function buildPrintDocument() {
        var main = document.querySelector('main.main-content') || document.body;

        var printDoc = document.getElementById('reportPrintDocument');
        if (!printDoc) {
            printDoc = document.createElement('div');
            printDoc.id = 'reportPrintDocument';
            printDoc.className = 'report-print-document';
            main.appendChild(printDoc);
        }

        var visibleRows = getVisibleRows();
        var context = getReportContext();
        var dateRange = getDateRangeDetails();
        var visibleDateHeaders = getVisibleDateHeaders();

        // Determine active sections
        var isEmpActive = isSectionActive('grpEmployee');
        var isCliActive = isSectionActive('grpClient');
        var isDailyActive = visibleDateHeaders.length > 0;

        // Build Identifier
        var projectSanitized = context.projectName.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9_\-&]/g, '');
        var identifierParts = [
            dateRange.startYYMMDD + '_' + dateRange.endYYMMDD,
            projectSanitized
        ];
        if (isDailyActive) identifierParts.push('DAILY');
        if (isEmpActive) identifierParts.push('EMPLOYEE');
        if (isCliActive) identifierParts.push('CLIENT');

        var identifier = identifierParts.join('_');

        var nowStr = new Date().toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Top Header
        var html = '<div class="report-print-header">';
        html += '<div class="report-print-header-top">';
        html += '  <div class="report-print-brand-wrap">';
        html += '    <div class="report-print-title-group">';
        html += '      <h1 class="report-print-project-title">' + escapeHTML(context.mainTitle) + '</h1>';
        html += '      <p class="report-print-project-subtitle">' + escapeHTML(context.subtitle) + '</p>';
        html += '    </div>';
        html += '  </div>';
        html += '  <div class="report-print-header-right">';
        html += '    <div class="report-print-footer-id">' + escapeHTML(identifier) + '</div>';
        html += '    <div class="report-print-meta-grid">';
        html += '      <div class="report-print-meta-item"><div class="report-print-meta-label">Period</div><div class="report-print-meta-value">' + escapeHTML(dateRange.label) + '</div></div>';
        html += '      <div class="report-print-meta-item"><div class="report-print-meta-label">Rows</div><div class="report-print-meta-value">' + visibleRows.length + ' records</div></div>';
        html += '      <div class="report-print-meta-item"><div class="report-print-meta-label">Generated</div><div class="report-print-meta-value">' + escapeHTML(nowStr) + '</div></div>';
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
        html += '<div class="report-print-filter-summary"><strong>Active Filter:</strong> ' + escapeHTML(getFilterSummary()) + '</div>';
        html += '</div>';

        // Check active sub-columns
        var showEmpDaily = isElementVisible(document.querySelector('.col-emp-dailyrate'));
        var showEmpRateOT = isElementVisible(document.querySelector('.col-emp-rateovertime'));
        var showEmpTotalR = isElementVisible(document.querySelector('.col-emp-totalrate'));
        var showEmpTotalOT = isElementVisible(document.querySelector('.col-emp-totalovertime'));
        var empColCount = (showEmpDaily ? 1 : 0) + (showEmpRateOT ? 1 : 0) + (showEmpTotalR ? 1 : 0) + (showEmpTotalOT ? 1 : 0);

        var showCliDaily = isElementVisible(document.querySelector('.col-cli-dailyrate'));
        var showCliRateOT = isElementVisible(document.querySelector('.col-cli-rateovertime'));
        var showCliTotalR = isElementVisible(document.querySelector('.col-cli-totalrate'));
        var showCliTotalOT = isElementVisible(document.querySelector('.col-cli-totalovertime'));
        // Request templates (Transport, Uang Makan...) and Total Additional end the Client group.
        var cliAddCols = Array.from(document.querySelectorAll('.report-table thead th.col-cli-add, .report-table thead th.col-cli-addtotal'))
            .filter(isElementVisible)
            .map(function (th) {
                return {
                    name: th.textContent.trim(),
                    sel: th.dataset.template ? '.col-cli-add[data-template="' + th.dataset.template + '"]' : '.col-cli-addtotal'
                };
            });
        var cliColCount = (showCliDaily ? 1 : 0) + (showCliRateOT ? 1 : 0) + (showCliTotalR ? 1 : 0) + (showCliTotalOT ? 1 : 0) + cliAddCols.length;

        // Single Unified Wide Table (Old Feriiz Structure + New Design)
        html += '<div class="report-print-section">';
        // Proportional column widths. Without this the browser splits all ~26
        // columns evenly, which starves the money columns (they need room for
        // "1.095.000") while the day columns sit half empty.
        var W = { no: 0.7, name: 3.5, dayPeriod: 1.62, dayOT: 1.45, totals: 2.4, money: 4.4, pay: 4.6 };
        var colW = [W.no, W.name];
        if (isDailyActive) visibleDateHeaders.forEach(function () { colW.push(W.dayPeriod, W.dayOT); });
        colW.push(W.totals, W.totals);
        if (isEmpActive && empColCount > 0) {
            if (showEmpDaily) colW.push(W.money);
            if (showEmpRateOT) colW.push(W.money);
            if (showEmpTotalR) colW.push(W.money);
            if (showEmpTotalOT) colW.push(W.money);
            colW.push(W.money);
        }
        if (isCliActive && cliColCount > 0) {
            if (showCliDaily) colW.push(W.money);
            if (showCliRateOT) colW.push(W.money);
            if (showCliTotalR) colW.push(W.money);
            if (showCliTotalOT) colW.push(W.money);
            cliAddCols.forEach(function () { colW.push(W.money); });
            colW.push(W.money);
        }
        if (isEmpActive) colW.push(W.pay);
        if (isCliActive) colW.push(W.pay);
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

        if (isDailyActive) {
            visibleDateHeaders.forEach(function (th) {
                var dateVal = th.dataset.date || '';
                var label = formatDateLabel(dateVal);
                if (!label) {
                    var textSpan = th.querySelector('span');
                    label = textSpan ? textSpan.textContent.trim() : th.textContent.trim();
                }
                html += '<th colspan="2" class="th-group th-date-grp">' + escapeHTML(label) + '</th>';
            });
        }

        html += '<th rowspan="2" class="th-total-days">Total<br>Day</th>';
        html += '<th rowspan="2" class="th-total-ot">Total<br>OT</th>';

        if (isEmpActive && empColCount > 0) {
            html += '<th colspan="' + (empColCount + 1) + '" class="th-group th-emp-grp">Employee (IDR)</th>';
        }

        if (isCliActive && cliColCount > 0) {
            html += '<th colspan="' + (cliColCount + 1) + '" class="th-group th-cli-grp">Client (IDR)</th>';
        }

        if (isEmpActive) {
            html += '<th rowspan="2" class="th-total-pay">Total Payment<br>Employee<br>(IDR)</th>';
        }
        if (isCliActive) {
            html += '<th rowspan="2" class="th-total-pay">Total Payment<br>Client<br>(IDR)</th>';
        }

        html += '</tr>';

        // Header Row 2
        html += '<tr>';
        if (isDailyActive) {
            visibleDateHeaders.forEach(function () {
                html += '<th>Day</th><th>OT</th>';
            });
        }

        if (isEmpActive && empColCount > 0) {
            if (showEmpDaily) html += '<th>Daily<br>Rate</th>';
            if (showEmpRateOT) html += '<th>Rate<br>Overtime</th>';
            if (showEmpTotalR) html += '<th>Total<br>Rate</th>';
            if (showEmpTotalOT) html += '<th>Total Rate<br>OT</th>';
            html += '<th>Subtotal<br>Rate</th>';
        }

        if (isCliActive && cliColCount > 0) {
            if (showCliDaily) html += '<th>Daily<br>Rate</th>';
            if (showCliRateOT) html += '<th>Rate<br>Overtime</th>';
            if (showCliTotalR) html += '<th>Total<br>Rate</th>';
            if (showCliTotalOT) html += '<th>Total Rate<br>OT</th>';
            cliAddCols.forEach(function (c) { html += '<th>' + escapeHTML(c.name) + '</th>'; });
            html += '<th>Subtotal<br>Rate</th>';
        }

        html += '</tr>';
        html += '</thead><tbody>';

        // Helper to extract text
        function extractVal(tr, selector) {
            var el = tr.querySelector(selector);
            return sanitizeTextCell(el);
        }

        // Transport, the request templates and Total Additional: plain amounts.
        function addVal(tr, col) {
            var el = tr.querySelector(col.sel);
            var text = el ? el.textContent.trim() : '';
            return text ? escapeHTML(text) : '-';
        }

        // The "IDR" prefix is shown once in the column header instead of on
        // every cell — it costs ~25% of each money column's width.
        function money(v) {
            if (typeof v !== 'string') return v;
            var out = v.replace(/IDR\s*/gi, '').trim();
            return out === '' ? '-' : out;
        }

        // Daily Period & Overtime extractor
        function extractDailyPeriodAndOT(tr, dateVal, thIdx) {
            var dayTd = tr.querySelector('td.day-col[data-date="' + dateVal + '"]');
            if (!dayTd) {
                var allDayTds = Array.from(tr.querySelectorAll('td.day-col')).filter(isElementVisible);
                dayTd = allDayTds[thIdx];
            }
            if (!dayTd || dayTd.classList.contains('weekend-off-cell') || dayTd.classList.contains('holiday-off-cell')) {
                return { period: '-', overtime: '-' };
            }

            // A day off work for an accepted request (sick, leave...) prints the request's name.
            if (dayTd.dataset.request) return { period: dayTd.dataset.request, overtime: '-' };

            var period = '-';
            var overtime = '-';

            // A split day (System | Import) prints the import, which is what the totals count.
            // Only the hour and overtime badges are read, not the request chips.
            var scope = dayTd.querySelector('.day-half--import:not(.is-empty)') || dayTd.querySelector('.day-half--system') || dayTd;
            var badges = Array.from(scope.querySelectorAll('.feriiz-u-135, .feriiz-u-136'))
                .map(function (b) { return b.textContent.trim(); });

            badges.forEach(function (b) {
                if (b.toLowerCase().includes('ot')) {
                    overtime = b.replace(/ot/i, '').trim();
                } else if (b) {
                    period = b.replace(/h/i, '').trim();
                }
            });

            if (period === '-' && overtime === '-') {
                var inTime = dayTd.dataset.inTime || '';
                var outTime = dayTd.dataset.outTime || '';
                if (inTime || outTime) period = '1';
            }

            return { period: period, overtime: overtime };
        }

        // Rows
        visibleRows.forEach(function (tr, index) {
            var empTd = tr.querySelector('.col-name');
            var empNameHtml = sanitizeNameCell(empTd, tr);

            var totalDaysText = extractVal(tr, '.col-totaldays');
            var totalOtText = extractVal(tr, '.col-totalovertime');

            html += '<tr>';
            html += '<td class="td-no">' + (index + 1) + '</td>';
            html += '<td class="td-name">' + empNameHtml + '</td>';

            if (isDailyActive) {
                visibleDateHeaders.forEach(function (th, thIdx) {
                    var dateVal = th.dataset.date || '';
                    var dInfo = extractDailyPeriodAndOT(tr, dateVal, thIdx);
                    html += '<td class="td-daily-period">' + escapeHTML(dInfo.period) + '</td>';
                    html += '<td class="td-daily-ot">' + escapeHTML(dInfo.overtime) + '</td>';
                });
            }

            html += '<td class="td-total-days">' + totalDaysText + '</td>';
            html += '<td class="td-total-ot">' + totalOtText + '</td>';
            var m = rowMoney(tr);

            // Employee Rates
            if (isEmpActive && empColCount > 0) {
                var empDaily = extractVal(tr, '.col-emp-dailyrate');
                var empRateOT = extractVal(tr, '.col-emp-rateovertime');
                var empTotalR = extractVal(tr, '.col-emp-totalrate');
                var empTotalOT = extractVal(tr, '.col-emp-totalovertime');

                if (showEmpDaily) html += '<td class="td-rate">' + money(empDaily) + '</td>';
                if (showEmpRateOT) html += '<td class="td-rate">' + money(empRateOT) + '</td>';
                if (showEmpTotalR) html += '<td class="td-rate">' + money(empTotalR) + '</td>';
                if (showEmpTotalOT) html += '<td class="td-rate">' + money(empTotalOT) + '</td>';
                html += '<td class="td-rate td-subtotal">' + formatIDRCurrency(m.empSub) + '</td>';
            }

            // Client Rates
            if (isCliActive && cliColCount > 0) {
                var cliDaily = extractVal(tr, '.col-cli-dailyrate');
                var cliRateOT = extractVal(tr, '.col-cli-rateovertime');
                var cliTotalR = extractVal(tr, '.col-cli-totalrate');
                var cliTotalOT = extractVal(tr, '.col-cli-totalovertime');

                if (showCliDaily) html += '<td class="td-rate">' + money(cliDaily) + '</td>';
                if (showCliRateOT) html += '<td class="td-rate">' + money(cliRateOT) + '</td>';
                if (showCliTotalR) html += '<td class="td-rate">' + money(cliTotalR) + '</td>';
                if (showCliTotalOT) html += '<td class="td-rate">' + money(cliTotalOT) + '</td>';
                cliAddCols.forEach(function (c) {
                    html += '<td class="td-rate">' + money(addVal(tr, c)) + '</td>';
                });
                html += '<td class="td-rate td-subtotal">' + formatIDRCurrency(m.cliSub) + '</td>';
            }

            // Payment Totals
            if (isEmpActive) html += '<td class="td-payment">' + formatIDRCurrency(m.empPay) + '</td>';
            if (isCliActive) html += '<td class="td-payment">' + formatIDRCurrency(m.cliPay) + '</td>';

            html += '</tr>';
        });

        // Calculate Column Totals for Footer Row
        function parseNumericVal(str) {
            if (!str || str === '-') return 0;
            var clean = str.replace(/IDR/gi, '').replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.-]/g, '').trim();
            var val = parseFloat(clean);
            return isNaN(val) ? 0 : val;
        }

        function formatIDRCurrency(num) {
            if (!num || num === 0) return '0';
            return Math.round(num).toLocaleString('id-ID');
        }

        // As in the old Feriiz summary: Subtotal Rate = Total Rate + Total Rate Overtime in each
        // group. Total Payment Client also adds the Client group's additional columns (Transport,
        // request templates); Total Payment Employee is its Subtotal Rate.
        function rowMoney(tr) {
            var num = function (selector) { return parseNumericVal(extractVal(tr, selector)); };
            var empSub = num('.col-emp-totalrate') + num('.col-emp-totalovertime');
            var cliSub = num('.col-cli-totalrate') + num('.col-cli-totalovertime');
            var cliAdd = 0;
            tr.querySelectorAll('td.col-cli-add').forEach(function (td) { cliAdd += parseNumericVal(td.textContent.trim()); });
            return { empSub: empSub, cliSub: cliSub, empPay: empSub, cliPay: cliSub + cliAdd };
        }

        var sumEmpDaily = 0, sumEmpRateOT = 0, sumEmpTotalR = 0, sumEmpTotalOT = 0, sumEmpSubtotal = 0;
        var sumCliDaily = 0, sumCliRateOT = 0, sumCliTotalR = 0, sumCliTotalOT = 0, sumCliSubtotal = 0;
        var sumCliAdd = {}, sumEmpPayment = 0, sumCliPayment = 0;

        visibleRows.forEach(function (tr) {
            var m = rowMoney(tr);
            if (isEmpActive && empColCount > 0) {
                if (showEmpDaily) sumEmpDaily += parseNumericVal(extractVal(tr, '.col-emp-dailyrate'));
                if (showEmpRateOT) sumEmpRateOT += parseNumericVal(extractVal(tr, '.col-emp-rateovertime'));
                if (showEmpTotalR) sumEmpTotalR += parseNumericVal(extractVal(tr, '.col-emp-totalrate'));
                if (showEmpTotalOT) sumEmpTotalOT += parseNumericVal(extractVal(tr, '.col-emp-totalovertime'));
                sumEmpSubtotal += m.empSub;
            }
            if (isCliActive && cliColCount > 0) {
                if (showCliDaily) sumCliDaily += parseNumericVal(extractVal(tr, '.col-cli-dailyrate'));
                if (showCliRateOT) sumCliRateOT += parseNumericVal(extractVal(tr, '.col-cli-rateovertime'));
                if (showCliTotalR) sumCliTotalR += parseNumericVal(extractVal(tr, '.col-cli-totalrate'));
                if (showCliTotalOT) sumCliTotalOT += parseNumericVal(extractVal(tr, '.col-cli-totalovertime'));
                sumCliSubtotal += m.cliSub;
                cliAddCols.forEach(function (c) {
                    sumCliAdd[c.sel] = (sumCliAdd[c.sel] || 0) + parseNumericVal(addVal(tr, c));
                });
            }
            if (isEmpActive) sumEmpPayment += m.empPay;
            if (isCliActive) sumCliPayment += m.cliPay;
        });

        var leftColspan = 2 + (isDailyActive ? visibleDateHeaders.length * 2 : 0) + 2;

        html += '</tbody><tfoot>';

        // "Jumlah Orang Per Hari" (Arcon's sheet, built on dev 30-10-2026): how many of the
        // printed people worked on each date, by the same rule as Total Days, and the sum of
        // those person-days under Total Day.
        if (isDailyActive) {
            var workedOn = function (td) {
                if (!td || td.classList.contains('weekend-off-cell')) return false;
                if (td.dataset.imported) return Number(td.dataset.daily) > 0;
                return Boolean(td.dataset.inTime || td.dataset.outTime);
            };
            var personDays = 0;
            html += '<tr class="tr-people-row"><td colspan="2" class="td-total-label">Jumlah Orang Per Hari</td>';
            visibleDateHeaders.forEach(function (th) {
                var count = visibleRows.filter(function (tr) {
                    return workedOn(tr.querySelector('td.day-col[data-date="' + th.dataset.date + '"]'));
                }).length;
                personDays += count;
                html += '<td colspan="2" class="td-people-count">' + count + '</td>';
            });
            html += '<td class="td-people-count">' + personDays + '</td><td></td>';
            var restCols = (isEmpActive && empColCount > 0 ? empColCount + 1 : 0) + (isCliActive && cliColCount > 0 ? cliColCount + 1 : 0) +
                (isEmpActive ? 1 : 0) + (isCliActive ? 1 : 0);
            if (restCols) html += '<td colspan="' + restCols + '"></td>';
            html += '</tr>';
        }

        html += '<tr class="tr-total-row">';
        html += '<td colspan="' + leftColspan + '" class="td-total-label">Total</td>';

        if (isEmpActive && empColCount > 0) {
            if (showEmpDaily) html += '<td class="td-rate td-total-cell"></td>';
            if (showEmpRateOT) html += '<td class="td-rate td-total-cell"></td>';
            if (showEmpTotalR) html += '<td class="td-rate td-total-cell">' + formatIDRCurrency(sumEmpTotalR) + '</td>';
            if (showEmpTotalOT) html += '<td class="td-rate td-total-cell">' + formatIDRCurrency(sumEmpTotalOT) + '</td>';
            html += '<td class="td-rate td-subtotal td-total-cell">' + formatIDRCurrency(sumEmpSubtotal) + '</td>';
        }

        if (isCliActive && cliColCount > 0) {
            if (showCliDaily) html += '<td class="td-rate td-total-cell"></td>';
            if (showCliRateOT) html += '<td class="td-rate td-total-cell"></td>';
            if (showCliTotalR) html += '<td class="td-rate td-total-cell">' + formatIDRCurrency(sumCliTotalR) + '</td>';
            if (showCliTotalOT) html += '<td class="td-rate td-total-cell">' + formatIDRCurrency(sumCliTotalOT) + '</td>';
            cliAddCols.forEach(function (c) {
                html += '<td class="td-rate td-total-cell">' + formatIDRCurrency(sumCliAdd[c.sel] || 0) + '</td>';
            });
            html += '<td class="td-rate td-subtotal td-total-cell">' + formatIDRCurrency(sumCliSubtotal) + '</td>';
        }

        if (isEmpActive) {
            html += '<td class="td-payment td-total-cell">' + formatIDRCurrency(sumEmpPayment) + '</td>';
        }
        if (isCliActive) {
            html += '<td class="td-payment td-total-cell">' + formatIDRCurrency(sumCliPayment) + '</td>';
        }

        html += '</tr></tfoot></table>';
        html += '</div>';

        // Footer HTML
        var pageUrl = window.location.href;
        html += '<div class="report-print-footer">';
        html += '  <div class="report-print-footer-url">' + escapeHTML(pageUrl) + '</div>';
        html += '  <div class="report-print-footer-page"></div>';
        html += '</div>';

        printDoc.innerHTML = html;
        return identifier;
    }

    function prepareForPrint() {
        var visibleRows = getVisibleRows();
        if (visibleRows.length === 0) return null;

        var identifier = buildPrintDocument();
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
            printButton.innerHTML = '<i class="fa-solid fa-print"></i><span>Print</span>';
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

        if (printButton) {
            printButton.disabled = true;
            printButton.classList.add('is-preparing');
            printButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Preparing...</span>';
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
