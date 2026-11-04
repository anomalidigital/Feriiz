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
     a year for all of them (1:31-1:33, 1:41). Each date can have its own amount,
     since a red date's incentive usually differs (Baldy, 03-11-2026; Arcon: "amount
     ditentukan per setiap tgl merah"); a date without one uses the template's Amount.
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

   FeriizTemplates.all(), get(id), amountOn(template, date), findByName(name), save(template)
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
              { date: '2026-08-17', name: 'HUT RI', amount: 100000 }
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

    function get(id) { return templates.filter(function (t) { return t.id === id; })[0] || null; }

    // The amount on one date: a One-time date's own amount, else the template's Amount.
    function amountOn(t, date) {
        var own = t && t.unit === 'once' ? (t.dates || []).filter(function (d) { return d.date === date; })[0] : null;
        return own && Number(own.amount) > 0 ? Number(own.amount) : Number(t && t.amount) || 0;
    }

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

    /* ---------- Assign Request (Report: Batch Update > Assign Request) ----------
       context = {
         project: { code, name },
         cells: [{ code, name, date }]: the day cells ticked in the Report,
         workedOn: function (code, date) -> true when the person came in that day,
         onDone: function (count)
       }
       The Report's own filters and ticks already say who and which days, so the dialog only
       asks which template, then Apply (Baldy, 04-11-2026: the toolbar dialog made the admin
       pick people and days a second time).
       - A Daily template goes only on the ticked days the person came in.
       - A One-time template goes on every ticked day, at that date's own amount.
       - A day that already has it is skipped.
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
        el.querySelector('#assignTemplateSelect').addEventListener('change', refreshSummary);
        el.querySelector('#assignSubmit').addEventListener('click', submit);
        return el;
    }

    function currentTemplate() { return get(modal.querySelector('#assignTemplateSelect').value); }

    function cameIn(code, date) { return !ctx.workedOn || ctx.workedOn(code, date); }

    // { 'CODE|YYYY-MM-DD': true } for every day someone already has this template in the project.
    function givenIndex(templateId) {
        var index = {};
        assigned.forEach(function (a) {
            if (a.templateId === templateId && a.projectCode === ctx.project.code) index[a.employeeCode + '|' + a.date] = true;
        });
        return index;
    }

    // What Apply gives: one row per ticked day that gets the template, and what it skips.
    function planned() {
        var t = currentTemplate();
        var out = { rows: [], total: 0, people: {}, noLog: 0, already: 0 };
        if (!t) return out;
        var given = givenIndex(t.id);
        ctx.cells.forEach(function (c) {
            if (given[c.code + '|' + c.date]) { out.already++; return; }
            if (t.unit !== 'once' && !cameIn(c.code, c.date)) { out.noLog++; return; }
            var amount = amountOn(t, c.date);
            if (!amount) return;
            out.rows.push({ code: c.code, name: c.name, date: c.date, amount: amount });
            out.total += amount;
            out.people[c.code] = true;
        });
        return out;
    }

    function refreshSummary() {
        var t = currentTemplate();
        if (!t) return;
        modal.querySelector('#assignTemplateInfo').textContent = (t.unit === 'once' ? UNITS.once + ', on every ticked day'
            : UNITS.day + ', only on the ticked days each person came in') + (t.note ? ' · ' + t.note : '');
        var p = planned();
        var people = Object.keys(p.people).length;
        var skips = [];
        if (p.noLog) skips.push(plural(p.noLog, 'day has', 'days have') + ' no log');
        if (p.already) skips.push(plural(p.already, 'day has', 'days have') + ' it already');
        modal.querySelector('#assignSummary').textContent = (p.rows.length
            ? plural(p.rows.length, 'day', 'days') + ' · ' + plural(people, 'person', 'people') + ' · ' + rupiah(p.total) : 'Nothing to give') +
            (skips.length ? ' (' + skips.join(', ') + ')' : '');
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
            window.FeriizNotify.success(rupiah(p.total) + ' given to ' + plural(people, 'person', 'people') +
                '. It shows in the ' + t.name + ' column under Client.', t.name + ' assigned');
        }
        if (ctx.onDone) ctx.onDone(p.rows.length);
    }

    function openAssign(context) {
        ctx = context;
        if (noTemplates()) return;
        if (!modal) modal = buildModal();
        modal.querySelector('#assignTemplateContext').textContent = ctx.project.name + ' · ' + ctx.cells.length + ' selected';
        modal.querySelector('#assignTemplateSelect').innerHTML = templateOptions();
        refreshSummary();
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
        UNITS: UNITS,
        rupiah: rupiah,
        fmtDate: fmtDate,
        all: function () { return templates.slice(); },
        get: get,
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
