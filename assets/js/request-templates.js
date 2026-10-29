/* ============================================================
   FERIIZ — Request templates (uang makan, insentif tanggal merah...).

   Transport is not a template any more (Arcon MoM 20-10-2026, built 28-10-2026):
   each employee has a Transport / Day and the Report pays it automatically on
   every day with a log (report.js, TRANSPORT). The old Transport sample and its
   assignments are dropped when stored data is loaded, so it is never paid twice.

   As drawn on the whiteboard of the Arcon meeting (20-10-2026):
   - A template is made once for every project and reused (1:39): Name, Amount, Note.
   - Daily (every day of the range assigned) or One time on chosen dates. A One-time
     template keeps its dates, e.g. the year's red dates: the incentive is set once
     a year for all of them (1:31-1:33, 1:41).
   - "Assign Request" in the project Report hands it out (1:43). Each template
     then has its own column in the Report's Client group, shown only when
     someone has it in the period (2:01-2:04).
   - Someone who gets a different amount is assigned on their own with that
     amount. Baldy dropped the whiteboard's "Assign Request" on the Employee
     page (2026-10-26).
   - Every assignment is one person on one day (Feriiz team, 27-10-2026):
     Batch Update > Assign Request gives a template to exactly the selected
     days. The team does not want the requests listed inside the day cells.

   Prototype only: everything is kept in this browser (localStorage) so the
   Templates page and the Report see the same data. The API replaces this.

   FeriizTemplates.all(), get(id), findByName(name), save(template)
   FeriizTemplates.additionalFor(employeeCode, projectCode, dates)
   FeriizTemplates.usedIn(projectCode, employeeCodes, dates)
   FeriizTemplates.datesFor(employeeCode, projectCode, templateId, dates)   the days one person has it
   FeriizTemplates.openAssign(context)   Assign Request in the Report (people + days, or context.cells)
   FeriizTemplates.openDetail(context)   everyone who has one request on the days shown; remove the ticked ones
   ============================================================ */
(function () {
    'use strict';

    var KEY_TEMPLATES = 'feriiz_request_templates_v1';
    var KEY_ASSIGNED = 'feriiz_template_assignments_v1';
    var UNITS = { day: 'Daily', once: 'One time' };

    // Sample templates, as on the whiteboard (Uang Makan) plus this year's red-date incentive.
    // The ids are the ones the first samples had, so assignments made with them still match.
    var OLD_TRANSPORT_ID = 'TPL-003';   // the Transport sample, before transport became automatic
    var DEFAULT_TEMPLATES = [
        { id: 'TPL-001', name: 'Uang Makan', amount: 25000, unit: 'day', note: '' },
        { id: 'TPL-004', name: 'Insentif Tanggal Merah 2026', amount: 50000, unit: 'once', note: '',
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
    // The old Transport sample goes too: transport is paid automatically now.
    var templates = load(KEY_TEMPLATES, DEFAULT_TEMPLATES).filter(function (t) { return t.active !== false && t.id !== OLD_TRANSPORT_ID; });
    var assigned = load(KEY_ASSIGNED, []);
    if (assigned.some(function (a) { return a.templateId === OLD_TRANSPORT_ID; })) {
        assigned = assigned.filter(function (a) { return a.templateId !== OLD_TRANSPORT_ID; });
        store(KEY_ASSIGNED, assigned);
    }

    // "Transport" is the Report's automatic column, so no template may take that name.
    function reservedName(name) { return String(name || '').trim().toLowerCase() === 'transport'; }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function rupiah(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }
    function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

    function get(id) { return templates.filter(function (t) { return t.id === id; })[0] || null; }

    // The name is also the Report column title, so two templates may not share it.
    function findByName(name) {
        var key = String(name || '').trim().toLowerCase();
        return templates.filter(function (t) { return t.name.trim().toLowerCase() === key; })[0] || null;
    }

    function save(t) {
        var existing = t.id ? get(t.id) : null;
        if (existing) {
            Object.keys(t).forEach(function (k) { existing[k] = t[k]; });
            delete existing.category;   // templates had categories before the whiteboard version
        } else {
            t.id = 'TPL-' + Date.now().toString(36).toUpperCase();
            t.createdAt = new Date().toISOString();
            templates.unshift(t);
        }
        store(KEY_TEMPLATES, templates);
        return existing || t;
    }

    // { total, items: [{ templateId, name, count, amount, notes }] } for the given days.
    function additionalFor(employeeCode, projectCode, dates) {
        var inRange = {};
        (dates || []).forEach(function (d) { inRange[d] = true; });
        var byTemplate = {};
        var total = 0;
        assigned.forEach(function (a) {
            if (a.employeeCode !== employeeCode || a.projectCode !== projectCode || !inRange[a.date]) return;
            var t = get(a.templateId) || { name: 'Template' };
            var item = byTemplate[a.templateId] ||
                (byTemplate[a.templateId] = { templateId: a.templateId, name: t.name, count: 0, amount: 0, notes: [] });
            item.count++;
            item.amount += a.amount;
            total += a.amount;
            if (a.note && item.notes.indexOf(a.note) < 0) item.notes.push(a.note);
        });
        return { total: total, items: Object.keys(byTemplate).map(function (k) { return byTemplate[k]; }) };
    }

    // [{ id, name }] of the templates any of these people received in the project on these days:
    // the Report's dynamic Client columns. Oldest template first, so a new one is added on the
    // right instead of pushing the others along (the samples have no createdAt and come first).
    function usedIn(projectCode, employeeCodes, dates) {
        var inRange = {};
        var people = {};
        var ids = {};
        (dates || []).forEach(function (d) { inRange[d] = true; });
        (employeeCodes || []).forEach(function (c) { people[c] = true; });
        assigned.forEach(function (a) {
            if (a.projectCode === projectCode && inRange[a.date] && people[a.employeeCode]) ids[a.templateId] = true;
        });
        var cols = templates.filter(function (t) { return ids[t.id]; })
            .sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); })
            .map(function (t) { return { id: t.id, name: t.name }; });
        Object.keys(ids).forEach(function (id) { if (!get(id)) cols.push({ id: id, name: 'Template' }); });
        return cols;
    }

    // One person's assignments of one template on these days, by date.
    function assignmentsFor(employeeCode, projectCode, templateId, dates) {
        var inRange = {};
        (dates || []).forEach(function (d) { inRange[d] = true; });
        return assigned.filter(function (a) {
            return a.employeeCode === employeeCode && a.projectCode === projectCode && a.templateId === templateId && inRange[a.date];
        }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    }

    function datesFor(employeeCode, projectCode, templateId, dates) {
        return assignmentsFor(employeeCode, projectCode, templateId, dates).map(function (a) { return a.date; });
    }

    function removeAssignments(ids) {
        var drop = {};
        ids.forEach(function (id) { drop[id] = true; });
        assigned = assigned.filter(function (a) { return !drop[a.id]; });
        store(KEY_ASSIGNED, assigned);
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

    var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function dayChipText(iso) {
        var d = fromISO(iso);
        return WEEKDAYS[d.getDay()] + ' ' + d.getDate();
    }

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    // "All occupations (134)", then each occupation with how many of these people have it.
    function occupationOptions(people, keep) {
        var counts = {};
        people.forEach(function (p) { if (p.occupation) counts[p.occupation] = (counts[p.occupation] || 0) + 1; });
        var names = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); });
        return '<option value="">All occupations (' + people.length + ')</option>' + names.map(function (o) {
            return '<option value="' + esc(o) + '"' + (o === keep ? ' selected' : '') + '>' + esc(o) + ' (' + counts[o] + ')</option>';
        }).join('');
    }

    function initTooltips(el) {
        if (!window.bootstrap || !window.bootstrap.Tooltip) return;
        el.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (x) { window.bootstrap.Tooltip.getOrCreateInstance(x); });
    }

    function templateOptions() {
        return templates.map(function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(t.name) + ' · ' + rupiah(t.amount) + '</option>';
        }).join('');
    }

    function noTemplates() {
        if (templates.length) return false;
        if (window.FeriizNotify) window.FeriizNotify.warning('Make a template on the Request Templates page first.', 'No template');
        return true;
    }

    /* ---------- Assign Request (Report toolbar) ----------
       context = {
         project: { code, name },
         people: [{ code, name, occupation, lastActive }],
         dates: [visible ISO dates], today: ISO,
         workedOn: function (code, date) -> true when the person came in that day,
         onDone: function (count)
       }
       A Daily template is given on the days From-To each person came in; a One-time
       template on its dates (red dates are days off). People who did not come in at all
       are left unticked, and an Occupation filter narrows who gets it, since amounts
       differ per group (Baldy, 29-10-2026). Each person's row says what they get
       ("2 days · Rp 50.000", "Did not come in", "Already has it"), so the admin sees
       how many days before assigning. */
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
                            '<h2 class="modal-title" id="assignTemplateTitle">Assign Request</h2>' +
                            '<p class="tpl-subtitle" id="assignTemplateContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="row g-3">' +
                            '<div class="col-md-7">' +
                                '<label class="form-label" for="assignTemplateSelect">Select Template</label>' +
                                '<select class="form-select" id="assignTemplateSelect"></select>' +
                                '<div class="form-text" id="assignTemplateInfo"></div>' +
                            '</div>' +
                            '<div class="col-md-5">' +
                                '<label class="form-label" for="assignAmount">Amount</label>' +
                                '<div class="input-group">' +
                                    '<span class="input-group-text">Rp</span>' +
                                    '<input type="text" inputmode="numeric" class="form-control" id="assignAmount">' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<div class="tpl-when" id="assignWhen"></div>' +
                        '<div id="assignPeopleBlock">' +
                            '<div class="tpl-people-head">' +
                                '<span class="tpl-people-label">People' +
                                    '<button type="button" class="tpl-help" data-bs-toggle="tooltip" data-bs-title="People who came in on these days are ticked. A Daily request is only given on the days each person came in." aria-label="Who is ticked"><i class="fa-regular fa-circle-question" aria-hidden="true"></i></button>' +
                                '</span>' +
                                '<div class="tpl-people-tools">' +
                                    '<select class="form-select form-select-sm" id="assignOccupation" aria-label="Occupation"></select>' +
                                    '<input type="search" class="form-control form-control-sm" id="assignPeopleSearch" placeholder="Search name or code" aria-label="Search people">' +
                                '</div>' +
                            '</div>' +
                            '<div class="tpl-people" id="assignPeople" role="group" aria-label="People">' +
                                '<label class="tpl-list-head">' +
                                    '<input type="checkbox" class="form-check-input" id="assignAll" aria-label="Tick everyone shown">' +
                                    '<span id="assignPeopleCount">Select all</span>' +
                                    '<span>Days · Amount</span>' +
                                '</label>' +
                                '<div id="assignPeopleRows"></div>' +
                            '</div>' +
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

        el.querySelector('#assignTemplateSelect').addEventListener('change', onTemplateChange);
        el.querySelector('#assignAmount').addEventListener('input', function (e) {
            var d = digits(e.target.value);
            e.target.value = d ? Number(d).toLocaleString('id-ID') : '';
            refreshSummary();
        });
        el.querySelector('#assignWhen').addEventListener('change', function (e) {
            // New From-To: tick again whoever came in on those days.
            if (e.target.id === 'assignFrom' || e.target.id === 'assignTo') applyDefaultTicks();
            refreshSummary();
        });
        el.querySelector('#assignWhen').addEventListener('input', refreshSummary);
        el.querySelector('#assignPeople').addEventListener('change', function (e) {
            if (e.target.id === 'assignAll') tickShown(modal, e.target.checked);
            refreshSummary();
        });
        el.querySelector('#assignPeopleSearch').addEventListener('input', function () {
            applyPeopleFilter();
            syncTickAll(modal, '#assignAll');
        });
        el.querySelector('#assignOccupation').addEventListener('change', function () {
            applyPeopleFilter();
            refreshSummary();
        });
        el.querySelector('#assignSubmit').addEventListener('click', submit);
        initTooltips(el);
        return el;
    }

    // The tick in the list head ticks or unticks everyone shown (after Occupation and search).
    function tickShown(box, on) {
        box.querySelectorAll('.tpl-person').forEach(function (row) {
            if (!row.hidden) row.querySelector('input').checked = on;
        });
    }

    function syncTickAll(box, selector) {
        var shown = Array.prototype.filter.call(box.querySelectorAll('.tpl-person'), function (row) { return !row.hidden; });
        var ticked = shown.filter(function (row) { return row.querySelector('input').checked; }).length;
        var all = box.querySelector(selector);
        all.checked = shown.length > 0 && ticked === shown.length;
        all.indeterminate = ticked > 0 && ticked < shown.length;
        all.disabled = !shown.length;
    }

    // The Occupation filter decides who can get it; the search only helps to find someone.
    function chosenOccupation() { return modal.querySelector('#assignOccupation').value; }

    function inScope(row) {
        var occ = chosenOccupation();
        return !occ || row.dataset.occupation === occ;
    }

    function applyPeopleFilter() {
        var q = modal.querySelector('#assignPeopleSearch').value.trim().toLowerCase();
        modal.querySelectorAll('.tpl-person').forEach(function (row) {
            row.hidden = !inScope(row) || Boolean(q && row.dataset.search.indexOf(q) < 0);
        });
    }

    function cameIn(code, date) { return !ctx.workedOn || ctx.workedOn(code, date); }

    // The days a person can get the template: for Daily only the days they came in.
    function payableDays(t, code, days) {
        return t.unit === 'once' ? days : days.filter(function (d) { return cameIn(code, d); });
    }

    // Who came in on the days that count (From-To for Daily, the report period for One time)
    // is ticked; who did not come in at all is unticked, and their row says so.
    function applyDefaultTicks() {
        var t = currentTemplate();
        if (!t || ctx.cells) return;
        var days = t.unit === 'once' ? ctx.dates : chosenDays(t);
        modal.querySelectorAll('.tpl-person').forEach(function (row) {
            var came = days.some(function (d) { return cameIn(row.dataset.code, d); });
            row.querySelector('input').checked = came;
            row.dataset.absent = came ? '' : '1';
        });
    }

    // { 'CODE|YYYY-MM-DD': true } for every day someone already has this template in the project.
    function givenIndex(templateId) {
        var index = {};
        assigned.forEach(function (a) {
            if (a.templateId === templateId && a.projectCode === ctx.project.code) index[a.employeeCode + '|' + a.date] = true;
        });
        return index;
    }

    // What each person gets with the template, days and amount chosen now.
    function refreshPeopleMeta() {
        var t = currentTemplate();
        if (!t) return;
        var days = chosenDays(t);
        var given = givenIndex(t.id);
        var amount = amountInput();
        modal.querySelectorAll('.tpl-person').forEach(function (row) {
            var code = row.dataset.code;
            var payable = payableDays(t, code, days);
            var fresh = payable.filter(function (d) { return !given[code + '|' + d]; });
            var absent = !payable.length || (row.dataset.absent === '1' && !row.querySelector('input').checked);
            var meta = row.querySelector('.tpl-person-meta');
            meta.classList.toggle('is-idle', absent);
            meta.classList.toggle('is-muted', !absent && !fresh.length);
            meta.textContent = absent ? 'Did not come in'
                : !fresh.length ? 'Already has it'
                : plural(fresh.length, 'day', 'days') + ' · ' + rupiah(fresh.length * amount);
        });
    }

    function currentTemplate() { return get(modal.querySelector('#assignTemplateSelect').value); }

    function onTemplateChange() {
        var t = currentTemplate();
        if (!t) return;
        modal.querySelector('#assignAmount').value = Number(t.amount).toLocaleString('id-ID');
        modal.querySelector('#assignTemplateInfo').textContent = (UNITS[t.unit] || UNITS.day) +
            (t.unit === 'once' ? '' : ', only on the days each person came in') + (t.note ? ' · ' + t.note : '');
        if (!ctx.cells) {
            renderWhen(t);
            applyDefaultTicks();
        }
        refreshSummary();
    }

    // Daily: every day From-To. One time: the template's dates inside the report period
    // (all ticked), or any day when none of them falls in it.
    function renderWhen(t) {
        var box = modal.querySelector('#assignWhen');
        var first = ctx.dates[0];
        var last = ctx.dates[ctx.dates.length - 1];
        if (t.unit === 'once') {
            var inRange = (t.dates || []).filter(function (d) { return d.date >= first && d.date <= last; });
            box.innerHTML = inRange.length
                ? '<span class="form-label d-block">Dates</span>' +
                  '<div class="tpl-when-dates">' + inRange.map(function (d) {
                      return '<label class="tpl-check"><input type="checkbox" class="form-check-input" name="assignDates" value="' + esc(d.date) + '" checked> ' +
                          fmtDate(d.date) + (d.name ? ' <small>' + esc(d.name) + '</small>' : '') + '</label>';
                  }).join('') + '</div>' +
                  '<div class="form-text">This template\'s dates inside the report period.</div>'
                : '<label class="form-label" for="assignDate">Date</label>' +
                  '<input type="date" class="form-control" id="assignDate" min="' + first + '" max="' + last + '" value="' + last + '">' +
                  '<div class="form-text">None of this template\'s dates are in the report period; pick a day.</div>';
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

    function chosenDays(t) {
        if (t.unit === 'once') {
            var single = modal.querySelector('#assignDate');
            if (single) return single.value ? [single.value] : [];
            return Array.prototype.filter.call(modal.querySelectorAll('[name="assignDates"]'), function (i) { return i.checked; })
                .map(function (i) { return i.value; });
        }
        var from = modal.querySelector('#assignFrom').value;
        var to = modal.querySelector('#assignTo').value;
        if (!from || !to) return [];
        if (to < from) { var x = from; from = to; to = x; }
        return ctx.dates.filter(function (d) { return d >= from && d <= to; });
    }

    // { rows: [{ code, name, date }], absent } the dialog would create, before amounts.
    // From Batch Update the days are the selected cells; a Daily template still skips
    // the ones where the person did not come in (absent counts them).
    function plannedRows() {
        var t = currentTemplate();
        var out = { rows: [], absent: 0 };
        if (!t) return out;
        if (ctx.cells) {
            ctx.cells.forEach(function (c) {
                if (payableDays(t, c.code, [c.date]).length) out.rows.push({ code: c.code, name: c.name, date: c.date });
                else out.absent++;
            });
            return out;
        }
        var days = chosenDays(t);
        Array.prototype.forEach.call(modal.querySelectorAll('.tpl-person'), function (row) {
            var input = row.querySelector('input');
            if (!input.checked || !inScope(row)) return;
            var p = ctx.people.filter(function (x) { return x.code === input.value; })[0];
            payableDays(t, p.code, days).forEach(function (d) { out.rows.push({ code: p.code, name: p.name, date: d }); });
        });
        return out;
    }

    function priced() {
        var t = currentTemplate();
        var planned = plannedRows();
        var out = { rows: [], skippedDup: 0, absent: planned.absent, total: 0, people: {} };
        var given = t ? givenIndex(t.id) : {};
        planned.rows.forEach(function (r) {
            if (given[r.code + '|' + r.date]) { out.skippedDup++; return; }
            r.amount = amountInput();
            if (!r.amount) return;
            out.rows.push(r);
            out.total += r.amount;
            out.people[r.code] = true;
        });
        return out;
    }

    function refreshSummary() {
        if (!ctx.cells) {
            var rows = Array.prototype.filter.call(modal.querySelectorAll('.tpl-person'), inScope);
            var ticked = rows.filter(function (row) { return row.querySelector('input').checked; }).length;
            modal.querySelector('#assignPeopleCount').textContent = ticked + ' of ' + rows.length + ' ticked';
            refreshPeopleMeta();
            syncTickAll(modal, '#assignAll');
        }
        var p = priced();
        var people = Object.keys(p.people).length;
        var notes = [];
        if (p.skippedDup) notes.push(p.skippedDup + ' already given');
        if (p.absent) notes.push(p.absent + (p.absent === 1 ? ' day' : ' days') + ' without a log left out');
        var extra = notes.length ? ' (' + notes.join(', ') + ')' : '';
        modal.querySelector('#assignSummary').textContent = people
            ? people + (people === 1 ? ' person' : ' people') + ' · ' + p.rows.length + (p.rows.length === 1 ? ' day' : ' days') + ' in total · ' + rupiah(p.total) + extra
            : (notes.length ? 'Nothing new to add' + extra : 'Nothing selected yet');
        modal.querySelector('#assignSubmit').disabled = !p.rows.length;
    }

    function submit() {
        var t = currentTemplate();
        var p = priced();
        if (!p.rows.length) return;
        var note = modal.querySelector('#assignNote').value.trim();
        var at = new Date().toISOString();
        var batch = 'B-' + Date.now().toString(36).toUpperCase();   // one Assign, removable as one row
        p.rows.forEach(function (r, i) {
            assigned.push({ id: 'ASG-' + Date.now().toString(36).toUpperCase() + i, batch: batch, templateId: t.id, projectCode: ctx.project.code,
                            employeeCode: r.code, employeeName: r.name, date: r.date, amount: r.amount, note: note, at: at, by: 'Admin' });
        });
        store(KEY_ASSIGNED, assigned);
        window.bootstrap.Modal.getInstance(modal).hide();
        var people = Object.keys(p.people).length;
        if (window.FeriizNotify) {
            window.FeriizNotify.success(rupiah(p.total) + ' given to ' + people + (people === 1 ? ' person' : ' people') +
                '. It shows in the ' + t.name + ' column under Client.', t.name + ' assigned');
        }
        if (ctx.onDone) ctx.onDone(p.rows.length);
    }

    // context.cells = [{ code, name, date }] from Batch Update: the days are already chosen,
    // so the people list and the dates are not asked again.
    function openAssign(context) {
        ctx = context;
        if (noTemplates()) return;
        if (!modal) modal = buildModal();
        var cells = ctx.cells || null;
        var picked = {};
        (cells || []).forEach(function (c) { picked[c.code] = true; });
        var pickedCount = Object.keys(picked).length;
        modal.querySelector('#assignWhen').hidden = Boolean(cells);
        modal.querySelector('#assignPeopleBlock').hidden = Boolean(cells);
        modal.querySelector('#assignTemplateContext').textContent = ctx.project.name + ' · ' + (cells
            ? cells.length + (cells.length === 1 ? ' day' : ' days') + ' selected for ' + pickedCount + (pickedCount === 1 ? ' person' : ' people')
            : fmtDate(ctx.dates[0]) + ' – ' + fmtDate(ctx.dates[ctx.dates.length - 1]));
        modal.querySelector('#assignTemplateSelect').innerHTML = templateOptions();
        modal.querySelector('#assignNote').value = '';
        modal.querySelector('#assignPeopleSearch').value = '';
        if (cells) {
            onTemplateChange();
            window.bootstrap.Modal.getOrCreateInstance(modal).show();
            return;
        }

        var people = ctx.people.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
        modal.querySelector('#assignOccupation').innerHTML = occupationOptions(people, '');
        modal.querySelector('#assignPeople').scrollTop = 0;
        // The ticks are set by applyDefaultTicks (onTemplateChange): who came in on these days.
        modal.querySelector('#assignPeopleRows').innerHTML = people.map(function (p) {
            return '<label class="tpl-person" data-code="' + esc(p.code) + '" data-occupation="' + esc(p.occupation || '') + '"' +
                ' data-search="' + esc((p.name + ' ' + p.code).toLowerCase()) + '">' +
                '<input type="checkbox" class="form-check-input" value="' + esc(p.code) + '">' +
                '<span class="tpl-person-name">' + esc(p.name) + '<small>' + esc(p.code) + (p.occupation ? ' · ' + esc(p.occupation) : '') + '</small></span>' +
                '<span class="tpl-person-meta"></span>' +
            '</label>';
        }).join('');
        applyPeopleFilter();
        onTemplateChange();
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    /* ---------- Who has a request (Report: click an amount, or the column title) ----------
       context = {
         project: { code, name }, templateId, dates: [visible ISO dates],
         people: [{ code, name, occupation }],
         focusCode: the person whose amount was clicked (ticked and listed first), '' from the title,
         onDone: function ()
       }
       One list of everyone who has the request on the days shown, with their days and amount
       (meeting 2:00: "detailnya seperti pop up"). Remove, at the bottom, takes it off the ticked
       people inside the chosen occupation. The same button undoes a wrong Assign for everyone,
       for one occupation or for one person (Baldy 29-10-2026: "yang delete all itu yang bawah",
       "pengen apus yang tukang besi doang"). When and by whom is in each row's tooltip. */
    var listModal = null;
    var listCtx = null;
    var listPeople = [];   // [{ code, name, occupation, ids, dates, total, rate, notes, at, by }]
    var listConfirming = false;

    // Everyone with this request in the project on the days shown, one entry per person.
    function holders() {
        var inRange = {};
        var info = {};
        var byCode = {};
        var out = [];
        listCtx.dates.forEach(function (d) { inRange[d] = true; });
        (listCtx.people || []).forEach(function (p) { info[p.code] = p; });
        assigned.forEach(function (a) {
            if (a.templateId !== listCtx.templateId || a.projectCode !== listCtx.project.code || !inRange[a.date]) return;
            var h = byCode[a.employeeCode];
            if (!h) {
                var p = info[a.employeeCode] ||
                    (window.FERIIZ_DATA && window.FERIIZ_DATA.findEmployeeByCode ? window.FERIIZ_DATA.findEmployeeByCode(a.employeeCode) : null) || {};
                h = byCode[a.employeeCode] = { code: a.employeeCode, name: p.name || a.employeeName || a.employeeCode, occupation: p.occupation || '',
                                               ids: [], dates: [], total: 0, rate: a.amount, notes: [], at: a.at, by: a.by };
                out.push(h);
            }
            h.ids.push(a.id);
            h.dates.push(a.date);
            h.total += a.amount;
            if (h.rate !== a.amount) h.rate = null;   // not the same amount every day
            if (a.note && h.notes.indexOf(a.note) < 0) h.notes.push(a.note);
            if ((a.at || '') > (h.at || '')) { h.at = a.at; h.by = a.by; }
        });
        out.forEach(function (h) { h.dates.sort(); });
        var focus = listCtx.focusCode;
        return out.sort(function (a, b) {
            if (a.code === focus) return -1;
            if (b.code === focus) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    // "06 May 2026", "29 Jun 2026 – 30 Jun 2026", or a short list when the days are not in a row.
    function dateSpan(dates) {
        if (dates.length === 1) return fmtDate(dates[0]);
        var inRow = dates.every(function (d, i) { return !i || daysBetween(dates[i - 1], d) === 1; });
        if (inRow) return fmtDate(dates[0]) + ' – ' + fmtDate(dates[dates.length - 1]);
        var shown = dates.slice(0, 3).map(fmtDate).join(', ');
        return dates.length > 3 ? shown + ' and ' + (dates.length - 3) + ' more' : shown;
    }

    // Up to a week as day chips ("Mon 29"); a longer stretch as dates and a count.
    function daysHTML(dates) {
        if (dates.length <= 7) {
            return '<span class="tpl-days">' + dates.map(function (d) {
                return '<span class="tpl-day" title="' + fmtDate(d) + '">' + dayChipText(d) + '</span>';
            }).join('') + '</span>';
        }
        return '<span class="tpl-days-text">' + esc(dateSpan(dates)) + ' · ' + plural(dates.length, 'day', 'days') + '</span>';
    }

    function holderRowHTML(h, ticked) {
        var given = 'Given ' + fmtDate(h.at) + (h.by ? ' by ' + h.by : '');
        return '<label class="tpl-person tpl-person--holder" data-code="' + esc(h.code) + '" data-occupation="' + esc(h.occupation) + '"' +
            ' data-search="' + esc((h.name + ' ' + h.code).toLowerCase()) + '" title="' + esc(given) + '">' +
            '<input type="checkbox" class="form-check-input" value="' + esc(h.code) + '"' + (ticked ? ' checked' : '') + '>' +
            '<span class="tpl-person-name">' + esc(h.name) + '<small>' + esc(h.code) + (h.occupation ? ' · ' + esc(h.occupation) : '') + '</small></span>' +
            '<span class="tpl-person-days">' + daysHTML(h.dates) + (h.notes.length ? '<small>' + esc(h.notes.join('; ')) + '</small>' : '') + '</span>' +
            '<span class="tpl-person-amount">' + rupiah(h.total) +
                (h.dates.length > 1 && h.rate ? '<small>' + h.dates.length + ' × ' + rupiah(h.rate) + '</small>' : '') + '</span>' +
        '</label>';
    }

    function buildListModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'templateDetailModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'templateDetailTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="templateDetailTitle">Request</h2>' +
                            '<p class="tpl-subtitle" id="templateDetailContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="tpl-people-head mt-0" id="detailTools">' +
                            '<span class="tpl-people-label">People</span>' +
                            '<div class="tpl-people-tools">' +
                                '<select class="form-select form-select-sm" id="detailOccupation" aria-label="Occupation"></select>' +
                                '<input type="search" class="form-control form-control-sm" id="detailSearch" placeholder="Search name or code" aria-label="Search people">' +
                            '</div>' +
                        '</div>' +
                        '<div class="tpl-people tpl-people--tall" id="detailPeople" role="group" aria-label="People">' +
                            '<label class="tpl-list-head tpl-person--holder">' +
                                '<input type="checkbox" class="form-check-input" id="detailAll" aria-label="Tick everyone shown">' +
                                '<span id="detailCount">Select all</span>' +
                                '<span class="tpl-list-head-days">Days</span>' +
                                '<span class="tpl-person-amount">Amount</span>' +
                            '</label>' +
                            '<div id="detailRows"></div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<span class="tpl-summary me-auto" id="detailSummary"></span>' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal" id="detailClose">Close</button>' +
                        '<button type="button" class="btn btn-outline-danger" id="detailRemove">Remove</button>' +
                        '<button type="button" class="btn btn-outline" id="detailCancel" hidden>Cancel</button>' +
                        '<button type="button" class="btn btn-danger" id="detailConfirm" hidden>Yes, remove</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#detailPeople').addEventListener('change', function (e) {
            if (e.target.id === 'detailAll') tickShown(listModal, e.target.checked);
            setListConfirm(false);
            refreshList();
        });
        el.querySelector('#detailSearch').addEventListener('input', function () {
            applyListFilter();
            syncTickAll(listModal, '#detailAll');
        });
        el.querySelector('#detailOccupation').addEventListener('change', function () {
            setListConfirm(false);
            applyListFilter();
            refreshList();
        });
        el.querySelector('#detailRemove').addEventListener('click', function () { setListConfirm(true); });
        el.querySelector('#detailCancel').addEventListener('click', function () {
            setListConfirm(false);
            refreshList();
        });
        el.querySelector('#detailConfirm').addEventListener('click', removeTicked);
        el.addEventListener('hidden.bs.modal', function () { setListConfirm(false); });
        return el;
    }

    // As in Assign Request: the Occupation filter decides who Remove covers; the search only finds.
    function listOccupation() { return listModal.querySelector('#detailOccupation').value; }

    function inListScope(occupation) {
        var occ = listOccupation();
        return !occ || occupation === occ;
    }

    function applyListFilter() {
        var q = listModal.querySelector('#detailSearch').value.trim().toLowerCase();
        var shown = 0;
        listModal.querySelectorAll('.tpl-person[data-code]').forEach(function (row) {
            row.hidden = !inListScope(row.dataset.occupation) || Boolean(q && row.dataset.search.indexOf(q) < 0);
            if (!row.hidden) shown++;
        });
        var none = listModal.querySelector('#detailNoMatch');
        if (none) none.hidden = shown > 0;
    }

    function tickedPeople() {
        var codes = {};
        listModal.querySelectorAll('.tpl-person[data-code]').forEach(function (row) {
            if (inListScope(row.dataset.occupation) && row.querySelector('input').checked) codes[row.dataset.code] = true;
        });
        return listPeople.filter(function (h) { return codes[h.code]; });
    }

    function sumUp(people) {
        return people.reduce(function (s, h) {
            s.days += h.dates.length;
            s.total += h.total;
            return s;
        }, { people: people.length, days: 0, total: 0 });
    }

    function sumText(s) {
        return plural(s.people, 'person', 'people') + ' · ' + plural(s.days, 'day', 'days') + ' · ' + rupiah(s.total);
    }

    // The count in the list head, the footer summary and the Remove button follow the ticks.
    function refreshList() {
        var occ = listOccupation();
        var scoped = listPeople.filter(function (h) { return inListScope(h.occupation); });
        var ticked = tickedPeople();
        listModal.querySelector('#detailCount').textContent = ticked.length + ' of ' + scoped.length + ' ticked';
        syncTickAll(listModal, '#detailAll');
        listModal.querySelector('#detailSummary').textContent = !listPeople.length ? ''
            : ticked.length ? 'Ticked: ' + sumText(sumUp(ticked))
            : (occ || 'Total') + ': ' + sumText(sumUp(scoped));
        var remove = listModal.querySelector('#detailRemove');
        remove.disabled = !ticked.length;
        remove.textContent = ticked.length ? 'Remove from ' + plural(ticked.length, 'person', 'people') : 'Remove';
        remove.hidden = !listPeople.length || listConfirming;
    }

    // Remove asks once, in the footer, repeating exactly what goes.
    function setListConfirm(on) {
        listConfirming = on;
        if (!listModal) return;
        var summary = listModal.querySelector('#detailSummary');
        listModal.querySelector('#detailClose').hidden = on;
        listModal.querySelector('#detailRemove').hidden = on;
        listModal.querySelector('#detailCancel').hidden = !on;
        listModal.querySelector('#detailConfirm').hidden = !on;
        summary.classList.toggle('is-danger', on);
        if (!on) return;
        var t = get(listCtx.templateId) || { name: 'this request' };
        var s = sumUp(tickedPeople());
        summary.textContent = 'Remove ' + t.name + ' from ' + plural(s.people, 'person', 'people') + '? ' +
            plural(s.days, 'day', 'days') + ' · ' + rupiah(s.total);
        listModal.querySelector('#detailConfirm').focus();
    }

    function removeTicked() {
        var people = tickedPeople();
        if (!people.length) return;
        var t = get(listCtx.templateId) || { name: 'Template' };
        var s = sumUp(people);
        var ids = [];
        people.forEach(function (h) { ids = ids.concat(h.ids); });
        removeAssignments(ids);
        setListConfirm(false);
        renderList(false);
        if (window.FeriizNotify) {
            window.FeriizNotify.success('Taken off ' + plural(s.people, 'person', 'people') + ': ' +
                plural(s.days, 'day', 'days') + ' · ' + rupiah(s.total) + '.', t.name + ' removed');
        }
        if (listCtx.onDone) listCtx.onDone();
    }

    // tickFocus: the clicked person starts ticked (only when the popup opens).
    function renderList(tickFocus) {
        var t = get(listCtx.templateId) || { name: 'Template' };
        listPeople = holders();
        listModal.querySelector('#templateDetailTitle').textContent = t.name;
        listModal.querySelector('#templateDetailContext').textContent = listCtx.project.name + ' · ' +
            fmtDate(listCtx.dates[0]) + ' – ' + fmtDate(listCtx.dates[listCtx.dates.length - 1]);
        var occSelect = listModal.querySelector('#detailOccupation');
        occSelect.innerHTML = occupationOptions(listPeople, occSelect.value);
        listModal.querySelector('#detailTools').hidden = !listPeople.length;
        listModal.querySelector('#detailRows').innerHTML = listPeople.length
            ? listPeople.map(function (h) { return holderRowHTML(h, tickFocus && h.code === listCtx.focusCode); }).join('') +
              '<p class="tpl-list-empty" id="detailNoMatch" hidden>No one here matches the search.</p>'
            : '<p class="tpl-list-empty">No one has ' + esc(t.name) + ' on these days.</p>';
        listModal.querySelector('#detailPeople .tpl-list-head').hidden = !listPeople.length;
        applyListFilter();
        refreshList();
    }

    function openDetail(context) {
        listCtx = context;
        if (!listModal) listModal = buildListModal();
        listModal.querySelector('#detailSearch').value = '';
        listModal.querySelector('#detailOccupation').value = '';
        setListConfirm(false);
        renderList(true);
        listModal.querySelector('#detailPeople').scrollTop = 0;
        window.bootstrap.Modal.getOrCreateInstance(listModal).show();
    }

    window.FeriizTemplates = {
        UNITS: UNITS,
        rupiah: rupiah,
        fmtDate: fmtDate,
        all: function () { return templates.slice(); },
        get: get,
        findByName: findByName,
        reservedName: reservedName,
        save: save,
        additionalFor: additionalFor,
        usedIn: usedIn,
        datesFor: datesFor,
        openAssign: openAssign,
        openDetail: openDetail
    };
})();
