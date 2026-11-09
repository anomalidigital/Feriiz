/* ============================================================
   FERIIZ — Request templates (uang makan, insentif tanggal merah...).

   Transport is not a template any more (Arcon MoM 20-10-2026, built 28-10-2026):
   each employee has a Transport / Day and the Report pays it automatically on
   every day with a log (report.js, TRANSPORT). The old Transport sample and its
   assignments are dropped when stored data is loaded, so it is never paid twice.

   As drawn on the whiteboard of the Arcon meeting (20-10-2026):
   - A template is made once for every project and reused (1:39): Name, Amount, Note.
   - A template made here is per day: each ticked day gets its Amount. The Daily / One time
     choice and the One-time dates with their own amounts are gone from it (Baldy, 04-11-2026:
     "secara logika agak bingung").
   - One-off payments (THR, the red dates) are templates of ONE project, made on that
     project's Templates page (Baldy, 09-11-2026: "taro nya paling ideal yang itu di project…
     ada add time juga tanggal berapa dan amount nya berapa"; meeting 05-11-2026, 0:38:14 and
     1:04:16: "namain dulu, ini hari apa, tanggal berapa, terus… harganya"). They carry the
     project's code and their dates, each date with a name and its own amount (empty = the
     template's Amount), as the One-time templates had (03-11-2026). Assign Request gives
     them only on the ticked days that are one of their dates, with or without a log: the
     Report's Log Status filter says whether only the people who came in get it. A template
     can be copied, to this project or another, so its dates are not typed again.
   - A per-day template's Amount can be changed in Assign Request, for that Assign only
     (Baldy, 09-11-2026: "ada custom amount… soal nya belum pasti"; meeting 05-11-2026,
     0:41:32-0:43:45: people of another occupation are filtered, ticked and given their own).
   - "Assign Request" in the project Report hands it out (1:43). Each template
     then has its own column in the Report's Client group, shown only when
     someone has it in the period (2:01-2:04).
   - Someone who gets a different amount is assigned on their own with that
     amount. Baldy dropped the whiteboard's "Assign Request" on the Employee
     page (2026-10-26).
   - Every assignment is one person on one day (Feriiz team, 27-10-2026):
     Batch Update > Assign Request gives a template to exactly the ticked days,
     and Batch Update > Delete Request takes it off them again (Baldy, 04-11-2026).
     A day shows what it was given as small chips with the template's name, on a
     line under the day.

   Prototype only: everything is kept in this browser (localStorage) so the
   Templates page and the Report see the same data. The API replaces this.

   FeriizTemplates.all(), ofProject(code), get(id), findByName(name, projectCode), save(template)
   FeriizTemplates.onDates(template), amountOn(template, date)   a project's own template and its dates
   FeriizTemplates.additionalFor(employeeCode, projectCode, dates)
   FeriizTemplates.usedIn(projectCode, employeeCodes, dates)
   FeriizTemplates.dayIndex(projectCode, dates)   what each person got on each day: the Report's day chips
   FeriizTemplates.openAssign(context)   Assign Request in the Report (Batch Update: the ticked days)
   FeriizTemplates.openRemove(context)   Delete Request in the Report (Batch Update: the ticked days)
   ============================================================ */
(function () {
    'use strict';

    var KEY_TEMPLATES = 'feriiz_request_templates_v1';
    var KEY_ASSIGNED = 'feriiz_template_assignments_v1';

    // Sample templates, as on the whiteboard (Uang Makan) plus an incentive for working on a red date.
    // The ids are the ones the first samples had, so assignments made with them still match.
    var OLD_TRANSPORT_ID = 'TPL-003';   // the Transport sample, before transport became automatic
    var DEFAULT_TEMPLATES = [
        { id: 'TPL-001', name: 'Uang Makan', amount: 25000, note: '' },
        { id: 'TPL-004', name: 'Insentif Tanggal Merah 2026', amount: 50000, note: '' }
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
    // Templates for every project saved before 04-11-2026 may still say Daily / One time and carry
    // dates: they are all per day now. Only a project's own templates keep dates.
    templates.forEach(function (t) {
        if (t.projectCode) return;
        delete t.unit;
        delete t.dates;
    });
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

    function get(id) { return templates.filter(function (t) { return t.id === id; })[0] || null; }

    // A project's own template is given on its dates; the others per day.
    function onDates(t) { return Boolean(t && t.projectCode); }

    // What a project's template pays on one of its dates: the date's own amount, else its Amount.
    function amountOn(t, date) {
        var d = (t.dates || []).filter(function (x) { return x.date === date; })[0];
        return d && Number(d.amount) > 0 ? Number(d.amount) : Number(t.amount) || 0;
    }

    function shared() { return templates.filter(function (t) { return !t.projectCode; }); }

    function ofProject(code) { return templates.filter(function (t) { return t.projectCode === code; }); }

    // The name is also the Report column title, so two templates a Report can show may not
    // share it: a template for every project clashes with any other, a project's own only with
    // the shared ones and that project's.
    function findByName(name, projectCode) {
        var key = String(name || '').trim().toLowerCase();
        return templates.filter(function (t) {
            if (t.name.trim().toLowerCase() !== key) return false;
            return !projectCode || !t.projectCode || t.projectCode === projectCode;
        })[0] || null;
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

    // { 'CODE|YYYY-MM-DD': [{ templateId, name, amount, note }] } for one project on these days,
    // in the order of the Report's columns (oldest template first).
    function dayIndex(projectCode, dates) {
        var inRange = {};
        var out = {};
        (dates || []).forEach(function (d) { inRange[d] = true; });
        assigned.forEach(function (a) {
            if (a.projectCode !== projectCode || !inRange[a.date]) return;
            var t = get(a.templateId) || { name: 'Template' };
            var key = a.employeeCode + '|' + a.date;
            (out[key] || (out[key] = [])).push({ templateId: a.templateId, name: t.name, amount: a.amount, note: a.note,
                                                 order: t.createdAt || '' });
        });
        Object.keys(out).forEach(function (key) {
            out[key].sort(function (a, b) { return a.order.localeCompare(b.order); });
        });
        return out;
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

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    // The templates a project's Report can give: the shared ones, then the project's own.
    function templateOptions(projectCode) {
        var option = function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(t.name) + ' · ' +
                (onDates(t) ? plural((t.dates || []).length, 'date', 'dates') : rupiah(t.amount) + ' a day') + '</option>';
        };
        var own = ofProject(projectCode);
        if (!own.length) return shared().map(option).join('');
        return '<optgroup label="Every project, a day">' + shared().map(option).join('') + '</optgroup>' +
            '<optgroup label="This project, on its dates">' + own.map(option).join('') + '</optgroup>';
    }

    function noTemplates(projectCode) {
        if (shared().length || ofProject(projectCode).length) return false;
        if (window.FeriizNotify) window.FeriizNotify.warning('Make a template on the Request Templates page first.', 'No template');
        return true;
    }

    // "25.000" while typing, the number when read.
    function digits(value) { return Number(String(value || '').replace(/\D/g, '')) || 0; }
    function typed(n) { return n ? Number(n).toLocaleString('id-ID') : ''; }

    /* ---------- Assign Request (Report: Batch Update > Assign Request) ----------
       context = {
         project: { code, name },
         cells: [{ code, name, date }]: the day cells ticked in the Report,
         workedOn: function (code, date) -> true when the person came in that day,
         onDone: function (count)
       }
       The Report's own filters and ticks already say who and which days, so the dialog only
       asks which template and how much, then Apply (Baldy, 04-11-2026: the toolbar dialog
       made the admin pick people and days a second time).
       - A per-day template: each ticked day the person came in gets the Amount, which starts
         at the template's and can be changed for this Assign only (Baldy, 09-11-2026: "soal
         nya belum pasti").
       - A project's own template: each ticked day that is one of its dates gets that date's
         amount, log or not (the Log Status filter decides who); other ticked days are left.
       - A day that already has the template is skipped.
       The line by the buttons says what Apply gives, and what it skips. */
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
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="assignTemplateTitle">Assign Request</h2>' +
                            '<p class="tpl-subtitle" id="assignTemplateContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<label class="form-label" for="assignTemplateSelect">Select Template</label>' +
                        '<select class="form-select" id="assignTemplateSelect"></select>' +
                        // A project's own template pays its dates' amounts, so it has no Amount here.
                        '<div id="assignAmountBlock">' +
                            '<label class="form-label mt-3" for="assignAmount">Amount</label>' +
                            '<div class="input-group">' +
                                '<span class="input-group-text">Rp</span>' +
                                '<input type="text" inputmode="numeric" class="form-control" id="assignAmount" placeholder="0" autocomplete="off" aria-describedby="assignTemplateInfo">' +
                                '<span class="input-group-text">a day</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="form-text" id="assignTemplateInfo"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<span class="tpl-summary me-auto" id="assignSummary"></span>' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="assignSubmit">Apply</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#assignTemplateSelect').addEventListener('change', takeTemplateAmount);
        el.querySelector('#assignAmount').addEventListener('input', function (e) {
            e.target.value = typed(digits(e.target.value));
            refreshSummary();
        });
        el.querySelector('#assignSubmit').addEventListener('click', submit);
        return el;
    }

    function currentTemplate() { return get(modal.querySelector('#assignTemplateSelect').value); }

    function currentAmount() { return digits(modal.querySelector('#assignAmount').value); }

    function cameIn(code, date) { return !ctx.workedOn || ctx.workedOn(code, date); }

    // { 'CODE|YYYY-MM-DD': true } for every day someone already has this template in the project.
    function givenIndex(t) {
        var index = {};
        assigned.forEach(function (a) {
            if (a.templateId === t.id && a.projectCode === ctx.project.code) index[a.employeeCode + '|' + a.date] = true;
        });
        return index;
    }

    // What Apply gives: one row per ticked day that gets the template, and what it skips.
    function planned() {
        var t = currentTemplate();
        var out = { rows: [], total: 0, people: {}, noLog: 0, already: 0, notDate: 0 };
        if (!t) return out;
        var dated = onDates(t);
        var amount = currentAmount();
        if (!dated && !amount) return out;
        var given = givenIndex(t);
        var dates = {};
        (t.dates || []).forEach(function (d) { dates[d.date] = true; });
        ctx.cells.forEach(function (c) {
            if (dated && !dates[c.date]) { out.notDate++; return; }
            if (given[c.code + '|' + c.date]) { out.already++; return; }
            if (!dated && !cameIn(c.code, c.date)) { out.noLog++; return; }
            var pay = dated ? amountOn(t, c.date) : amount;
            out.rows.push({ code: c.code, name: c.name, date: c.date, amount: pay });
            out.total += pay;
            out.people[c.code] = true;
        });
        return out;
    }

    // A per-day template brings its own Amount, which the admin can change for this Assign;
    // a project's own template pays its dates' amounts.
    function takeTemplateAmount() {
        var t = currentTemplate();
        if (!t) return;
        modal.querySelector('#assignAmountBlock').hidden = onDates(t);
        if (!onDates(t)) modal.querySelector('#assignAmount').value = typed(t.amount);
        refreshSummary();
    }

    // "17 Aug 2026 (HUT RI) · Rp 100.000, …" for a project's template: its dates among the
    // ticked days, or all of them when none is ticked.
    function datesLine(t) {
        var ticked = {};
        ctx.cells.forEach(function (c) { ticked[c.date] = true; });
        var all = t.dates || [];
        var hit = all.filter(function (d) { return ticked[d.date]; });
        var shown = hit.length ? hit : all;
        var line = shown.slice(0, 4).map(function (d) {
            return fmtDate(d.date) + (d.name ? ' (' + d.name + ')' : '') + ' · ' + rupiah(amountOn(t, d.date));
        }).join(', ') + (shown.length > 4 ? ' and ' + plural(shown.length - 4, 'more date', 'more dates') : '');
        return (hit.length ? 'Given on its dates, with or without a log: ' : 'None of the ticked days is one of its dates: ') + line + '.';
    }

    function refreshSummary() {
        var t = currentTemplate();
        if (!t) return;
        var dated = onDates(t);
        var amount = currentAmount();
        var info = dated ? datesLine(t)
            : 'Only on the ticked days each person came in.' +
              (amount !== Number(t.amount) ? ' The template says ' + rupiah(t.amount) + '; this Assign uses yours.' : '');
        modal.querySelector('#assignTemplateInfo').textContent = info + (t.note ? ' ' + t.note : '');
        var p = planned();
        var people = Object.keys(p.people).length;
        var skips = [];
        // Other ticked days are only worth a word when nothing is given.
        if (p.notDate && !p.rows.length) skips.push(plural(p.notDate, 'ticked day is', 'ticked days are') + ' not its dates');
        if (p.noLog) skips.push(plural(p.noLog, 'day has', 'days have') + ' no log');
        if (p.already) skips.push(plural(p.already, 'day has', 'days have') + ' it already');
        modal.querySelector('#assignSummary').textContent = (!dated && !amount ? 'Enter an amount'
            : p.rows.length ? plural(p.rows.length, 'day', 'days') + ' · ' + plural(people, 'person', 'people') + ' · ' + rupiah(p.total) : 'Nothing to give') +
            ((dated || amount) && skips.length ? ' (' + skips.join(', ') + ')' : '');
        modal.querySelector('#assignSubmit').disabled = !p.rows.length;
    }

    function submit() {
        var t = currentTemplate();
        var p = planned();
        if (!p.rows.length) return;
        var at = new Date().toISOString();
        var batch = 'B-' + Date.now().toString(36).toUpperCase();   // one Assign, removable as one row
        p.rows.forEach(function (r, i) {
            assigned.push({ id: 'ASG-' + Date.now().toString(36).toUpperCase() + i, batch: batch, templateId: t.id, projectCode: ctx.project.code,
                            employeeCode: r.code, employeeName: r.name, date: r.date, amount: r.amount, note: '', at: at, by: 'Admin' });
        });
        store(KEY_ASSIGNED, assigned);
        window.bootstrap.Modal.getInstance(modal).hide();
        var people = Object.keys(p.people).length;
        if (window.FeriizNotify) {
            var days = {};
            p.rows.forEach(function (r) { days[r.date] = true; });
            window.FeriizNotify.success((onDates(t)
                ? rupiah(p.total) + ' given to ' + plural(people, 'person', 'people') + ' on ' + plural(Object.keys(days).length, 'date', 'dates')
                : rupiah(p.rows[0].amount) + ' a day for ' + plural(people, 'person', 'people') + ', ' + rupiah(p.total) + ' in all') +
                '. It shows in the ' + t.name + ' column under Client.', t.name + ' assigned');
        }
        if (ctx.onDone) ctx.onDone(p.rows.length);
    }

    function openAssign(context) {
        ctx = context;
        if (noTemplates(ctx.project.code)) return;
        if (!modal) modal = buildModal();
        modal.querySelector('#assignTemplateContext').textContent = ctx.project.name + ' · ' + ctx.cells.length + ' selected';
        modal.querySelector('#assignTemplateSelect').innerHTML = templateOptions(ctx.project.code);
        takeTemplateAmount();
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    /* ---------- Delete Request (Report: Batch Update > Delete Request) ----------
       context = { project: { code, name }, cells: [{ code, name, date }], onDone: function () }
       Takes one request off the ticked days (Baldy, 04-11-2026: it can only be deleted in
       Batch Update, like assigning, never from the chips in the table). The list offers only
       the requests those days have; the line by the buttons says what goes. */
    var removeModal = null;
    var removeCtx = null;

    function buildRemoveModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'removeTemplateModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'removeTemplateTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="removeTemplateTitle">Delete Request</h2>' +
                            '<p class="tpl-subtitle" id="removeTemplateContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<label class="form-label" for="removeTemplateSelect">Select Template</label>' +
                        '<select class="form-select" id="removeTemplateSelect"></select>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<span class="tpl-summary me-auto" id="removeSummary"></span>' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-danger" id="removeSubmit">Delete</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#removeTemplateSelect').addEventListener('change', refreshRemove);
        el.querySelector('#removeSubmit').addEventListener('click', submitRemove);
        return el;
    }

    // { 'CODE|YYYY-MM-DD': true } for the ticked days.
    function tickedIndex() {
        var index = {};
        removeCtx.cells.forEach(function (c) { index[c.code + '|' + c.date] = true; });
        return index;
    }

    // What Delete takes: the template's assignments on the ticked days, with people and total.
    function removable() {
        var id = removeModal.querySelector('#removeTemplateSelect').value;
        var ticked = tickedIndex();
        var out = { ids: [], people: {}, total: 0 };
        assigned.forEach(function (a) {
            if (a.templateId !== id || a.projectCode !== removeCtx.project.code || !ticked[a.employeeCode + '|' + a.date]) return;
            out.ids.push(a.id);
            out.people[a.employeeCode] = true;
            out.total += a.amount;
        });
        return out;
    }

    function refreshRemove() {
        var r = removable();
        var people = Object.keys(r.people).length;
        removeModal.querySelector('#removeSummary').textContent = r.ids.length
            ? plural(r.ids.length, 'day', 'days') + ' · ' + plural(people, 'person', 'people') + ' · ' + rupiah(r.total) : 'None of the ticked days has it';
        removeModal.querySelector('#removeSubmit').disabled = !r.ids.length;
    }

    function submitRemove() {
        var t = get(removeModal.querySelector('#removeTemplateSelect').value) || { name: 'Request' };
        var r = removable();
        if (!r.ids.length) return;
        removeAssignments(r.ids);
        window.bootstrap.Modal.getInstance(removeModal).hide();
        if (window.FeriizNotify) {
            window.FeriizNotify.success('Taken off ' + plural(r.ids.length, 'day', 'days') + ' of ' + plural(Object.keys(r.people).length, 'person', 'people') + ': ' + rupiah(r.total) + '.', t.name + ' deleted');
        }
        if (removeCtx.onDone) removeCtx.onDone();
    }

    function openRemove(context) {
        removeCtx = context;
        var ticked = tickedIndex();
        var has = {};
        assigned.forEach(function (a) {
            if (a.projectCode === context.project.code && ticked[a.employeeCode + '|' + a.date]) has[a.templateId] = true;
        });
        var list = templates.filter(function (t) { return has[t.id]; });
        if (!list.length) {
            if (window.FeriizNotify) window.FeriizNotify.warning('None of the ticked days has a request.', 'Nothing to delete');
            return;
        }
        if (!removeModal) removeModal = buildRemoveModal();
        removeModal.querySelector('#removeTemplateContext').textContent = context.project.name + ' · ' + context.cells.length + ' selected';
        removeModal.querySelector('#removeTemplateSelect').innerHTML = list.map(function (t) {
            return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>';
        }).join('');
        refreshRemove();
        window.bootstrap.Modal.getOrCreateInstance(removeModal).show();
    }

    window.FeriizTemplates = {
        rupiah: rupiah,
        fmtDate: fmtDate,
        // The templates for every project (the Request Templates page); a project's own are ofProject.
        all: shared,
        ofProject: ofProject,
        get: get,
        onDates: onDates,
        amountOn: amountOn,
        findByName: findByName,
        reservedName: reservedName,
        save: save,
        additionalFor: additionalFor,
        usedIn: usedIn,
        dayIndex: dayIndex,
        openAssign: openAssign,
        openRemove: openRemove
    };
})();
