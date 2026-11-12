/* =============================================
   FERIIZ — Manage Occupations (Employees page, Baldy, 12-11-2026: "tambahin tombol buat tambah
   occupation… kurang lebih kayanya untuk desain kaya manage employees… ada checlist nya terus bisa
   delete juga jadinya").
   One window, like Manage Employee: add a name, search, tick occupations and delete them. Each
   occupation says how many employees have it. Delete shows only once something is ticked
   ("paling ketika select itu baru ada tombol delete ya"); it leaves the employees without an
   occupation and asks first, saying how many. No rename ("ini edit occupation harusnya tidak ada
   deh ga perlu banget"). The list lives in FERIIZ_DATA (data.js).
   FeriizOccupations.open(onChange): onChange() after each change, so the page draws again.
   ============================================= */
(function () {
    'use strict';

    var modal = null;
    var onChange = null;
    var query = '';
    var picked = {};       // lower-case name -> true
    var asking = false;    // the delete question is showing

    function D() { return window.FERIIZ_DATA; }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function key(name) { return String(name || '').trim().toLowerCase(); }

    function plural(n, one, many) { return n.toLocaleString('id-ID') + ' ' + (n === 1 ? one : many); }

    function notify(kind, text, title) { if (window.FeriizNotify) window.FeriizNotify[kind](text, title); }

    function build() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'occManagerModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'occManagerTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable occm-dialog">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="occManagerTitle">Manage Occupations</h2>' +
                            '<p class="tpl-subtitle" id="occmContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<form class="occm-add" id="occmAddForm" novalidate>' +
                            '<label class="form-label" for="occmNewName">New occupation</label>' +
                            '<div class="occm-add-row">' +
                                '<input type="text" class="form-control" id="occmNewName" placeholder="Occupation name" autocomplete="off" maxlength="60">' +
                                '<button type="submit" class="btn btn-primary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>' +
                            '</div>' +
                        '</form>' +
                        '<div class="occm-search">' +
                            '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
                            '<input type="search" id="occmSearch" placeholder="Search occupation" aria-label="Search occupation" autocomplete="off">' +
                        '</div>' +
                        '<div class="occm-list">' +
                            '<div class="occm-row is-head">' +
                                '<label class="occm-check"><input type="checkbox" class="form-check-input" id="occmAll" aria-label="Tick every occupation shown"></label>' +
                                '<span>Occupation</span>' +
                                '<span class="occm-num">Employees</span>' +
                            '</div>' +
                            '<div class="occm-rows" id="occmRows"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer occm-foot" id="occmFoot" aria-live="polite"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#occmAddForm').addEventListener('submit', add);
        el.querySelector('#occmSearch').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); render(); });
        el.querySelector('#occmAll').addEventListener('change', tickShown);
        el.querySelector('#occmRows').addEventListener('change', onRowsChange);
        el.querySelector('#occmFoot').addEventListener('click', onFootClick);
        el.addEventListener('hidden.bs.modal', function () { asking = false; });
        return el;
    }

    function shown() {
        return D().occupationList().filter(function (o) { return !query || o.name.toLowerCase().indexOf(query) >= 0; });
    }

    function pickedNames() {
        return D().occupationList().filter(function (o) { return picked[key(o.name)]; });
    }

    function rowHTML(o) {
        return '<div class="occm-row">' +
            '<label class="occm-check"><input type="checkbox" class="form-check-input" data-pick="' + esc(o.name) + '"' + (picked[key(o.name)] ? ' checked' : '') +
                ' aria-label="Tick ' + esc(o.name) + '"></label>' +
            '<span class="occm-name">' + esc(o.name) + '</span>' +
            '<span class="occm-num">' + o.employees.toLocaleString('id-ID') + '</span>' +
        '</div>';
    }

    // Nothing ticked: only a hint, no Delete. Ticked: "Selected: N" and Delete, then the question.
    // The footer stays, so ticking the first box does not move the window.
    function renderFoot() {
        var foot = modal.querySelector('#occmFoot');
        var list = pickedNames();
        if (!list.length) {
            asking = false;
            foot.innerHTML = '<span class="occm-hint">Tick occupations to delete them.</span>';
            return;
        }
        if (asking) {
            var people = list.reduce(function (n, o) { return n + o.employees; }, 0);
            foot.innerHTML = '<span class="occm-ask">Delete ' + plural(list.length, 'occupation', 'occupations') + '?' +
                (people ? ' ' + plural(people, 'employee', 'employees') + ' will have no occupation.' : '') + '</span>' +
                '<button type="button" class="btn btn-outline" data-keep>Keep</button>' +
                '<button type="button" class="btn btn-danger" data-confirm>Yes, delete</button>';
            return;
        }
        foot.innerHTML = '<span class="occm-selected">Selected: <strong>' + list.length + '</strong></span>' +
            '<button type="button" class="btn btn-outline-danger" data-delete>' +
                '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> Delete</button>';
    }

    function render() {
        var all = D().occupationList();
        var rows = shown();
        var people = all.reduce(function (n, o) { return n + o.employees; }, 0);
        modal.querySelector('#occmContext').textContent = plural(all.length, 'occupation', 'occupations') + ' · ' + plural(people, 'employee', 'employees') + ' with one';
        modal.querySelector('#occmRows').innerHTML = rows.length ? rows.map(rowHTML).join('')
            : '<p class="occm-empty">' + (query ? 'No occupation matches your search.' : 'No occupation yet. Add the first one above.') + '</p>';
        var on = rows.filter(function (o) { return picked[key(o.name)]; }).length;
        var master = modal.querySelector('#occmAll');
        master.checked = rows.length > 0 && on === rows.length;
        master.indeterminate = on > 0 && on < rows.length;
        master.disabled = !rows.length;
        renderFoot();
    }

    function changed() { if (onChange) onChange(); }

    function add(e) {
        e.preventDefault();
        var input = modal.querySelector('#occmNewName');
        var problem = D().addOccupation(input.value);
        if (problem) {
            input.classList.add('is-invalid');
            input.focus();
            notify('warning', problem, 'Occupation not added');
            return;
        }
        var name = input.value.trim().replace(/\s+/g, ' ');
        input.value = '';
        input.classList.remove('is-invalid');
        render();
        changed();
        notify('success', name + ' was added. It can now be chosen in the employee form.', 'Occupation added');
        input.focus();
    }

    // Ticked or with its minus, the box over the list unticks what is shown; empty, it ticks it.
    function tickShown() {
        var rows = shown();
        var anyOn = rows.some(function (o) { return picked[key(o.name)]; });
        rows.forEach(function (o) {
            if (anyOn) delete picked[key(o.name)];
            else picked[key(o.name)] = true;
        });
        asking = false;
        render();
    }

    function onRowsChange(e) {
        var box = e.target.closest('input[data-pick]');
        if (!box) return;
        if (box.checked) picked[key(box.dataset.pick)] = true;
        else delete picked[key(box.dataset.pick)];
        asking = false;
        render();
        var again = modal.querySelector('input[data-pick="' + box.dataset.pick.replace(/"/g, '\\"') + '"]');
        if (again) again.focus();
    }

    function onFootClick(e) {
        if (e.target.closest('[data-delete]')) {
            asking = true;
            renderFoot();
            var keep = modal.querySelector('#occmFoot [data-keep]');
            if (keep) keep.focus();
        } else if (e.target.closest('[data-keep]')) {
            asking = false;
            renderFoot();
            var del = modal.querySelector('#occmFoot [data-delete]');
            if (del) del.focus();
        } else if (e.target.closest('[data-confirm]')) {
            var list = pickedNames();
            var cleared = D().deleteOccupations(list.map(function (o) { return o.name; }));
            picked = {};
            asking = false;
            render();
            changed();
            notify('success', plural(list.length, 'occupation was', 'occupations were') + ' deleted.' +
                (cleared ? ' ' + plural(cleared, 'employee has', 'employees have') + ' no occupation now.' : ''), 'Occupations deleted');
            modal.querySelector('#occmSearch').focus();
        }
    }

    window.FeriizOccupations = {
        open: function (callback) {
            if (!D() || !D().occupationList) return;
            onChange = callback || null;
            if (!modal) modal = build();
            query = '';
            picked = {};
            asking = false;
            modal.querySelector('#occmSearch').value = '';
            modal.querySelector('#occmNewName').value = '';
            modal.querySelector('#occmNewName').classList.remove('is-invalid');
            render();
            window.bootstrap.Modal.getOrCreateInstance(modal).show();
        }
    };
})();
