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
   Bootstrap modal: preview for images and PDFs, plus Open and Download.
   files: [{ name, url, type, size }]. The modal is created on first use. */
(function () {
    var modal = null;
    var files = [];

    function sizeLabel(bytes) {
        if (!bytes && bytes !== 0) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

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
                    '<div class="modal-footer">' +
                        '<span class="attachment-size me-auto" id="attachmentSize"></span>' +
                        '<a class="btn btn-outline" id="attachmentOpen" target="_blank" rel="noopener">' +
                            '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open in new tab</a>' +
                        '<a class="btn btn-primary" id="attachmentDownload" download>' +
                            '<i class="fa-solid fa-download" aria-hidden="true"></i> Download</a>' +
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
        modal.querySelector('#attachmentSize').textContent = sizeLabel(f.size);
        modal.querySelector('#attachmentOpen').href = f.url;
        var dl = modal.querySelector('#attachmentDownload');
        dl.href = f.url;
        dl.setAttribute('download', f.name);
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
                '<p>No preview for this file type. Use Download to open it.</p></div>';
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
