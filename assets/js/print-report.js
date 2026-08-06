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
        var projectName = projectLink ? projectLink.textContent.trim() : 'Project';

        if (page === 'employee-report') {
            var currentCrumb = document.querySelector('.breadcrumb > span:last-child');
            var employeeName = currentCrumb ? currentCrumb.textContent.trim() : 'Employee';
            return {
                title: 'Employee Report',
                projectName: projectName,
                subject: employeeName,
                subtitle: employeeName + ' | Project: ' + projectName,
                isEmployeePage: true
            };
        }

        return {
            title: 'Project Report',
            projectName: projectName,
            subject: projectName,
            subtitle: projectName + ' - Attendance & Payroll Summary',
            isEmployeePage: false
        };
    }

    function getFilterSummary() {
        var values = [];
        var appliedChips = Array.from(document.querySelectorAll('#filterIndicatorChips .filter-indicator-chip'))
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

    function sanitizeNameCell(td) {
        if (!td) return '-';
        var empName = (td.querySelector('.emp-name-cell') || td).textContent.trim();
        var empCode = (td.querySelector('.emp-code-cell')) ? td.querySelector('.emp-code-cell').textContent.trim() : '';
        var empOcc = (td.querySelector('.emp-occupation-cell')) ? td.querySelector('.emp-occupation-cell').textContent.trim() : '';
        var empPin = (td.querySelector('.emp-pin-cell')) ? td.querySelector('.emp-pin-cell').textContent.trim() : '';

        var subParts = [];
        if (empCode) subParts.push(empCode);
        if (empOcc) subParts.push(empOcc);
        if (empPin) subParts.push(empPin);

        var html = '<div class="print-emp-name">' + escapeHTML(empName) + '</div>';
        if (subParts.length) {
            html += '<div class="print-emp-sub">' + escapeHTML(subParts.join(' • ')) + '</div>';
        }
        return html;
    }

    function sanitizeDailyCell(td) {
        if (!td) return '-';
        if (td.classList.contains('weekend-off-cell') || td.classList.contains('holiday-off-cell')) {
            return '<span class="print-day-off">Off</span>';
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
        clone.querySelectorAll('button, input, select, .day-cell-checkbox, .cell-updated-badge, .note-icon').forEach(function (el) {
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
            var cb = document.getElementById('colClient');
            if (cb && !cb.checked) return false;
            if (groupHeader && !isElementVisible(groupHeader)) return false;
            var cliCols = document.querySelectorAll('.col-cli-dailyrate, .col-cli-rateovertime, .col-cli-totalrate, .col-cli-totalovertime');
            return Array.from(cliCols).some(isElementVisible);
        }

        if (sectionKey === 'grpAdditional') {
            if (groupHeader && !isElementVisible(groupHeader)) return false;
            var addCols = document.querySelectorAll('.col-additional-amount, .col-additional-note');
            return Array.from(addCols).some(isElementVisible);
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
        var isAddActive = isSectionActive('grpAdditional');
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
        if (isAddActive) identifierParts.push('ADDITIONAL');

        var identifier = identifierParts.join('_');

        var nowStr = new Date().toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Top Header
        var html = '<div class="report-print-header">';
        html += '<div class="report-print-header-top">';
        html += '  <div class="report-print-brand-wrap">';
        html += '    <div class="report-print-brand">FERIIZ</div>';
        html += '    <div class="report-print-title-group">';
        html += '      <h1>' + escapeHTML(context.title) + '</h1>';
        html += '      <p>' + escapeHTML(context.subtitle) + '</p>';
        html += '    </div>';
        html += '  </div>';
        html += '  <div class="report-print-meta-grid">';
        html += '    <div class="report-print-meta-item"><div class="report-print-meta-label">Period</div><div class="report-print-meta-value">' + escapeHTML(dateRange.label) + '</div></div>';
        html += '    <div class="report-print-meta-item"><div class="report-print-meta-label">Rows</div><div class="report-print-meta-value">' + visibleRows.length + ' records</div></div>';
        html += '    <div class="report-print-meta-item"><div class="report-print-meta-label">Generated</div><div class="report-print-meta-value">' + escapeHTML(nowStr) + '</div></div>';
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
        var cliColCount = (showCliDaily ? 1 : 0) + (showCliRateOT ? 1 : 0) + (showCliTotalR ? 1 : 0) + (showCliTotalOT ? 1 : 0);

        var showAddAmt = isElementVisible(document.querySelector('.col-additional-amount'));
        var showAddNote = isElementVisible(document.querySelector('.col-additional-note'));
        var addColCount = (showAddAmt ? 1 : 0) + (showAddNote ? 1 : 0);

        // Single Unified Wide Table (Old Feriiz Structure + New Design)
        html += '<div class="report-print-section">';
        html += '<table class="report-print-table report-unified-table"><thead>';

        // Header Row 1
        html += '<tr>';
        html += '<th rowspan="2" class="th-no">No</th>';
        html += '<th rowspan="2" class="th-name">Name</th>';
        html += '<th rowspan="2" class="th-occ">Occupation</th>';

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

        html += '<th rowspan="2" class="th-total-days">Total Day</th>';
        html += '<th rowspan="2" class="th-total-ot">Total Overtime</th>';

        if (isEmpActive && empColCount > 0) {
            html += '<th colspan="' + (empColCount + 1) + '" class="th-group th-emp-grp">Employee</th>';
        }

        if (isCliActive && cliColCount > 0) {
            html += '<th colspan="' + (cliColCount + 1) + '" class="th-group th-cli-grp">Client</th>';
        }

        if (isAddActive && addColCount > 0) {
            html += '<th colspan="' + addColCount + '" class="th-group th-add-grp">Additional</th>';
        }

        if (isEmpActive) {
            html += '<th rowspan="2" class="th-total-pay">Total Payment Employee</th>';
        }
        if (isCliActive) {
            html += '<th rowspan="2" class="th-total-pay">Total Payment Client</th>';
        }

        html += '</tr>';

        // Header Row 2
        html += '<tr>';
        if (isDailyActive) {
            visibleDateHeaders.forEach(function () {
                html += '<th>Period (daily)</th><th>Overtime (hour)</th>';
            });
        }

        if (isEmpActive && empColCount > 0) {
            if (showEmpDaily) html += '<th>Daily Rate</th>';
            if (showEmpRateOT) html += '<th>Rate Overtime</th>';
            if (showEmpTotalR) html += '<th>Total Rate</th>';
            if (showEmpTotalOT) html += '<th>Rate Overtime</th>';
            html += '<th>Subtotal Rate</th>';
        }

        if (isCliActive && cliColCount > 0) {
            if (showCliDaily) html += '<th>Daily Rate</th>';
            if (showCliRateOT) html += '<th>Rate Overtime</th>';
            if (showCliTotalR) html += '<th>Total Rate</th>';
            if (showCliTotalOT) html += '<th>Rate Overtime</th>';
            html += '<th>Subtotal Rate</th>';
        }

        if (isAddActive && addColCount > 0) {
            if (showAddAmt) html += '<th>Amount</th>';
            if (showAddNote) html += '<th>Note</th>';
        }

        html += '</tr>';
        html += '</thead><tbody>';

        // Helper to extract text
        function extractVal(tr, selector) {
            var el = tr.querySelector(selector);
            return sanitizeTextCell(el);
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

            var period = '-';
            var overtime = '-';

            var badges = Array.from(dayTd.querySelectorAll('.badge, .feriiz-u-135, .feriiz-u-136'))
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
            var empNameHtml = sanitizeNameCell(empTd);

            var occText = '-';
            var occEl = tr.querySelector('.emp-occupation-cell') || tr.querySelector('.col-occupation');
            if (occEl) occText = occEl.textContent.trim() || '-';

            var totalDaysText = extractVal(tr, '.col-totaldays');
            var totalOtText = extractVal(tr, '.col-totalovertime');

            html += '<tr>';
            html += '<td class="td-no">' + (index + 1) + '</td>';
            html += '<td class="td-name">' + empNameHtml + '</td>';
            html += '<td class="td-occ">' + escapeHTML(occText) + '</td>';

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

            // Employee Rates
            if (isEmpActive && empColCount > 0) {
                var empDaily = extractVal(tr, '.col-emp-dailyrate');
                var empRateOT = extractVal(tr, '.col-emp-rateovertime');
                var empTotalR = extractVal(tr, '.col-emp-totalrate');
                var empTotalOT = extractVal(tr, '.col-emp-totalovertime');

                if (showEmpDaily) html += '<td class="td-rate">' + empDaily + '</td>';
                if (showEmpRateOT) html += '<td class="td-rate">' + empRateOT + '</td>';
                if (showEmpTotalR) html += '<td class="td-rate">' + empTotalR + '</td>';
                if (showEmpTotalOT) html += '<td class="td-rate">' + empTotalOT + '</td>';
                html += '<td class="td-rate td-subtotal">' + (empTotalR !== '-' ? empTotalR : empDaily) + '</td>';
            }

            // Client Rates
            if (isCliActive && cliColCount > 0) {
                var cliDaily = extractVal(tr, '.col-cli-dailyrate');
                var cliRateOT = extractVal(tr, '.col-cli-rateovertime');
                var cliTotalR = extractVal(tr, '.col-cli-totalrate');
                var cliTotalOT = extractVal(tr, '.col-cli-totalovertime');

                if (showCliDaily) html += '<td class="td-rate">' + cliDaily + '</td>';
                if (showCliRateOT) html += '<td class="td-rate">' + cliRateOT + '</td>';
                if (showCliTotalR) html += '<td class="td-rate">' + cliTotalR + '</td>';
                if (showCliTotalOT) html += '<td class="td-rate">' + cliTotalOT + '</td>';
                html += '<td class="td-rate td-subtotal">' + (cliTotalR !== '-' ? cliTotalR : cliDaily) + '</td>';
            }

            // Additional
            if (isAddActive && addColCount > 0) {
                var addAmt = extractVal(tr, '.col-additional-amount');
                var addNote = extractVal(tr, '.col-additional-note');
                if (showAddAmt) html += '<td class="td-add-amt">' + addAmt + '</td>';
                if (showAddNote) html += '<td class="td-add-note">' + addNote + '</td>';
            }

            // Payment Totals
            if (isEmpActive) {
                var empPay = extractVal(tr, '.col-emp-totalrate') || extractVal(tr, '.col-emp-dailyrate');
                html += '<td class="td-payment">' + empPay + '</td>';
            }
            if (isCliActive) {
                var cliPay = extractVal(tr, '.col-cli-totalrate') || extractVal(tr, '.col-cli-dailyrate');
                html += '<td class="td-payment">' + cliPay + '</td>';
            }

            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';

        // Footer HTML
        var pageUrl = window.location.href;
        html += '<div class="report-print-footer">';
        html += '<div class="report-print-footer-info">';
        html += '  <span>Source: ' + escapeHTML(pageUrl) + '</span>';
        html += '  <span>•</span>';
        html += '  <span>Printed: ' + escapeHTML(nowStr) + '</span>';
        html += '</div>';
        html += '<div class="report-print-footer-id">' + escapeHTML(identifier) + '</div>';
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
        document.body.classList.add('report-printing');

        document.querySelectorAll('.filter-dropdown.show, #downloadDropdown.show, #batchUpdateDropdown.show')
            .forEach(function (dd) { dd.classList.remove('show'); });

        return identifier;
    }

    function restoreAfterPrint() {
        if (originalTitle) {
            document.title = originalTitle;
            originalTitle = '';
        }
        document.body.classList.remove('report-printing');

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
