/* === Auth Guard === */
(function() {
    if (!localStorage.getItem('feriiz_user')) {
        window.location.href = 'login.html';
    }
})();

function feriizLogout() {
    localStorage.removeItem('feriiz_user');
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

/* === Workspaces ===
   A workspace is what the backend calls a "partner": the company whose
   projects and employees you are looking at. The switcher sits at the bottom
   of the sidebar; partner.html lists them ("Workspaces"). The choice is kept
   in localStorage. In this prototype every workspace shows the same demo
   dataset — switching only changes the label until the API filters by partner. */
(function () {
    var WORKSPACES = [
        { id: '1629712785796FJLXHTP', name: 'Arcon & Anomali', createdAt: '06 September 2021 - 00:00', updatedAt: '-' },
        // Second entry is demo-only, so the switch can be tried out.
        { id: '1700000000000DEMOWSP', name: 'Anomali Digital', createdAt: '14 November 2023 - 09:00', updatedAt: '-' }
    ];
    var STORAGE_KEY = 'feriiz_workspace';
    var menu = null;
    var activeButton = null;

    function current() {
        var id = null;
        try { id = localStorage.getItem(STORAGE_KEY); } catch (e) {}
        return WORKSPACES.filter(function (w) { return w.id === id; })[0] || WORKSPACES[0];
    }

    function initials(name) {
        var words = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
        return ((words[0] || '?')[0] + ((words[1] || '')[0] || '')).toUpperCase();
    }

    function paint(button) {
        var ws = current();
        button.querySelector('.workspace-avatar').textContent = initials(ws.name);
        button.querySelector('.workspace-name').textContent = ws.name;
        button.title = 'Workspace: ' + ws.name;
    }

    function closeMenu() {
        if (!menu) return;
        menu.remove();
        menu = null;
        if (activeButton) {
            activeButton.setAttribute('aria-expanded', 'false');
            var sidebar = activeButton.closest('.sidebar');
            if (sidebar) sidebar.classList.remove('is-pinned');
            activeButton.focus();
        }
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', closeMenu);
    }

    function onOutside(e) {
        if (menu && !menu.contains(e.target) && !(activeButton && activeButton.contains(e.target))) closeMenu();
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
        if (!menu || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
        var items = Array.prototype.slice.call(menu.querySelectorAll('[role^="menuitem"]'));
        var i = items.indexOf(document.activeElement);
        e.preventDefault();
        var next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next].focus();
    }

    function choose(ws) {
        var before = current();
        try { localStorage.setItem(STORAGE_KEY, ws.id); } catch (e) {}
        closeMenu();
        document.querySelectorAll('.workspace-switch').forEach(paint);
        if (ws.id !== before.id && window.FeriizNotify) {
            window.FeriizNotify.success('You are now working in ' + ws.name + '.', 'Workspace switched');
        }
    }

    function openMenu(button) {
        if (menu) { closeMenu(); return; }
        activeButton = button;
        var sidebar = button.closest('.sidebar');
        if (sidebar) sidebar.classList.add('is-pinned');   // keep the rail expanded while choosing

        var ws = current();
        menu = document.createElement('div');
        menu.className = 'workspace-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Workspaces');

        var title = document.createElement('div');
        title.className = 'workspace-menu-title';
        title.textContent = 'Switch workspace';
        menu.appendChild(title);

        WORKSPACES.forEach(function (w) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'workspace-menu-item';
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', w.id === ws.id ? 'true' : 'false');
            item.innerHTML = '<span class="workspace-avatar" aria-hidden="true"></span><span class="workspace-menu-name"></span>' +
                '<i class="fa-solid fa-check workspace-menu-check" aria-hidden="true"></i>';
            item.querySelector('.workspace-avatar').textContent = initials(w.name);
            item.querySelector('.workspace-menu-name').textContent = w.name;
            item.addEventListener('click', function () { choose(w); });
            menu.appendChild(item);
        });

        var divider = document.createElement('div');
        divider.className = 'workspace-menu-divider';
        menu.appendChild(divider);

        var manage = document.createElement('a');
        manage.href = 'partner.html';
        manage.className = 'workspace-menu-link';
        manage.setAttribute('role', 'menuitem');
        manage.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i>Manage workspaces';
        menu.appendChild(manage);

        var logout = document.createElement('button');
        logout.type = 'button';
        logout.className = 'workspace-menu-link workspace-menu-logout';
        logout.setAttribute('role', 'menuitem');
        logout.innerHTML = '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>Log out';
        logout.addEventListener('click', function () { window.feriizLogout(); });
        menu.appendChild(logout);

        document.body.appendChild(menu);

        // Beside the expanded rail on desktop; above the button when there is no room (phones).
        var rect = button.getBoundingClientRect();
        var side = sidebar ? sidebar.getBoundingClientRect() : rect;
        // The rail is still animating 56px -> 200px, so place against its expanded edge.
        var railRight = side.left + Math.max(side.width, 200);
        var width = menu.offsetWidth;
        if (window.innerWidth - railRight >= width + 16) {
            menu.style.left = (railRight + 8) + 'px';
            menu.style.bottom = Math.max(8, window.innerHeight - rect.bottom) + 'px';
        } else {
            menu.style.left = Math.max(8, rect.left) + 'px';
            menu.style.width = Math.max(220, rect.width) + 'px';
            menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        }

        button.setAttribute('aria-expanded', 'true');
        var checked = menu.querySelector('[aria-checked="true"]');
        (checked || menu.querySelector('[role^="menuitem"]')).focus();
        document.addEventListener('mousedown', onOutside, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', closeMenu);
    }

    window.FeriizWorkspaces = {
        list: function () { return WORKSPACES.slice(); },
        current: current,
        initials: initials,
        bindSwitcher: function (root) {
            var button = root.querySelector('.workspace-switch');
            if (!button) return;
            paint(button);
            button.addEventListener('click', function () { openMenu(button); });
        }
    };
})();

/* === Attachment viewer ===
   FeriizAttachments.open(files, context) shows request attachments in a
   Bootstrap modal: preview for images and PDFs (no size, Open or Download
   buttons; Baldy removed them 2026-10-26).
   files: [{ name, url, type, size }]. The modal is created on first use. */
(function () {
    var modal = null;
    var files = [];

    function build() {
        var el = document.createElement('div');
        el.className = 'modal fade attachment-modal';
        el.id = 'attachmentModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'attachmentModalTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div class="attachment-heading">' +
                            '<h2 class="modal-title text-truncate" id="attachmentModalTitle">Attachment</h2>' +
                            '<p class="attachment-context" id="attachmentContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="attachment-files" id="attachmentFiles" role="tablist" aria-label="Files"></div>' +
                        '<div class="attachment-stage" id="attachmentStage"></div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        return el;
    }

    function show(index) {
        var f = files[index];
        if (!f) return;
        modal.querySelector('#attachmentModalTitle').textContent = f.name;
        modal.querySelectorAll('.attachment-file').forEach(function (b, i) {
            b.classList.toggle('active', i === index);
            b.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });

        var stage = modal.querySelector('#attachmentStage');
        stage.innerHTML = '';
        var type = (f.type || '').toLowerCase();
        if (type.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)) {
            var img = document.createElement('img');
            img.src = f.url;
            img.alt = f.name;
            img.className = 'attachment-preview';
            stage.appendChild(img);
        } else if (type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
            var frame = document.createElement('iframe');
            frame.src = f.url;
            frame.title = f.name;
            frame.className = 'attachment-pdf';
            stage.appendChild(frame);
        } else {
            stage.innerHTML = '<div class="attachment-noprev"><i class="fa-regular fa-file" aria-hidden="true"></i>' +
                '<p>No preview for this file type.</p></div>';
        }
    }

    window.FeriizAttachments = {
        open: function (list, context) {
            files = (list || []).slice();
            if (!files.length) return;
            if (!modal) modal = build();
            modal.querySelector('#attachmentContext').textContent = context || '';
            var tabs = modal.querySelector('#attachmentFiles');
            tabs.innerHTML = '';
            tabs.hidden = files.length < 2;
            files.forEach(function (f, i) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'attachment-file';
                b.setAttribute('role', 'tab');
                b.innerHTML = '<i class="fa-regular fa-file-image" aria-hidden="true"></i><span></span>';
                b.querySelector('span').textContent = f.name;
                b.addEventListener('click', function () { show(i); });
                tabs.appendChild(b);
            });
            show(0);
            window.bootstrap.Modal.getOrCreateInstance(modal).show();
        }
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
        'request-templates':         { main: 'templates' },
        'calendar':                  { main: 'calendar' },
        'my-account':                { main: 'my-account' },
        'partner':                   { main: 'workspaces' },
        'project-activity':          { main: 'projects-group', sub: 'activity' },
        'project-attendance':        { main: 'projects-group', sub: 'activity' },
        'project-report':            { main: 'projects-group', sub: 'report' },
        'project-calendar':          { main: 'calendar' },
        'project-requests':          { main: 'projects-group', sub: 'requests' },
        'project-closing':           { main: 'projects-group', sub: 'closing' },
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
        var activeProj = new URLSearchParams(window.location.search).get('project');
        if (activeProj) {
            try { sessionStorage.setItem('feriiz_active_project', activeProj); } catch (e) {}
        } else {
            try { activeProj = sessionStorage.getItem('feriiz_active_project'); } catch (e) {}
        }
        var projQuery = activeProj ? '?project=' + encodeURIComponent(activeProj) : '';

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
                        '<a href="project_employees.html' + projQuery + '"' + cls(cfg.sub === 'activity') + '>' +
                            '<i class="fa-solid fa-clock"></i><span class="nav-label">Activity</span>' +
                        '</a>' +
                        '<a href="project_report.html' + projQuery + '"' + cls(cfg.sub === 'report') + '>' +
                            '<i class="fa-regular fa-file-lines"></i><span class="nav-label">Report</span>' +
                        '</a>' +
                        '<a href="employee_request.html' + projQuery + '"' + cls(cfg.sub === 'requests') + '>' +
                            '<i class="fa-solid fa-clipboard-list"></i><span class="nav-label">Requests</span>' +
                        '</a>' +
                        '<a href="project_closing.html' + projQuery + '"' + cls(cfg.sub === 'closing') + '>' +
                            '<i class="fa-solid fa-clipboard-check"></i><span class="nav-label">Closing</span>' +
                        '</a>' +
                    '</div>' +
                '</div>' +
                '<a href="employees.html"' + cls(cfg.main === 'employees') + '>' +
                    '<i class="fa-solid fa-users"></i><span class="nav-label">Employees</span>' +
                '</a>' +
                // Templates work for every project, so they live outside the project menu.
                '<a href="request_templates.html"' + cls(cfg.main === 'templates') + '>' +
                    '<i class="fa-solid fa-layer-group"></i><span class="nav-label">Request Templates</span>' +
                '</a>' +
                '<a href="calendar.html"' + cls(cfg.main === 'calendar') + '>' +
                    '<i class="fa-regular fa-calendar"></i><span class="nav-label">Calendar</span>' +
                '</a>' +
                '<a href="my-account.html"' + cls(cfg.main === 'my-account') + '>' +
                    '<i class="fa-regular fa-user"></i><span class="nav-label">My Account</span>' +
                '</a>' +
            '</nav>' +
            // Workspace (= partner) switcher. Log out lives in its menu.
            '<div class="sidebar-footer">' +
                '<button type="button" class="workspace-switch' + (cfg.main === 'workspaces' ? ' active' : '') + '" ' +
                    'aria-haspopup="menu" aria-expanded="false" aria-label="Switch workspace">' +
                    '<span class="workspace-avatar" aria-hidden="true"></span>' +
                    '<span class="nav-label workspace-text">' +
                        '<span class="workspace-caption">Workspace</span>' +
                        '<span class="workspace-name"></span>' +
                    '</span>' +
                    '<i class="fa-solid fa-chevron-up nav-label workspace-chevron" aria-hidden="true"></i>' +
                '</button>' +
            '</div>';
        if (window.FeriizWorkspaces) window.FeriizWorkspaces.bindSwitcher(aside);
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

/* === Employee attendance ===
   Projects > Activity > Attendance (?project=&employee=) and Employees > Attendance
   (?employee=, every project). Built from FERIIZ_DATA for that person; it used to be
   Adam Ferial's May written into the page (backlog A2, 2026-10-28).
   - Time Period: the project's working hours on its working days.
   - Attendance: log in, log out and the time between them.
   - Period: the shortfall against the working hours; a missing log counts the whole day.
   - A day without logs covered by an accepted request counts as the full working hours
     and shows the request with its reason, as the old Feriiz report did.
   - Project page: a day the person was logged at another project says where, and
     counts for neither.
   Like the Report, "today" is held at the dataset's last day. */
(function () {
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'];

    const ctx = {
        data: null,
        employee: null,
        project: null,      // the project page's project; null = every project
        home: null,         // working hours for a day without a record
        records: {},        // date -> the person's attendance record
        requests: {},       // date -> accepted request
        holidays: {},       // date -> holiday name
        first: '',
        today: ''
    };
    const appliedAttendanceFilters = { dateStart: '', dateEnd: '' };

    const pad2 = n => String(n).padStart(2, '0');
    const toISO = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

    function fromISO(iso) {
        const p = iso.split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function addDays(iso, n) {
        const d = fromISO(iso);
        d.setDate(d.getDate() + n);
        return toISO(d);
    }

    function toSeconds(t) {
        const p = String(t || '').split(':').map(Number);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }

    // 09:00:00, or -00:20:15 for a shortfall
    function clock(seconds) {
        const s = Math.round(Math.abs(seconds));
        return (seconds < 0 ? '-' : '') + pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60);
    }

    // 108:27, the stat cards' hours and minutes
    function hoursMinutes(seconds) {
        const m = Math.round(Math.abs(seconds) / 60);
        return Math.floor(m / 60) + ':' + pad2(m % 60);
    }

    function longDate(iso) {
        const d = fromISO(iso);
        return DAY_NAMES[d.getDay()] + ', ' + pad2(d.getDate()) + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function cell(value, className) {
        return `<td class="${className || 'feriiz-u-073'}">${value ? escapeHTML(value) : '-'}</td>`;
    }

    const blank = () => cell('', 'feriiz-u-079');

    // One table row and what it adds to the totals (seconds).
    function dayRow(date) {
        const rec = ctx.records[date] || null;
        const req = ctx.requests[date] || null;
        const project = ctx.project || (rec && ctx.data.findProjectByCode(rec.projectCode)) || ctx.home;
        const elsewhere = rec && ctx.project && rec.projectCode !== ctx.project.code
            ? ctx.data.findProjectByCode(rec.projectCode) : null;
        const holiday = rec ? (rec.status === 'holiday' ? ctx.holidays[date] || 'Holiday' : '') : ctx.holidays[date] || '';
        const workingDays = (project && project.workingDays) || [];
        const weekend = rec ? rec.status === 'weekend'
            : workingDays.length > 0 && workingDays.indexOf(SHORT_DAYS[fromISO(date).getDay()]) < 0;

        if (holiday || weekend || elsewhere) {
            return {
                html: '<tr class="attendance-muted-row">' + cell(longDate(date), 'feriiz-u-078') +
                    blank() + blank() + blank() + blank() + blank() + blank() + blank() +
                    cell(holiday, holiday ? 'feriiz-u-082' : 'feriiz-u-079') +
                    cell(elsewhere && !holiday && !weekend ? 'At ' + elsewhere.name : '', 'feriiz-u-080') + '</tr>',
                scheduled: 0, worked: 0, shortfall: 0, surplus: 0
            };
        }

        const start = (project && project.workStart) || '08:00';
        const end = (project && project.workEnd) || '17:00';
        const scheduled = Math.max(0, toSeconds(end + ':00') - toSeconds(start + ':00'));
        const inTime = rec ? rec.inTime || '' : '';
        const outTime = rec ? rec.outTime || '' : '';
        let attendance;
        let worked = 0;
        let shortfall = 0;
        let surplus = 0;
        let rowClass = '';

        if (!inTime && !outTime && req) {
            worked = scheduled;
            attendance = blank() + blank() + cell(clock(scheduled));
            rowClass = ' class="attendance-request-row"';
        } else {
            const both = Boolean(inTime && outTime) && toSeconds(outTime) > toSeconds(inTime);
            worked = both ? toSeconds(outTime) - toSeconds(inTime) : 0;
            shortfall = both ? Math.min(0, worked - scheduled) : -scheduled;
            surplus = both ? Math.max(0, worked - scheduled) : 0;
            attendance = (inTime ? cell(inTime) : blank()) + (outTime ? cell(outTime) : blank()) +
                (both ? cell(clock(worked)) : blank());
        }

        return {
            html: '<tr' + rowClass + '>' + cell(longDate(date), 'feriiz-u-078') +
                cell(start + ':00') + cell(end + ':00') + cell(clock(scheduled)) +
                attendance +
                (shortfall < 0 ? cell(clock(shortfall), 'feriiz-u-083') : blank()) +
                cell(req ? req.type : '', req ? 'feriiz-u-082' : 'feriiz-u-079') +
                cell(req ? req.reason : '', 'feriiz-u-080') + '</tr>',
            scheduled, worked, shortfall, surplus
        };
    }

    function defaultRange() {
        const monthStart = ctx.today.slice(0, 8) + '01';
        return { start: ctx.first && monthStart < ctx.first ? ctx.first : monthStart, end: ctx.today };
    }

    function shownDates() {
        let from = appliedAttendanceFilters.dateStart || appliedAttendanceFilters.dateEnd;
        let to = appliedAttendanceFilters.dateEnd || appliedAttendanceFilters.dateStart;
        if (!from) {
            from = defaultRange().start;
            to = defaultRange().end;
        }
        if (from > to) { const t = from; from = to; to = t; }
        if (ctx.first && from < ctx.first) from = ctx.first;
        if (to > ctx.today) to = ctx.today;
        const dates = [];
        for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
        return dates;
    }

    function setStat(name, text) {
        const el = document.querySelector('[data-att-stat="' + name + '"]');
        if (el) el.textContent = text;
    }

    function renderAttendanceReport() {
        const tbody = document.querySelector('.attendance-table tbody');
        if (!tbody) return;
        const totals = { scheduled: 0, worked: 0, shortfall: 0, surplus: 0 };
        const rows = shownDates().map(date => {
            const row = dayRow(date);
            totals.scheduled += row.scheduled;
            totals.worked += row.worked;
            totals.shortfall += row.shortfall;
            totals.surplus += row.surplus;
            return row.html;
        });

        tbody.innerHTML = (rows.length ? rows.join('') : '<tr><td colspan="10" class="feriiz-u-080">No attendance in this date range.</td></tr>') + `
            <tr class="feriiz-u-084 attendance-total-row">
                <td class="feriiz-u-085"></td>
                <td class="feriiz-u-085"></td>
                <td class="feriiz-u-085"></td>
                <td class="feriiz-u-086">${clock(totals.scheduled)}</td>
                <td class="feriiz-u-085"></td>
                <td class="feriiz-u-085"></td>
                <td class="feriiz-u-086">${clock(totals.worked)}</td>
                <td class="feriiz-u-087">${totals.shortfall < 0 ? clock(totals.shortfall) : '-'}</td>
                <td colspan="2" class="feriiz-u-088"></td>
            </tr>`;

        setStat('hours', hoursMinutes(totals.worked));
        setStat('deficit', hoursMinutes(totals.shortfall));
        setStat('surplus', hoursMinutes(totals.surplus));
        applyAttendanceSearch();
    }

    // The Period presets count back from the held "today".
    function presetRange(value) {
        const today = ctx.today;
        const sunday = addDays(today, -fromISO(today).getDay());   // weeks run Sunday to Saturday
        const monthStart = today.slice(0, 8) + '01';
        if (value === 'today') return [today, today];
        if (value === 'yesterday') return [addDays(today, -1), addDays(today, -1)];
        if (value === 'this_week') return [sunday, today];
        if (value === 'last_week') return [addDays(sunday, -7), addDays(sunday, -1)];
        if (value === 'this_month') return [monthStart, today];
        if (value === 'last_month') {
            const end = addDays(monthStart, -1);
            return [end.slice(0, 8) + '01', end];
        }
        if (value === 'this_year') return [today.slice(0, 5) + '01-01', today];
        if (value === 'all_time') return [ctx.first || today, today];
        return null;   // Custom: keep what was typed
    }

    function applyAttendanceSearch() {
        const searchInput = document.querySelector('.page-actions input[placeholder*="Search attendance"]');
        const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
        document.querySelectorAll('.attendance-table tbody tr:not(.attendance-total-row)').forEach(row => {
            row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query);
        });
    }

    function initAttendanceFilters() {
        const dateInputs = [...document.querySelectorAll('.filter-date')];
        const periodSelect = document.querySelector('.filter-period');
        const applyButton = document.querySelector('.filter-apply-btn');
        const clearButton = document.querySelector('.filter-clear-btn');
        const searchInput = document.querySelector('.page-actions input[placeholder*="Search attendance"]');

        // The filter always shows the range on screen: This Month until changed.
        function showDefault() {
            const range = defaultRange();
            if (dateInputs.length >= 2) {
                dateInputs[0].value = range.start;
                dateInputs[1].value = range.end;
            }
            if (periodSelect) periodSelect.value = 'this_month';
            appliedAttendanceFilters.dateStart = range.start;
            appliedAttendanceFilters.dateEnd = range.end;
        }

        dateInputs.forEach(input => {
            if (ctx.first) input.min = ctx.first;
            input.max = ctx.today;
            input.addEventListener('change', function () {
                if (periodSelect) periodSelect.value = 'custom';
            });
        });

        if (periodSelect && dateInputs.length >= 2) {
            periodSelect.addEventListener('change', function () {
                const range = presetRange(periodSelect.value);
                if (!range) return;
                dateInputs[0].value = range[0];
                dateInputs[1].value = range[1];
            });
        }

        if (applyButton && dateInputs.length >= 2) {
            applyButton.addEventListener('click', function () {
                appliedAttendanceFilters.dateStart = dateInputs[0].value;
                appliedAttendanceFilters.dateEnd = dateInputs[1].value;
                renderAttendanceReport();
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', function () {
                showDefault();
                renderAttendanceReport();
            });
        }

        if (searchInput) {
            let timer;
            searchInput.addEventListener('input', function () {
                clearTimeout(timer);
                timer = setTimeout(applyAttendanceSearch, 180);
            });
        }

        showDefault();
    }

    function resolveContext(data) {
        const params = new URLSearchParams(window.location.search);
        const onProjectPage = document.body.getAttribute('data-page') === 'project-attendance';
        const wanted = params.get('employee');
        let projectCode = params.get('project');
        if (onProjectPage && !projectCode) {
            try { projectCode = sessionStorage.getItem('feriiz_active_project'); } catch (e) {}
        }

        let employee = wanted ? data.findEmployeeByCode(wanted) : null;
        let project = null;
        if (onProjectPage) {
            project = (projectCode && data.findProjectByCode(projectCode)) ||
                (employee && employee.projects && employee.projects.length ? data.findProjectByCode(employee.projects[0]) : null) ||
                data.projects[0] || null;
        }
        if (!employee) {
            const team = project ? data.employees.filter(e => (e.projects || []).indexOf(project.code) >= 0) : data.employees;
            employee = team[0] || data.employees[0] || null;
            if (wanted && employee && window.FeriizNotify) {
                FeriizNotify.warning('Employee ' + wanted + ' was not found, so ' + employee.name + ' is shown.', 'Employee not found');
            }
        }

        ctx.data = data;
        ctx.employee = employee;
        ctx.project = project;
        ctx.home = project || (employee && employee.projects && employee.projects.length ? data.findProjectByCode(employee.projects[0]) : null) || data.projects[0] || null;
        ctx.records = {};
        ctx.requests = {};
        ctx.holidays = {};
        if (employee) {
            data.attendance.forEach(a => { if (a.employeeCode === employee.code) ctx.records[a.date] = a; });
            (data.generatedRequests || []).forEach(r => {
                if (r.employeeCode !== employee.code || r.status !== 'Accepted' || !r.dateStart) return;
                for (let d = r.dateStart; d <= (r.dateEnd || r.dateStart); d = addDays(d, 1)) ctx.requests[d] = r;
            });
        }
        (data.datasetHolidays || []).forEach(h => { ctx.holidays[h.date] = h.name; });

        const meta = data.meta || {};
        const now = toISO(new Date());
        ctx.first = meta.periodStart || '';
        ctx.today = meta.periodEnd && now > meta.periodEnd ? meta.periodEnd : now;
    }

    function fillHeader() {
        const employee = ctx.employee;
        if (!employee) return;
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setText('attName', employee.name);
        setText('attCode', employee.code);
        setText('attCrumbName', employee.name);
        const photo = document.getElementById('attPhoto');
        if (photo) photo.src = ctx.data.avatarSrc(employee);
        if (ctx.project) {
            const href = 'project_employees.html?project=' + encodeURIComponent(ctx.project.code);
            const link = document.getElementById('attProjectLink');
            if (link) {
                link.textContent = ctx.project.name;
                link.href = href;
            }
            const back = document.getElementById('attBackLink');
            if (back) back.href = href;
            document.title = 'Feriiz - ' + ctx.project.name + ' - ' + employee.name + ' - Attendance';
        } else {
            document.title = 'Feriiz - ' + employee.name + ' - Attendance';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('.attendance-table') || !window.FERIIZ_DATA || !window.FERIIZ_DATA.ready) return;
        window.FERIIZ_DATA.ready.then(function (data) {
            resolveContext(data);
            fillHeader();
            initAttendanceFilters();
            renderAttendanceReport();
        });
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
