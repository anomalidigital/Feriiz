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
     Batch Update > Assign Request gives a template to exactly the selected
     days. A day shows what it was given as small chips with the template's
     initials ("UM"), in the row of hour badges so the day keeps its height.
     A full line per request (v3.7.19) was too big; the chips are what the team
     asked for later (Baldy 29-10-2026: "keliatan di daily, jangan terlalu besar").

   Prototype only: everything is kept in this browser (localStorage) so the
   Templates page and the Report see the same data. The API replaces this.

   FeriizTemplates.all(), get(id), amountOn(template, date), findByName(name), save(template)
   FeriizTemplates.additionalFor(employeeCode, projectCode, dates)
   FeriizTemplates.usedIn(projectCode, employeeCodes, dates)
   FeriizTemplates.dayIndex(projectCode, dates)   what each person got on each day: the Report's day chips
   FeriizTemplates.openAssign(context)   Assign Request in the Report (Batch Update: the ticked days)
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

    // The chip text in a Report day: "Uang Makan" -> "UM", "Insentif Tanggal Merah 2026" -> "ITM",
    // one word -> its first three letters. The full name and amount are in the chip's tooltip.
    function shortName(name) {
        var words = String(name || '').trim().split(/\s+/).filter(function (w) { return /^[a-z]/i.test(w); });
        if (words.length === 1) return words[0].charAt(0).toUpperCase() + words[0].slice(1, 3).toLowerCase();
        return words.map(function (w) { return w.charAt(0).toUpperCase(); }).join('').slice(0, 3) || '?';
    }

    // { 'CODE|YYYY-MM-DD': [{ templateId, name, short, amount, note }] } for one project on these days,
    // in the order of the Report's columns (oldest template first).
    function dayIndex(projectCode, dates) {
        var inRange = {};
        var out = {};
        (dates || []).forEach(function (d) { inRange[d] = true; });
        assigned.forEach(function (a) {
            if (a.projectCode !== projectCode || !inRange[a.date]) return;
            var t = get(a.templateId) || { name: 'Template' };
            var key = a.employeeCode + '|' + a.date;
            (out[key] || (out[key] = [])).push({ templateId: a.templateId, name: t.name, short: shortName(t.name), amount: a.amount, note: a.note,
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

    // The Occupation picker (app.js) of a popup: no tick means everyone.
    function inOccupations(picker, occupation) {
        var chosen = picker.values();
        return !chosen.length || chosen.indexOf(String(occupation || '').trim().toLowerCase()) >= 0;
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
            ? plural(people, 'person', 'people') + ' · ' + rupiah(p.total) : 'Nothing to give') +
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

    // The tick in a list head ticks or unticks everyone shown (after Occupation and search).
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

    /* ---------- Who has a request (Report: click a request chip in a day) ----------
       context = {
         project: { code, name }, templateId, dates: [visible ISO dates],
         people: [{ code, name, occupation }],
         focusCode: the person whose chip was clicked (ticked and listed first), or '' for nobody,
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
    var detailOccupation = null;

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
        var focus = listCtx.focusCode;
        return out.sort(function (a, b) {
            if (a.code === focus) return -1;
            if (b.code === focus) return 1;
            return a.name.localeCompare(b.name);
        });
    }

    // Name and amount only: the days are already in the Report's cells (Baldy, 04-11-2026: no
    // Days column). Who gave it, and its note, are in the tooltip.
    function holderRowHTML(h, ticked) {
        var given = 'Given ' + fmtDate(h.at) + (h.by ? ' by ' + h.by : '') + (h.notes.length ? '. Note: ' + h.notes.join('; ') : '');
        return '<label class="tpl-person" data-code="' + esc(h.code) + '" data-occupation="' + esc(h.occupation) + '"' +
            ' data-search="' + esc((h.name + ' ' + h.code).toLowerCase()) + '" title="' + esc(given) + '">' +
            '<input type="checkbox" class="form-check-input" value="' + esc(h.code) + '"' + (ticked ? ' checked' : '') + '>' +
            '<span class="tpl-person-name">' + esc(h.name) + '<small>' + esc(h.code) + (h.occupation ? ' · ' + esc(h.occupation) : '') + '</small></span>' +
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
                                '<div id="detailOccupation"></div>' +
                                '<input type="search" class="form-control form-control-sm" id="detailSearch" placeholder="Search name or code" aria-label="Search people">' +
                            '</div>' +
                        '</div>' +
                        '<div class="tpl-people tpl-people--tall" id="detailPeople" role="group" aria-label="People">' +
                            '<label class="tpl-list-head">' +
                                '<input type="checkbox" class="form-check-input" id="detailAll" aria-label="Tick everyone shown">' +
                                '<span id="detailCount">Select all</span>' +
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
        detailOccupation = window.FeriizOccupationPicker.create({ size: 'sm', single: true, onChange: function () {
            setListConfirm(false);
            applyListFilter();
            refreshList();
        } });
        el.querySelector('#detailOccupation').replaceWith(detailOccupation.el);
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
    function inListScope(occupation) { return inOccupations(detailOccupation, occupation); }

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
            s.total += h.total;
            return s;
        }, { people: people.length, total: 0 });
    }

    function sumText(s) {
        return plural(s.people, 'person', 'people') + ' · ' + rupiah(s.total);
    }

    // The count in the list head, the footer summary and the Remove button follow the ticks.
    function refreshList() {
        var occ = detailOccupation.names();
        var scoped = listPeople.filter(function (h) { return inListScope(h.occupation); });
        var ticked = tickedPeople();
        listModal.querySelector('#detailCount').textContent = ticked.length + ' of ' + scoped.length + ' ticked';
        syncTickAll(listModal, '#detailAll');
        listModal.querySelector('#detailSummary').textContent = !listPeople.length ? ''
            : ticked.length ? 'Ticked: ' + sumText(sumUp(ticked))
            : (occ[0] || 'Total') + ': ' + sumText(sumUp(scoped));
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
        summary.textContent = 'Remove ' + t.name + ' from ' + plural(s.people, 'person', 'people') + '? ' + rupiah(s.total);
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
            window.FeriizNotify.success('Taken off ' + plural(s.people, 'person', 'people') + ': ' + rupiah(s.total) + '.', t.name + ' removed');
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
        detailOccupation.setPeople(listPeople);
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
        detailOccupation.reset();
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
        amountOn: amountOn,
        findByName: findByName,
        reservedName: reservedName,
        save: save,
        additionalFor: additionalFor,
        usedIn: usedIn,
        dayIndex: dayIndex,
        openAssign: openAssign,
        openDetail: openDetail
    };
})();
