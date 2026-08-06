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

        // 1. Determine active sections
        var isEmpActive = isSectionActive('grpEmployee');
        var isCliActive = isSectionActive('grpClient');
        var isAddActive = isSectionActive('grpAdditional');
        var isDailyActive = isSectionActive('grpDaily');

        // 2. Build Identifier: YYMMDD_YYMMDD_PROJECT-NAME_DAILY_EMPLOYEE_CLIENT...
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

        // 3. Build Header HTML
        var nowStr = new Date().toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

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

        // Helper to extract table rows for a section
        function buildSectionTableHTML(colsConfig) {
            var tbl = '<table class="report-print-table"><thead><tr>';
            colsConfig.forEach(function (c) {
                tbl += '<th>' + escapeHTML(c.title) + '</th>';
            });
            tbl += '</tr></thead><tbody>';

            visibleRows.forEach(function (tr) {
                tbl += '<tr>';
                colsConfig.forEach(function (c) {
                    tbl += '<td>' + c.getCellHTML(tr) + '</td>';
                });
                tbl += '</tr>';
            });

            tbl += '</tbody></table>';
            return tbl;
        }

        // Section 1: Work Summary
        var showStartEnd = isElementVisible(document.querySelector('.col-inouthour'));
        var showPeriod = isElementVisible(document.querySelector('.col-activehour'));

        var summaryCols = [{ title: 'Name', getCellHTML: function (tr) { return sanitizeNameCell(tr.querySelector('.col-name')); } }];
        if (showStartEnd) {
            summaryCols.push({ title: 'Start', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelectorAll('.col-inouthour')[0]); } });
            summaryCols.push({ title: 'End', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelectorAll('.col-inouthour')[1] || tr.querySelector('.col-inouthour')); } });
        }
        if (showPeriod) {
            summaryCols.push({ title: 'Period', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-activehour')); } });
        }
        summaryCols.push({ title: 'Total Days', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-totaldays')); } });
        summaryCols.push({ title: 'Total Hour', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-totalhour')); } });
        summaryCols.push({ title: 'Total Overtime', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-totalovertime')); } });

        html += '<div class="report-print-section">';
        html += '<h2 class="report-print-section-title">Work Summary</h2>';
        html += buildSectionTableHTML(summaryCols);
        html += '</div>';

        // Section 2: Employee Rates (if active)
        if (isEmpActive) {
            var empCols = [{ title: 'Name', getCellHTML: function (tr) { return sanitizeNameCell(tr.querySelector('.col-name')); } }];
            if (isElementVisible(document.querySelector('.col-emp-dailyrate'))) {
                empCols.push({ title: 'Daily Rate', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-emp-dailyrate')); } });
            }
            if (isElementVisible(document.querySelector('.col-emp-rateovertime'))) {
                empCols.push({ title: 'Rate Overtime', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-emp-rateovertime')); } });
            }
            if (isElementVisible(document.querySelector('.col-emp-totalrate'))) {
                empCols.push({ title: 'Total Rate', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-emp-totalrate')); } });
            }
            if (isElementVisible(document.querySelector('.col-emp-totalovertime'))) {
                empCols.push({ title: 'Total Overtime', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-emp-totalovertime')); } });
            }

            html += '<div class="report-print-section">';
            html += '<h2 class="report-print-section-title">Employee Rates</h2>';
            html += buildSectionTableHTML(empCols);
            html += '</div>';
        }

        // Section 3: Client Rates (if active)
        if (isCliActive) {
            var cliCols = [{ title: 'Name', getCellHTML: function (tr) { return sanitizeNameCell(tr.querySelector('.col-name')); } }];
            if (isElementVisible(document.querySelector('.col-cli-dailyrate'))) {
                cliCols.push({ title: 'Daily Rate', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-cli-dailyrate')); } });
            }
            if (isElementVisible(document.querySelector('.col-cli-rateovertime'))) {
                cliCols.push({ title: 'Rate Overtime', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-cli-rateovertime')); } });
            }
            if (isElementVisible(document.querySelector('.col-cli-totalrate'))) {
                cliCols.push({ title: 'Total Rate', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-cli-totalrate')); } });
            }
            if (isElementVisible(document.querySelector('.col-cli-totalovertime'))) {
                cliCols.push({ title: 'Total Overtime', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-cli-totalovertime')); } });
            }

            html += '<div class="report-print-section">';
            html += '<h2 class="report-print-section-title">Client Rates</h2>';
            html += buildSectionTableHTML(cliCols);
            html += '</div>';
        }

        // Section 4: Additional (if active)
        if (isAddActive) {
            var addCols = [{ title: 'Name', getCellHTML: function (tr) { return sanitizeNameCell(tr.querySelector('.col-name')); } }];
            if (isElementVisible(document.querySelector('.col-additional-amount'))) {
                addCols.push({ title: 'Amount', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-additional-amount')); } });
            }
            if (isElementVisible(document.querySelector('.col-additional-note'))) {
                addCols.push({ title: 'Note', getCellHTML: function (tr) { return sanitizeTextCell(tr.querySelector('.col-additional-note')); } });
            }

            html += '<div class="report-print-section">';
            html += '<h2 class="report-print-section-title">Additional</h2>';
            html += buildSectionTableHTML(addCols);
            html += '</div>';
        }

        // Section 5: Daily Attendance (if active)
        if (isDailyActive) {
            var visibleDateHeaders = getVisibleDateHeaders();
            var dailyCols = [{ title: 'Name', getCellHTML: function (tr) { return sanitizeNameCell(tr.querySelector('.col-name')); } }];

            visibleDateHeaders.forEach(function (th) {
                var dateVal = th.dataset.date || '';
                var textSpan = th.querySelector('span');
                var headerTitle = textSpan ? textSpan.textContent.trim() : th.textContent.trim();

                dailyCols.push({
                    title: headerTitle,
                    getCellHTML: function (tr) {
                        var dayTd = tr.querySelector('td.day-col[data-date="' + dateVal + '"]');
                        if (!dayTd) {
                            var allDayTds = Array.from(tr.querySelectorAll('td.day-col')).filter(isElementVisible);
                            var idx = visibleDateHeaders.indexOf(th);
                            dayTd = allDayTds[idx];
                        }
                        return dayTd ? sanitizeDailyCell(dayTd) : '-';
                    }
                });
            });

            html += '<div class="report-print-section">';
            html += '<h2 class="report-print-section-title">Daily Attendance</h2>';
            html += buildSectionTableHTML(dailyCols);
            html += '</div>';
        }

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
