/* ============================================================
   FERIIZ — Request templates (meal, transport, holiday incentive, extra).

   From the Arcon meeting (20-10-2026): a template is made once and works
   for every project (1:34, 1:53); it is reused many times (1:39). Admins
   hand it out from the project Report in one step (1:43) and it lands in
   the Additional column on those days. Each template keeps a history of
   who received it (1:45). Transport can differ per person (1:54).

   Prototype only: everything is kept in this browser (localStorage) so the
   Templates page and the Report see the same data. The API replaces this.

   FeriizTemplates.all(), get(id), save(template)
   FeriizTemplates.additionalFor(employeeCode, projectCode, dates)
   FeriizTemplates.transportOf(code), setTransport(code, { livesOnSite, perDay })
   FeriizTemplates.openAssign(context)   assign dialog used by the Report
   ============================================================ */
(function () {
    'use strict';

    var KEY_TEMPLATES = 'feriiz_request_templates_v1';
    var KEY_ASSIGNED = 'feriiz_template_assignments_v1';
    var KEY_TRANSPORT = 'feriiz_employee_transport_v1';
    var INACTIVE_DAYS = 90;   // "3 bulan gak kerja" (1:34) -> unticked by default

    var CATEGORIES = [
        { id: 'meal', label: 'Meal', icon: 'fa-utensils' },
        { id: 'transport', label: 'Transport', icon: 'fa-bus' },
        { id: 'holiday', label: 'Holiday', icon: 'fa-calendar-day' },
        { id: 'extra', label: 'Extra', icon: 'fa-circle-plus' }
    ];
    var UNITS = { day: 'Daily', once: 'One time' };

    // Sample templates, mirroring the examples named in the meeting.
    var DEFAULT_TEMPLATES = [
        { id: 'TPL-001', name: 'Uang Makan 20rb', category: 'meal', amount: 20000, unit: 'day', note: '' },
        { id: 'TPL-002', name: 'Uang Makan 30rb', category: 'meal', amount: 30000, unit: 'day', note: '' },
        { id: 'TPL-003', name: 'Transport Standar', category: 'transport', amount: 15000, unit: 'day',
          note: 'Only for workers who do not live on site.' },
        { id: 'TPL-004', name: 'Insentif Tanggal Merah 2026', category: 'holiday', amount: 50000, unit: 'once', note: '',
          dates: [
              { date: '2026-05-01', name: 'Hari Buruh' },
              { date: '2026-05-14', name: 'Kenaikan Isa Al Masih' },
              { date: '2026-05-27', name: 'Idul Adha' },
              { date: '2026-05-31', name: 'Hari Raya Waisak' },
              { date: '2026-06-01', name: 'Hari Lahir Pancasila' },
              { date: '2026-08-17', name: 'HUT RI' }
          ] }
    ];

    function clone(v) { return JSON.parse(JSON.stringify(v)); }

    function load(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (raw) {
                var v = JSON.parse(raw);
                if (Array.isArray(fallback) ? Array.isArray(v) : (v && typeof v === 'object')) return v;
            }
        } catch (e) { /* private window or blocked storage: use the samples */ }
        return clone(fallback);
    }

    function store(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* kept for this page only */ }
    }

    // Archiving was dropped (2026-10-26); templates archived before that are left out.
    var templates = load(KEY_TEMPLATES, DEFAULT_TEMPLATES).filter(function (t) { return t.active !== false; });
    var assigned = load(KEY_ASSIGNED, []);
    var transport = load(KEY_TRANSPORT, {});

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function rupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

    function category(id) {
        return CATEGORIES.filter(function (c) { return c.id === id; })[0] || CATEGORIES[3];
    }

    function chip(catId) {
        var c = category(catId);
        return '<span class="tpl-chip tpl-chip--' + c.id + '"><i class="fa-solid ' + c.icon + '" aria-hidden="true"></i>' + c.label + '</span>';
    }

    function get(id) { return templates.filter(function (t) { return t.id === id; })[0] || null; }

    function save(t) {
        var existing = t.id ? get(t.id) : null;
        if (existing) {
            Object.keys(t).forEach(function (k) { existing[k] = t[k]; });
        } else {
            t.id = 'TPL-' + Date.now().toString(36).toUpperCase();
            t.createdAt = new Date().toISOString();
            templates.unshift(t);
        }
        store(KEY_TEMPLATES, templates);
        return existing || t;
    }

    // { total, items: [{ templateId, name, category, count, amount }], notes: [] } for the given days.
    function additionalFor(employeeCode, projectCode, dates) {
        var inRange = {};
        (dates || []).forEach(function (d) { inRange[d] = true; });
        var byTemplate = {};
        var notes = [];
        var total = 0;
        assigned.forEach(function (a) {
            if (a.employeeCode !== employeeCode || a.projectCode !== projectCode || !inRange[a.date]) return;
            var t = get(a.templateId) || { name: 'Template', category: 'extra' };
            var item = byTemplate[a.templateId] || (byTemplate[a.templateId] = { templateId: a.templateId, name: t.name, category: t.category, count: 0, amount: 0 });
            item.count++;
            item.amount += a.amount;
            total += a.amount;
            if (a.note && notes.indexOf(a.note) < 0) notes.push(a.note);
        });
        return { total: total, items: Object.keys(byTemplate).map(function (k) { return byTemplate[k]; }), notes: notes };
    }

    function transportOf(code) {
        var t = transport[code] || {};
        return { livesOnSite: !!t.livesOnSite, perDay: Number(t.perDay) || 0 };
    }

    function setTransport(code, value) {
        if (!code) return;
        transport[code] = { livesOnSite: !!value.livesOnSite, perDay: Number(value.perDay) || 0 };
        store(KEY_TRANSPORT, transport);
    }

    function toISO(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function fromISO(s) {
        var p = String(s).split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fmtDate(iso) {
        if (!iso) return '-';
        var d = fromISO(iso.slice(0, 10));
        return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    }

    function daysBetween(a, b) {
        return Math.round((fromISO(b) - fromISO(a)) / 86400000);
    }

    /* ---------- Assign dialog (Report toolbar) ----------
       context = {
         project: { code, name },
         people: [{ code, name, occupation, lastActive }],
         dates: [visible ISO dates], today: ISO,
         onDone: function (count)
       }
       A per-day template is given on every day From-To; a one-time template on the chosen date. */
    var modal = null;
    var ctx = null;

    function buildModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'assignTemplateModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'assignTemplateTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="assignTemplateTitle">Assign Template</h2>' +
                            '<p class="tpl-subtitle" id="assignTemplateContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="row g-3">' +
                            '<div class="col-md-7">' +
                                '<label class="form-label" for="assignTemplateSelect">Template</label>' +
                                '<select class="form-select" id="assignTemplateSelect"></select>' +
                                '<div class="form-text" id="assignTemplateInfo"></div>' +
                            '</div>' +
                            '<div class="col-md-5">' +
                                '<label class="form-label" for="assignAmount">Amount</label>' +
                                '<div class="input-group">' +
                                    '<span class="input-group-text">Rp</span>' +
                                    '<input type="text" inputmode="numeric" class="form-control" id="assignAmount">' +
                                    '<span class="input-group-text" id="assignAmountUnit">/ day</span>' +
                                '</div>' +
                                '<div class="form-text" id="assignAmountNote"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="tpl-when" id="assignWhen"></div>' +
                        '<div id="assignPeopleBlock">' +
                            '<div class="tpl-people-head">' +
                                '<span class="form-label m-0" id="assignPeopleCount">People</span>' +
                                '<div class="tpl-people-tools">' +
                                    '<input type="search" class="form-control form-control-sm" id="assignPeopleSearch" placeholder="Search name or code" aria-label="Search people">' +
                                    '<button type="button" class="btn btn-outline btn-sm" id="assignAll">Select all</button>' +
                                    '<button type="button" class="btn btn-outline btn-sm" id="assignNone">Clear</button>' +
                                '</div>' +
                            '</div>' +
                            '<p class="form-text mt-0">Sorted by last activity. People with no activity for ' + INACTIVE_DAYS + ' days are left unticked.</p>' +
                            '<div class="tpl-people" id="assignPeople" role="group" aria-label="People"></div>' +
                        '</div>' +
                        '<label class="form-label mt-3" for="assignNote">Note <span class="tpl-optional">(Optional)</span></label>' +
                        '<input type="text" class="form-control" id="assignNote" placeholder="For example: Insentif 17 Agustus">' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<span class="tpl-summary me-auto" id="assignSummary"></span>' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="assignSubmit">Assign</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);

        el.querySelector('#assignTemplateSelect').addEventListener('change', function () { onTemplateChange(true); });
        el.querySelector('#assignAmount').addEventListener('input', function (e) {
            var d = digits(e.target.value);
            e.target.value = d ? Number(d).toLocaleString('id-ID') : '';
            refreshSummary();
        });
        el.querySelector('#assignWhen').addEventListener('change', refreshSummary);
        el.querySelector('#assignWhen').addEventListener('input', refreshSummary);
        el.querySelector('#assignPeople').addEventListener('change', refreshSummary);
        el.querySelector('#assignPeopleSearch').addEventListener('input', function (e) {
            var q = e.target.value.trim().toLowerCase();
            el.querySelectorAll('.tpl-person').forEach(function (row) {
                row.hidden = q && row.dataset.search.indexOf(q) < 0;
            });
        });
        el.querySelector('#assignAll').addEventListener('click', function () { tickAll(true); });
        el.querySelector('#assignNone').addEventListener('click', function () { tickAll(false); });
        el.querySelector('#assignSubmit').addEventListener('click', submit);
        return el;
    }

    function tickAll(on) {
        modal.querySelectorAll('.tpl-person').forEach(function (row) {
            if (!row.hidden) row.querySelector('input').checked = on;
        });
        refreshSummary();
    }

    function currentTemplate() { return get(modal.querySelector('#assignTemplateSelect').value); }

    function onTemplateChange(resetAmount) {
        var t = currentTemplate();
        if (!t) return;
        if (resetAmount) modal.querySelector('#assignAmount').value = Number(t.amount).toLocaleString('id-ID');
        modal.querySelector('#assignAmountUnit').textContent = t.unit === 'once' ? 'once' : '/ day';
        modal.querySelector('#assignTemplateInfo').innerHTML = chip(t.category) + ' ' + esc(UNITS[t.unit] || '') + (t.note ? ' · ' + esc(t.note) : '');
        modal.querySelector('#assignAmountNote').textContent = t.category === 'transport'
            ? 'People with their own transport rate keep it. People who live on site are skipped.' : '';
        renderWhen(t);
        refreshSummary();
    }

    function renderWhen(t) {
        var box = modal.querySelector('#assignWhen');
        var first = ctx.dates[0];
        var last = ctx.dates[ctx.dates.length - 1];
        if (t.unit === 'once') {
            var options = (t.dates || []).filter(function (d) { return d.date >= first && d.date <= last; });
            box.innerHTML =
                '<label class="form-label" for="assignDate">Date</label>' +
                (options.length
                    ? '<select class="form-select" id="assignDate">' + options.map(function (d) {
                          return '<option value="' + d.date + '">' + fmtDate(d.date) + ' · ' + esc(d.name) + '</option>';
                      }).join('') + '</select>'
                    : '<input type="date" class="form-control" id="assignDate" min="' + first + '" max="' + last + '" value="' + last + '">') +
                '<div class="form-text">' + (options.length ? 'Holidays of this template inside the report range.' : 'None of this template’s dates are in the report range; pick a day.') + '</div>';
            return;
        }
        box.innerHTML =
            '<div class="row g-3">' +
                '<div class="col-sm-6"><label class="form-label" for="assignFrom">From</label>' +
                    '<input type="date" class="form-control" id="assignFrom" min="' + first + '" max="' + last + '" value="' + first + '"></div>' +
                '<div class="col-sm-6"><label class="form-label" for="assignTo">To</label>' +
                    '<input type="date" class="form-control" id="assignTo" min="' + first + '" max="' + last + '" value="' + last + '"></div>' +
            '</div>';
    }

    function amountInput() { return Number(digits(modal.querySelector('#assignAmount').value)) || 0; }

    function amountFor(t, code) {
        if (t.category === 'transport') {
            var tr = transportOf(code);
            if (tr.livesOnSite) return null;           // lives on site: no transport
            if (tr.perDay && amountInput() === Number(t.amount)) return tr.perDay;   // own rate unless the admin typed another amount
        }
        return amountInput();
    }

    // [{ code, name, date }] the dialog would create, before amounts.
    function plannedRows() {
        var t = currentTemplate();
        if (!t) return [];
        var rows = [];
        var chosen = Array.prototype.filter.call(modal.querySelectorAll('.tpl-person input'), function (i) { return i.checked; })
            .map(function (i) { return ctx.people.filter(function (p) { return p.code === i.value; })[0]; });
        if (t.unit === 'once') {
            var d = (modal.querySelector('#assignDate') || {}).value;
            if (!d) return [];
            chosen.forEach(function (p) { rows.push({ code: p.code, name: p.name, date: d }); });
            return rows;
        }
        var from = modal.querySelector('#assignFrom').value;
        var to = modal.querySelector('#assignTo').value;
        if (!from || !to) return [];
        if (to < from) { var x = from; from = to; to = x; }
        var days = ctx.dates.filter(function (d) { return d >= from && d <= to; });
        chosen.forEach(function (p) {
            days.forEach(function (d) { rows.push({ code: p.code, name: p.name, date: d }); });
        });
        return rows;
    }

    function priced() {
        var t = currentTemplate();
        var out = { rows: [], skippedSite: 0, skippedDup: 0, total: 0, people: {} };
        plannedRows().forEach(function (r) {
            var amount = amountFor(t, r.code);
            if (amount === null) { out.skippedSite++; return; }
            var dup = assigned.some(function (a) {
                return a.templateId === t.id && a.employeeCode === r.code && a.date === r.date && a.projectCode === ctx.project.code;
            });
            if (dup) { out.skippedDup++; return; }
            r.amount = amount;
            out.rows.push(r);
            out.total += amount;
            out.people[r.code] = true;
        });
        return out;
    }

    function refreshSummary() {
        var ticked = modal.querySelectorAll('.tpl-person input:checked').length;
        modal.querySelector('#assignPeopleCount').textContent = 'People (' + ticked + ' of ' + ctx.people.length + ' selected)';
        var p = priced();
        var people = Object.keys(p.people).length;
        var extra = [];
        if (p.skippedSite) extra.push(p.skippedSite + ' skipped: lives on site');
        if (p.skippedDup) extra.push(p.skippedDup + ' already given');
        modal.querySelector('#assignSummary').textContent = people
            ? people + (people === 1 ? ' person' : ' people') + ' · ' + p.rows.length + (p.rows.length === 1 ? ' day' : ' days') + ' in total · ' + rupiah(p.total) +
              (extra.length ? ' (' + extra.join(', ') + ')' : '')
            : (extra.length ? 'Nothing new to add (' + extra.join(', ') + ')' : 'Nothing selected yet');
        modal.querySelector('#assignSubmit').disabled = !p.rows.length;
    }

    function submit() {
        var t = currentTemplate();
        var p = priced();
        if (!p.rows.length) return;
        var note = modal.querySelector('#assignNote').value.trim();
        var at = new Date().toISOString();
        p.rows.forEach(function (r, i) {
            assigned.push({ id: 'ASG-' + Date.now().toString(36).toUpperCase() + i, templateId: t.id, projectCode: ctx.project.code,
                            employeeCode: r.code, employeeName: r.name, date: r.date, amount: r.amount, note: note, at: at, by: 'Admin' });
        });
        store(KEY_ASSIGNED, assigned);
        window.bootstrap.Modal.getInstance(modal).hide();
        var people = Object.keys(p.people).length;
        if (window.FeriizNotify) {
            window.FeriizNotify.success(rupiah(p.total) + ' added to Additional for ' + people + (people === 1 ? ' person.' : ' people.'), t.name + ' assigned');
        }
        if (ctx.onDone) ctx.onDone(p.rows.length);
    }

    function openAssign(context) {
        ctx = context;
        if (!templates.length) {
            if (window.FeriizNotify) window.FeriizNotify.warning('Make a template on the Request Templates page first.', 'No template');
            return;
        }
        if (!modal) modal = buildModal();
        modal.querySelector('#assignTemplateContext').textContent = ctx.project.name + ' · ' + fmtDate(ctx.dates[0]) + ' – ' + fmtDate(ctx.dates[ctx.dates.length - 1]);
        modal.querySelector('#assignTemplateSelect').innerHTML = CATEGORIES.map(function (c) {
            var inCat = templates.filter(function (t) { return t.category === c.id; });
            if (!inCat.length) return '';
            return '<optgroup label="' + c.label + '">' + inCat.map(function (t) {
                return '<option value="' + t.id + '">' + esc(t.name) + ' · ' + rupiah(t.amount) + (t.unit === 'day' ? ' / day' : '') + '</option>';
            }).join('') + '</optgroup>';
        }).join('');
        if (ctx.templateId && get(ctx.templateId)) modal.querySelector('#assignTemplateSelect').value = ctx.templateId;
        modal.querySelector('#assignNote').value = '';
        modal.querySelector('#assignPeopleSearch').value = '';

        var people = ctx.people.slice().sort(function (a, b) { return (b.lastActive || '').localeCompare(a.lastActive || ''); });
        modal.querySelector('#assignPeople').innerHTML = people.map(function (p) {
            var idle = !p.lastActive || daysBetween(p.lastActive, ctx.today) > INACTIVE_DAYS;
            return '<label class="tpl-person" data-search="' + esc((p.name + ' ' + p.code).toLowerCase()) + '">' +
                '<input type="checkbox" class="form-check-input" value="' + esc(p.code) + '"' + (idle ? '' : ' checked') + '>' +
                '<span class="tpl-person-name">' + esc(p.name) + '<small>' + esc(p.code) + (p.occupation ? ' · ' + esc(p.occupation) : '') + '</small></span>' +
                '<span class="tpl-person-last' + (idle ? ' is-idle' : '') + '">' +
                    (p.lastActive ? 'Last active ' + fmtDate(p.lastActive) : 'No activity yet') + '</span>' +
            '</label>';
        }).join('');
        onTemplateChange(true);
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    window.FeriizTemplates = {
        CATEGORIES: CATEGORIES,
        UNITS: UNITS,
        category: category,
        chip: chip,
        rupiah: rupiah,
        fmtDate: fmtDate,
        all: function () { return templates.slice(); },
        get: get,
        save: save,
        additionalFor: additionalFor,
        transportOf: transportOf,
        setTransport: setTransport,
        openAssign: openAssign
    };
})();
