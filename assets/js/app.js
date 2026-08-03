/* === Auth Guard === */
(function() {
    if (!sessionStorage.getItem('feriiz_user')) {
        window.location.href = 'login.html';
    }
})();

function feriizLogout() {
    sessionStorage.removeItem('feriiz_user');
    window.location.href = 'login.html';
}

/* === Application Notifications ===
   Shared non-blocking feedback for actions across every Feriiz page. */
(function () {
    var DEFAULT_TITLES = {
        success: 'Changes saved',
        info: 'Information',
        warning: 'Please check',
        error: 'Something went wrong'
    };
    var ICONS = {
        success: 'fa-check',
        info: 'fa-info',
        warning: 'fa-exclamation',
        error: 'fa-xmark'
    };

    function getRegion() {
        var region = document.getElementById('feriizNotificationRegion');
        if (region) return region;

        region = document.createElement('div');
        region.id = 'feriizNotificationRegion';
        region.className = 'notification-region';
        region.setAttribute('role', 'region');
        region.setAttribute('aria-label', 'Notifications');
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
        return region;
    }

    function dismiss(toast) {
        if (!toast || toast.classList.contains('is-leaving')) return;
        toast.classList.add('is-leaving');
        window.setTimeout(function () { toast.remove(); }, 180);
    }

    function show(options) {
        var config = typeof options === 'string' ? { message: options } : (options || {});
        var type = Object.prototype.hasOwnProperty.call(DEFAULT_TITLES, config.type) ? config.type : 'info';
        var duration = Number(config.duration) > 0 ? Number(config.duration) : 5000;
        var region = getRegion();

        // Keep feedback noticeable without covering the page with old messages.
        while (region.children.length >= 3) {
            region.firstElementChild.remove();
        }

        var toast = document.createElement('div');
        toast.className = 'notification-toast notification-toast--' + type;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        var icon = document.createElement('span');
        icon.className = 'notification-toast__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<i class="fa-solid ' + ICONS[type] + '"></i>';

        var content = document.createElement('div');
        content.className = 'notification-toast__content';
        var title = document.createElement('strong');
        title.className = 'notification-toast__title';
        title.textContent = config.title || DEFAULT_TITLES[type];
        var message = document.createElement('p');
        message.className = 'notification-toast__message';
        message.textContent = config.message || '';
        content.appendChild(title);
        if (message.textContent) content.appendChild(message);

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'notification-toast__close';
        close.setAttribute('aria-label', 'Dismiss notification');
        close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        close.addEventListener('click', function () { dismiss(toast); });

        var progress = document.createElement('span');
        progress.className = 'notification-toast__progress';
        progress.style.animationDuration = duration + 'ms';

        toast.appendChild(icon);
        toast.appendChild(content);
        toast.appendChild(close);
        toast.appendChild(progress);
        region.appendChild(toast);

        window.setTimeout(function () { dismiss(toast); }, duration);
        return toast;
    }

    window.FeriizNotify = {
        show: show,
        success: function (message, title) { return show({ type: 'success', title: title, message: message }); },
        info: function (message, title) { return show({ type: 'info', title: title, message: message }); },
        warning: function (message, title) { return show({ type: 'warning', title: title, message: message }); },
        error: function (message, title) { return show({ type: 'error', title: title, message: message, duration: 7000 }); }
    };
})();

/* === Sidebar Renderer ===
   Single source for sidebar markup. Pages opt in by adding
   <body data-page="KEY"> and an empty <aside class="sidebar"></aside>. */
(function () {
    var PAGE_MAP = {
        'dashboard':                 { main: 'dashboard' },
        'projects':                  { main: 'projects-flat' },
        'employees':                 { main: 'employees' },
        'calendar':                  { main: 'calendar' },
        'my-account':                { main: 'my-account', logout: true },
        'project-activity':          { main: 'projects-group', sub: 'activity' },
        'project-attendance':        { main: 'projects-group', sub: 'activity' },
        'project-report':            { main: 'projects-group', sub: 'report' },
        'project-calendar':          { main: 'calendar' },
        'project-requests':          { main: 'projects-group', sub: 'requests' },
        'employee-detail':           { main: 'employees' },
        'employee-attendance':       { main: 'employees' },
        'employee-projects':         { main: 'employees' },
        'employee-report':           { main: 'projects-group', sub: 'report' },
        'employee-personal-request': { main: 'projects-group', sub: 'requests' }
    };

    function cls(active) { return active ? ' class="active"' : ''; }

    function render() {
        var page = document.body && document.body.getAttribute('data-page');
        var aside = document.querySelector('aside.sidebar');
        if (!page || !aside) return;
        var cfg = PAGE_MAP[page] || {};
        var inGroup = cfg.main === 'projects-group';

        aside.innerHTML =
            '<div class="sidebar-logo">' +
                '<img src="assets/images/logo.png" alt="Feriiz" class="sidebar-logo-img">' +
            '</div>' +
            '<nav class="sidebar-nav">' +
                '<a href="index.html"' + cls(cfg.main === 'dashboard') + '>' +
                    '<i class="fa-solid fa-table-cells-large"></i><span class="nav-label">Dashboard</span>' +
                '</a>' +
                '<div class="nav-group' + (inGroup ? ' open' : '') + '">' +
                    '<a href="projects.html"' + cls(inGroup || cfg.main === 'projects-flat') + '>' +
                        '<i class="fa-solid fa-clipboard"></i><span class="nav-label">Projects</span>' +
                    '</a>' +
                    '<div class="nav-submenu">' +
                        '<a href="project_employees.html"' + cls(cfg.sub === 'activity') + '>' +
                            '<i class="fa-solid fa-clock"></i><span class="nav-label">Activity</span>' +
                        '</a>' +
                        '<a href="project_report.html"' + cls(cfg.sub === 'report') + '>' +
                            '<i class="fa-regular fa-file-lines"></i><span class="nav-label">Report</span>' +
                        '</a>' +
                        '<a href="employee_request.html"' + cls(cfg.sub === 'requests') + '>' +
                            '<i class="fa-solid fa-clipboard-list"></i><span class="nav-label">Requests</span>' +
                        '</a>' +
                    '</div>' +
                '</div>' +
                '<a href="employees.html"' + cls(cfg.main === 'employees') + '>' +
                    '<i class="fa-solid fa-users"></i><span class="nav-label">Employees</span>' +
                '</a>' +
                '<a href="calendar.html"' + cls(cfg.main === 'calendar') + '>' +
                    '<i class="fa-regular fa-calendar"></i><span class="nav-label">Calendar</span>' +
                '</a>' +
                '<a href="my-account.html"' + cls(cfg.main === 'my-account') + '>' +
                    '<i class="fa-regular fa-user"></i><span class="nav-label">My Account</span>' +
                '</a>' +
                (cfg.logout
                    ? '<a href="#" onclick="feriizLogout(); return false;" class="nav-logout">' +
                          '<i class="fa-solid fa-right-from-bracket"></i><span class="nav-label">Logout</span>' +
                      '</a>'
                    : '') +
            '</nav>';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();

/* === Mobile Navigation === */
(function() {
    if (window.innerWidth > 768) return;
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Create hamburger button
    var btn = document.createElement('button');
    btn.className = 'mobile-menu-btn';
    btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    btn.setAttribute('aria-label', 'Menu');
    document.body.appendChild(btn);

    // Create overlay
    var overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    function openMenu() {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('show');
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    }

    function closeMenu() {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('show');
        btn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    }

    btn.addEventListener('click', function() {
        if (sidebar.classList.contains('mobile-open')) closeMenu();
        else openMenu();
    });

    overlay.addEventListener('click', closeMenu);
})();

(function () {
    function normalizeOccupation(value) {
        return String(value || '').trim().toLowerCase();
    }

    function isAllOccupation(value) {
        const normalized = normalizeOccupation(value);
        return !normalized || normalized === 'all occupations';
    }

    function updateOccupationTrigger(select) {
        const wrapper = select.nextElementSibling;
        if (!wrapper || !wrapper.classList.contains('multi-occ-filter')) return;

        const triggerLabel = wrapper.querySelector('.multi-occ-filter-text');
        const selected = [...select.options].filter(option => option.selected && !isAllOccupation(option.value || option.textContent));

        if (!triggerLabel) return;
        if (selected.length === 0) {
            triggerLabel.textContent = 'All Occupations';
        } else if (selected.length === 1) {
            triggerLabel.textContent = selected[0].textContent.trim();
        } else {
            triggerLabel.textContent = `${selected.length} Occupations`;
        }
    }

    function syncOccupationSelect(select) {
        const wrapper = select.nextElementSibling;
        if (!wrapper || !wrapper.classList.contains('multi-occ-filter')) return;

        const selectedValues = [...wrapper.querySelectorAll('.multi-occ-option:not(.is-all):checked')].map(input => input.value);
        [...select.options].forEach(option => {
            const value = normalizeOccupation(option.value || option.textContent);
            option.selected = selectedValues.length === 0 ? isAllOccupation(value) : selectedValues.includes(value);
        });

        const allInput = wrapper.querySelector('.multi-occ-option.is-all');
        if (allInput) allInput.checked = selectedValues.length === 0;
        updateOccupationTrigger(select);
    }

    function resetOccupationFilter(root) {
        const select = (root || document).querySelector('.filter-occ');
        if (!select) return;

        const wrapper = select.nextElementSibling;
        if (wrapper && wrapper.classList.contains('multi-occ-filter')) {
            wrapper.querySelectorAll('.multi-occ-option').forEach(input => {
                input.checked = input.classList.contains('is-all');
            });
        }

        [...select.options].forEach((option, index) => {
            option.selected = index === 0 || isAllOccupation(option.value || option.textContent);
        });
        updateOccupationTrigger(select);
    }

    function getOccupationValues(root) {
        const select = (root || document).querySelector('.filter-occ');
        if (!select) return [];

        return [...select.options]
            .filter(option => option.selected)
            .map(option => normalizeOccupation(option.value || option.textContent))
            .filter(value => !isAllOccupation(value));
    }

    function initOccupationFilter(select) {
        if (!select || select.dataset.multiOccupationReady === 'true') return;

        select.dataset.multiOccupationReady = 'true';
        select.multiple = true;
        select.classList.add('multi-occ-native');

        const options = [...select.options].map(option => ({
            label: option.textContent.trim(),
            value: normalizeOccupation(option.value || option.textContent),
            isAll: isAllOccupation(option.value || option.textContent)
        }));
        const occupationOptions = options.filter(option => !option.isAll);

        const wrapper = document.createElement('div');
        wrapper.className = 'multi-occ-filter';
        wrapper.innerHTML = `
            <button type="button" class="multi-occ-trigger">
                <span class="multi-occ-filter-text">All Occupations</span>
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div class="multi-occ-menu">
                <label class="multi-occ-row">
                    <input type="checkbox" class="multi-occ-option is-all" checked value="">
                    <span>All Occupations</span>
                </label>
                ${occupationOptions.map(option => `
                    <label class="multi-occ-row">
                        <input type="checkbox" class="multi-occ-option" value="${option.value}">
                        <span>${option.label}</span>
                    </label>
                `).join('')}
            </div>
        `;
        select.insertAdjacentElement('afterend', wrapper);
        resetOccupationFilter(select.parentElement || document);

        const trigger = wrapper.querySelector('.multi-occ-trigger');
        const menu = wrapper.querySelector('.multi-occ-menu');

        trigger.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            document.querySelectorAll('.multi-occ-menu.show').forEach(openMenu => {
                if (openMenu !== menu) openMenu.classList.remove('show');
            });
            menu.classList.toggle('show');
        });

        wrapper.addEventListener('click', event => event.stopPropagation());

        wrapper.querySelectorAll('.multi-occ-option').forEach(input => {
            input.addEventListener('change', () => {
                if (input.classList.contains('is-all') && input.checked) {
                    wrapper.querySelectorAll('.multi-occ-option:not(.is-all)').forEach(child => {
                        child.checked = false;
                    });
                } else if (!input.classList.contains('is-all')) {
                    const allInput = wrapper.querySelector('.multi-occ-option.is-all');
                    if (allInput) allInput.checked = false;
                }
                syncOccupationSelect(select);
            });
        });
    }

    function populateOccupationOptions(select) {
        // If FERIIZ_DATA provides an occupation list, rebuild the <option>s
        // so pages don't need to hard-code them.
        var data = window.FERIIZ_DATA;
        if (!data || !data.occupations || !data.occupations.length) return;
        var current = select.value;
        select.innerHTML = '';
        var allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'All Occupations';
        select.appendChild(allOpt);
        data.occupations.forEach(function (occ) {
            var opt = document.createElement('option');
            opt.textContent = occ;
            select.appendChild(opt);
        });
        select.value = current;
    }

    function initOccupationFilters() {
        var selects = document.querySelectorAll('select.filter-occ');
        if (!selects.length) return;
        var ready = window.FERIIZ_DATA && window.FERIIZ_DATA.ready;
        var run = function () {
            selects.forEach(function (s) { populateOccupationOptions(s); });
            selects.forEach(initOccupationFilter);
        };
        if (ready) ready.then(run); else run();
    }

    window.FeriizFilters = Object.assign(window.FeriizFilters || {}, {
        getOccupationValues,
        resetOccupationFilter
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOccupationFilters);
    } else {
        initOccupationFilters();
    }

    document.addEventListener('click', () => {
        document.querySelectorAll('.multi-occ-menu.show').forEach(menu => menu.classList.remove('show'));
    });
})();

(function () {
    function getDropdown(toggle) {
        const container = toggle.closest('.cal-filter-wrap, .feriiz-u-014, .page-actions, .report-actions, .toolbar-actions') || toggle.parentElement;
        return container ? container.querySelector('.filter-dropdown, .cal-filter-dropdown') : null;
    }

    function closeDropdown(dropdown, toggle) {
        if (!dropdown) return;
        dropdown.classList.remove('show');
        dropdown.style.display = '';
        if (toggle) toggle.classList.remove('active');
    }

    function closeAllDropdowns(exceptDropdown) {
        document.querySelectorAll('.filter-dropdown.show, .cal-filter-dropdown.show').forEach(dropdown => {
            if (dropdown === exceptDropdown) return;
            const owner = dropdown.parentElement?.querySelector('.filter-toggle-btn, .cal-filter-btn, .col-toggle-btn');
            closeDropdown(dropdown, owner);
        });
    }

    document.addEventListener('click', event => {
        const toggle = event.target.closest('.filter-toggle-btn, .cal-filter-btn, .col-toggle-btn');
        if (toggle) {
            const dropdown = getDropdown(toggle);
            if (!dropdown) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            const isOpen = dropdown.classList.contains('show') || dropdown.style.display === 'block';
            closeAllDropdowns(dropdown);
            dropdown.style.display = '';
            dropdown.classList.toggle('show', !isOpen);
            toggle.classList.toggle('active', !isOpen);
            return;
        }

        const actionButton = event.target.closest('.filter-apply-btn, .filter-clear-btn, .f-btn-apply, .f-btn-clear');
        if (actionButton) {
            const dropdown = actionButton.closest('.filter-dropdown, .cal-filter-dropdown');
            const owner = dropdown?.parentElement?.querySelector('.filter-toggle-btn, .cal-filter-btn, .col-toggle-btn');
            closeDropdown(dropdown, owner);
            return;
        }

        if (event.target.closest('.filter-dropdown, .cal-filter-dropdown')) {
            return;
        }

        closeAllDropdowns();
    }, true);
})();

(function () {
    const reportRows = [
        { date: 'Friday, 01 May 2026', request: 'Hari Buruh Internasional / Pekerja', muted: true },
        { date: 'Saturday, 02 May 2026', muted: true },
        { date: 'Sunday, 03 May 2026', muted: true },
        { date: 'Monday, 04 May 2026', scheduled: true, attendance: ['09:32:31', '18:37:10', '09:04:39'] },
        { date: 'Tuesday, 05 May 2026', scheduled: true, attendance: ['09:20:54', '18:04:02', '08:43:08'], absent: '-00:16:52' },
        {
            date: 'Wednesday, 06 May 2026',
            scheduled: true,
            attendance: ['-', '-', '09:00:00'],
            request: 'Sick Leave',
            note: 'Pagi bu, hari ini saya izin tidak dapat hadir ke kantor dikarenakan saat bangun tidur kepala saya terasa sempoyongan, mual dan badan terasa sakit semua, adapun pekerjaan kemarin akan saya kerjakan. Semoga Ibu dapat memahami dan mengerti kondisi saya saat ini. Terimakasih.',
            requestRow: true
        },
        { date: 'Thursday, 07 May 2026', scheduled: true, attendance: ['08:59:52', '20:29:39', '11:29:47'] },
        { date: 'Friday, 08 May 2026', scheduled: true, attendance: ['10:03:10', '18:05:11', '08:02:01'], absent: '-00:57:59' },
        { date: 'Saturday, 09 May 2026', muted: true },
        { date: 'Sunday, 10 May 2026', muted: true },
        { date: 'Monday, 11 May 2026', scheduled: true, attendance: ['09:29:34', '18:28:53', '08:59:19'], absent: '-00:00:41' },
        { date: 'Tuesday, 12 May 2026', scheduled: true, attendance: ['09:22:52', '18:48:05', '09:25:13'] },
        { date: 'Wednesday, 13 May 2026', scheduled: true, attendance: ['09:21:04', '17:55:41', '08:34:37'], absent: '-00:25:23' },
        { date: 'Thursday, 14 May 2026', request: 'Kenaikan Isa Al Masih', muted: true },
        { date: 'Friday, 15 May 2026', request: 'Cuti Bersama Kenaikan Isa Al Masih', muted: true },
        { date: 'Saturday, 16 May 2026', muted: true },
        { date: 'Sunday, 17 May 2026', muted: true },
        { date: 'Monday, 18 May 2026', scheduled: true, attendance: ['09:18:24', '18:32:01', '09:13:37'] },
        {
            date: 'Tuesday, 19 May 2026',
            scheduled: true,
            attendance: ['-', '-', '09:00:00'],
            request: 'Annual Leave',
            note: 'Pagi Bu, hari ini saya cuti mendadak dikarenakan istri saya sedang sakit dan membutuhkan pendampingan saya. Adapun pekerjaan yang kemarin belum diselesaikan. Akan saya selesaikan. Terimakasih.',
            requestRow: true
        },
        { date: 'Wednesday, 20 May 2026', scheduled: true, attendance: ['09:50:16', '17:54:57', '08:04:41'], absent: '-00:55:19' },
        { date: 'Thursday, 21 May 2026', scheduled: true, attendance: ['09:16:13', '18:06:30', '08:50:17'], absent: '-00:09:43' },
        { date: 'Friday, 22 May 2026', scheduled: true, attendance: ['09:24:59', '-', '-'], absent: '-09:00:00' },
        { date: 'Saturday, 23 May 2026', muted: true },
        { date: 'Sunday, 24 May 2026', muted: true },
        { date: 'Monday, 25 May 2026', scheduled: true, attendance: ['-', '-', '-'], absent: '-09:00:00' },
        { date: 'Tuesday, 26 May 2026', scheduled: true, attendance: ['-', '-', '-'], absent: '-09:00:00' },
        { date: 'Wednesday, 27 May 2026', request: 'Idul Adha (Lebaran Haji) (belum pasti)', muted: true },
        { date: 'Thursday, 28 May 2026', request: 'Idul Adha (Lebaran Haji)', muted: true },
        { date: 'Friday, 29 May 2026', scheduled: true, attendance: ['-', '-', '-'], absent: '-09:00:00' },
        { date: 'Saturday, 30 May 2026', muted: true },
        { date: 'Sunday, 31 May 2026', request: 'Hari Raya Waisak (belum pasti)', muted: true }
    ];

    function cell(value, className) {
        return `<td class="${className || 'feriiz-u-073'}">${value || '-'}</td>`;
    }

    function scheduleCells(row) {
        if (!row.scheduled) {
            return ['-', '-', '-'].map(value => cell(value, 'feriiz-u-079')).join('');
        }

        return [
            cell('08:00:00'),
            cell('17:00:00'),
            cell('09:00:00')
        ].join('');
    }

    function attendanceCells(row) {
        const values = row.attendance || ['-', '-', '-'];
        return values.map(value => cell(value, value === '-' ? 'feriiz-u-079' : 'feriiz-u-073')).join('');
    }

    function renderAttendanceReport() {
        document.querySelectorAll('.attendance-table tbody').forEach(tbody => {
            const rows = reportRows.map(row => {
                const rowClass = [
                    row.muted ? 'attendance-muted-row' : '',
                    row.requestRow ? 'attendance-request-row' : ''
                ].filter(Boolean).join(' ');
                const absentClass = row.absent && row.absent !== '-' ? 'feriiz-u-083' : 'feriiz-u-079';

                return `
                    <tr class="${rowClass}">
                        <td class="feriiz-u-078">${row.date}</td>
                        ${scheduleCells(row)}
                        ${attendanceCells(row)}
                        ${cell(row.absent || '-', absentClass)}
                        ${cell(row.request || '-', row.request ? 'feriiz-u-082' : 'feriiz-u-079')}
                        ${cell(row.note || '-', 'feriiz-u-080')}
                    </tr>
                `;
            }).join('');

            tbody.innerHTML = `${rows}
                <tr class="feriiz-u-084 attendance-total-row">
                    <td class="feriiz-u-085"></td>
                    <td class="feriiz-u-085"></td>
                    <td class="feriiz-u-085"></td>
                    <td class="feriiz-u-086">189:00:00</td>
                    <td class="feriiz-u-085"></td>
                    <td class="feriiz-u-085"></td>
                    <td class="feriiz-u-086">108:27:19</td>
                    <td class="feriiz-u-087">-38:45:57</td>
                    <td colspan="2" class="feriiz-u-088"></td>
                </tr>`;
        });

        document.querySelectorAll('.attendance-table-container .pagination').forEach(pagination => {
            pagination.remove();
        });
    }

    const appliedAttendanceFilters = { dateStart: '', dateEnd: '' };

    function formatInputDate(date) {
        return date.toISOString().slice(0, 10);
    }

    function setAttendancePeriodDraft(select, dateInputs) {
        const value = select.value;
        const now = new Date();
        let start = '';
        let end = '';

        if (value === 'today') {
            start = end = formatInputDate(now);
        } else if (value === 'yesterday') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            start = end = formatInputDate(yesterday);
        } else if (value === 'this_week') {
            const monday = new Date(now);
            monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
            start = formatInputDate(monday);
            end = formatInputDate(now);
        } else if (value === 'last_week') {
            const monday = new Date(now);
            monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) - 7);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            start = formatInputDate(monday);
            end = formatInputDate(sunday);
        } else if (value === 'this_month') {
            start = formatInputDate(new Date(now.getFullYear(), now.getMonth(), 1));
            end = formatInputDate(now);
        } else if (value === 'last_month') {
            start = formatInputDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
            end = formatInputDate(new Date(now.getFullYear(), now.getMonth(), 0));
        } else if (value === 'this_year') {
            start = formatInputDate(new Date(now.getFullYear(), 0, 1));
            end = formatInputDate(now);
        }

        dateInputs[0].value = start;
        dateInputs[1].value = end;
    }

    function applyAttendanceFilters() {
        const searchInput = document.querySelector('.page-actions input[placeholder*="Search attendance"]');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const startTime = appliedAttendanceFilters.dateStart
            ? new Date(appliedAttendanceFilters.dateStart + 'T00:00:00').getTime()
            : Number.NEGATIVE_INFINITY;
        const endTime = appliedAttendanceFilters.dateEnd
            ? new Date(appliedAttendanceFilters.dateEnd + 'T23:59:59').getTime()
            : Number.POSITIVE_INFINITY;

        document.querySelectorAll('.attendance-table tbody tr:not(.attendance-total-row)').forEach(row => {
            const dateCell = row.querySelector('td:first-child');
            if (!dateCell) return;
            const rowTime = new Date(dateCell.textContent.trim()).getTime();
            const matchesDate = !Number.isNaN(rowTime) && rowTime >= startTime && rowTime <= endTime;
            const matchesSearch = !query || row.textContent.toLowerCase().includes(query);
            row.hidden = !(matchesDate && matchesSearch);
        });
    }

    function initAttendanceFilters() {
        if (!document.querySelector('.attendance-table')) return;

        const dateInputs = [...document.querySelectorAll('.filter-date')];
        const periodSelect = document.querySelector('.filter-period');
        const applyButton = document.querySelector('.filter-apply-btn');
        const clearButton = document.querySelector('.filter-clear-btn');
        const searchInput = document.querySelector('.page-actions input[placeholder*="Search attendance"]');

        if (periodSelect && dateInputs.length >= 2) {
            periodSelect.addEventListener('change', function () {
                setAttendancePeriodDraft(periodSelect, dateInputs);
            });
        }

        if (applyButton && dateInputs.length >= 2) {
            applyButton.addEventListener('click', function () {
                appliedAttendanceFilters.dateStart = dateInputs[0].value;
                appliedAttendanceFilters.dateEnd = dateInputs[1].value;
                applyAttendanceFilters();
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', function () {
                dateInputs.forEach(input => { input.value = ''; });
                if (periodSelect) periodSelect.value = 'custom';
                appliedAttendanceFilters.dateStart = '';
                appliedAttendanceFilters.dateEnd = '';
                applyAttendanceFilters();
            });
        }

        if (searchInput) {
            let timer;
            searchInput.addEventListener('input', function () {
                clearTimeout(timer);
                timer = setTimeout(applyAttendanceFilters, 180);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        renderAttendanceReport();
        initAttendanceFilters();
    });
})();

(function () {
    function handleReportTableScroll() {
        const wraps = document.querySelectorAll('.report-table-wrap');
        wraps.forEach(wrap => {
            const updateShadow = () => {
                if (wrap.scrollLeft > 0) {
                    wrap.classList.add('table-scrolled');
                } else {
                    wrap.classList.remove('table-scrolled');
                }
            };
            wrap.addEventListener('scroll', updateShadow, { passive: true });
            updateShadow(); // Run once initially
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handleReportTableScroll);
    } else {
        handleReportTableScroll();
    }
})();

/* ============================================================
   FERIIZ HELPERS — generic UI utilities reused across pages.
   Use these instead of writing new modal/search/filter logic
   inline. Old inline code stays for now; migrate as you touch.
   ============================================================ */
window.FeriizModal = {
    open: function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.add('show');
        document.body.style.overflow = 'hidden';
        if (!el.dataset.feriizBound) {
            el.dataset.feriizBound = '1';
            el.addEventListener('click', function (e) {
                if (e.target === el) window.FeriizModal.close(id);
            });
        }
    },
    close: function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('show');
        document.body.style.overflow = '';
    }
};

window.FeriizSearch = {
    /* Wires an <input> to filter rows by text content.
       opts: { input, rows, getText? } — getText(row) returns the string to match. */
    bind: function (opts) {
        var input = opts.input;
        var rows = opts.rows;
        var getText = opts.getText || function (r) { return r.textContent || ''; };
        if (!input || !rows) return;
        input.addEventListener('input', function () {
            var q = (input.value || '').trim().toLowerCase();
            rows.forEach(function (row) {
                var text = getText(row).toLowerCase();
                row.style.display = (!q || text.indexOf(q) !== -1) ? '' : 'none';
            });
        });
    }
};

/* Auto-fill alt text on employee avatars so screen readers
   announce the name instead of an empty image. */
(function () {
    function fillAlts() {
        var cells = document.querySelectorAll('.employee-cell');
        for (var i = 0; i < cells.length; i++) {
            var avatar = cells[i].querySelector('.employee-avatar, img');
            var name = cells[i].querySelector('.employee-name');
            if (avatar && name && !avatar.alt) {
                avatar.alt = (name.textContent || '').trim();
            }
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fillAlts);
    } else {
        fillAlts();
    }
})();

window.FeriizFilterBar = {
    /* Wires a filter toggle button + dropdown panel with outside-click close.
       opts: { toggle, dropdown, apply?, clear?, onApply?, onClear? } */
    init: function (opts) {
        var toggle = opts.toggle;
        var dropdown = opts.dropdown;
        if (!toggle || !dropdown) return;
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
        document.addEventListener('click', function (e) {
            if (!dropdown.contains(e.target) && !toggle.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
        if (opts.apply && opts.onApply) opts.apply.addEventListener('click', opts.onApply);
        if (opts.clear && opts.onClear) opts.clear.addEventListener('click', opts.onClear);
    }
};
