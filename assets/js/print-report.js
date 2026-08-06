(function () {
    'use strict';

    var printButton = null;
    var buttonRestoreTimer = null;

    function isVisible(element) {
        if (!element || element.hidden || element.classList.contains('day-col-hidden')) return false;
        return window.getComputedStyle(element).display !== 'none';
    }

    function getVisibleRows() {
        return Array.from(document.querySelectorAll('.report-table tbody tr')).filter(isVisible);
    }

    function formatDateLabel(dateValue) {
        if (!dateValue) return '';
        var parts = dateValue.split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return dateValue;
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function getVisibleDateRange() {
        var visibleHeaders = Array.from(document.querySelectorAll('.report-table thead th.day-col'))
            .filter(isVisible)
            .map(function (header) { return header.dataset.date || ''; })
            .filter(Boolean)
            .sort();

        if (visibleHeaders.length === 0) return 'Current view';
        if (visibleHeaders.length === 1) return formatDateLabel(visibleHeaders[0]);
        return formatDateLabel(visibleHeaders[0]) + ' - ' + formatDateLabel(visibleHeaders[visibleHeaders.length - 1]);
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
                subject: employeeName,
                context: projectName
            };
        }

        return {
            title: 'Project Report',
            subject: projectName,
            context: 'Attendance and payroll summary'
        };
    }

    function getFilterSummary() {
        var values = [];
        var appliedChips = Array.from(document.querySelectorAll('#filterIndicatorChips .filter-indicator-chip'))
            .map(function (chip) {
                var clone = chip.cloneNode(true);
                clone.querySelectorAll('button').forEach(function (button) { button.remove(); });
                return clone.textContent.trim();
            })
            .filter(Boolean);
        var searchInput = document.getElementById('reportSearch');

        if (appliedChips.length) values.push(appliedChips.join(' | '));
        if (searchInput && searchInput.value.trim()) values.push('Search: ' + searchInput.value.trim());

        return values.length ? values.join(' | ') : 'No additional filters';
    }

    function ensurePrintHeader() {
        var main = document.querySelector('main.main-content');
        var tableWrap = document.querySelector('.report-table-wrap');
        if (!main || !tableWrap) return null;

        var header = document.getElementById('reportPrintHeader');
        if (!header) {
            header = document.createElement('section');
            header.id = 'reportPrintHeader';
            header.className = 'report-print-header';
            header.setAttribute('aria-hidden', 'true');
            header.innerHTML =
                '<div class="report-print-brand">FERIIZ</div>' +
                '<div class="report-print-heading">' +
                    '<h1 id="reportPrintTitle"></h1>' +
                    '<p id="reportPrintSubject"></p>' +
                '</div>' +
                '<dl class="report-print-meta">' +
                    '<div><dt>Period</dt><dd id="reportPrintPeriod"></dd></div>' +
                    '<div><dt>Rows</dt><dd id="reportPrintRows"></dd></div>' +
                    '<div><dt>Generated</dt><dd id="reportPrintGenerated"></dd></div>' +
                '</dl>' +
                '<p class="report-print-filter" id="reportPrintFilter"></p>';
            main.insertBefore(header, tableWrap);
        }

        return header;
    }

    function updatePrintHeader() {
        var header = ensurePrintHeader();
        if (!header) return;

        var context = getReportContext();
        var rowCount = getVisibleRows().length;
        var generated = new Date().toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        document.getElementById('reportPrintTitle').textContent = context.title;
        document.getElementById('reportPrintSubject').textContent = context.subject + ' | ' + context.context;
        document.getElementById('reportPrintPeriod').textContent = getVisibleDateRange();
        document.getElementById('reportPrintRows').textContent = rowCount + (rowCount === 1 ? ' record' : ' records');
        document.getElementById('reportPrintGenerated').textContent = generated;
        document.getElementById('reportPrintFilter').textContent = getFilterSummary();
    }

    function setButtonPreparing(isPreparing) {
        if (!printButton) return;
        clearTimeout(buttonRestoreTimer);
        printButton.disabled = isPreparing;
        printButton.classList.toggle('is-preparing', isPreparing);
        printButton.innerHTML = isPreparing
            ? '<i class="fa-solid fa-spinner fa-spin"></i><span>Preparing</span>'
            : '<i class="fa-solid fa-print"></i><span>Print</span>';
    }

    function preparePrint() {
        updatePrintHeader();
        document.body.classList.add('report-printing');
        document.querySelectorAll('.filter-dropdown.show, #downloadDropdown.show, #batchUpdateDropdown.show')
            .forEach(function (dropdown) { dropdown.classList.remove('show'); });
    }

    function finishPrint() {
        document.body.classList.remove('report-printing');
        setButtonPreparing(false);
    }

    function printCurrentReport() {
        var rows = getVisibleRows();
        if (rows.length === 0) {
            if (window.FeriizNotify) {
                window.FeriizNotify.warning('No report rows match the active filters.', 'Nothing to print');
            }
            return;
        }

        setButtonPreparing(true);
        preparePrint();

        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
                window.print();
                buttonRestoreTimer = window.setTimeout(finishPrint, 600);
            });
        });
    }

    function init() {
        printButton = document.getElementById('reportPrintBtn');
        if (!printButton || !document.querySelector('.report-table')) return;

        ensurePrintHeader();
        printButton.addEventListener('click', printCurrentReport);
        window.addEventListener('beforeprint', preparePrint);
        window.addEventListener('afterprint', finishPrint);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
