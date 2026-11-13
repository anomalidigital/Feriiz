/* =============================================
   FERIIZ — Print preview (report_print.html, 06-11-2026)
   The Report's Print opens this tab with the sheet it would print (print-report.js,
   FeriizPrintSheet). Since 12-11-2026 the paper shows exactly what prints, at A4 landscape, and
   one panel beside it decides what prints (Baldy: "print preview… harus sama dengan hasil print";
   "1 tools aja jangan ada dua, kamu ini buat ada 2 tombol dengan fungsi yang sama"; the eye and
   the eraser in the sheet and the "Blank days" buttons are gone):
   - Dates: each date's Period (daily) and Overtime (hour), on or off ("bisa hapus daily nya…
     atau overtime nya aja"), a whole date at once, or one field for every date at once. What
     is off prints empty under its header (meeting 05-11, 1:38: the Sunday header stays) and
     no longer counts in the totals and the pay.
   - Columns: the totals, the Employee and Client money columns, the payments.
   - People: by occupation, A to Z, as the sheet groups them.
   Every "All…" box is three-way, as in the occupation filters: a tick when all are on, a minus
   when some are, empty when none is; ticked or with its minus it turns them all off, empty it
   turns them all on.
   For: Internal | Client (meeting 05-11-2026, 0:34:01): Client prints every day with data at
   the Set Default of the person's occupation, without changing the Report, and starts without
   the workers' pay. The columns left out, and a field off on every date of a weekday (Sundays,
   say), are kept for the project's next print of that kind.
   ============================================= */
(function () {
    'use strict';

    var PREFS_KEY = 'feriiz_print_prefs_v1';
    var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var FIELDS = [['p', 'Period (daily)'], ['o', 'Overtime (hour)']];
    var job = null;
    var state = null;
    var columns = null;   // FeriizPrintSheet.columns(job)
    var pageTitle = document.title;

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function plain(label) { return String(label).replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

    function count(map) { return Object.keys(map).filter(function (k) { return map[k]; }).length; }

    /* ---------- what is kept for the project's next print ---------- */
    function readPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    // { internal: { cols, days }, client: { cols, days }, layout } for the project (06-11 kept one set:
    // Internal; layout 'landscape' or 'portrait' since 13-11-2026).
    function projectPrefs() {
        var p = readPrefs()[job.project.code] || {};
        return p.internal || p.client ? p : { internal: p };
    }

    // The money columns of a group, with its payment.
    function groupKeys(group) {
        return (columns[group] || []).concat(columns.pay.filter(function (c) { return c.group === group; }))
            .map(function (c) { return c.key; });
    }

    function weekdays() {
        var seen = {};
        job.dates.forEach(function (d) { if (d.dow >= 0) seen[d.dow] = true; });
        return Object.keys(seen).map(Number).sort();
    }

    function savePrefs() {
        var all = readPrefs();
        var mine = projectPrefs();
        var days = {};
        weekdays().forEach(function (dow) {
            var dates = job.dates.filter(function (d) { return d.dow === dow; });
            FIELDS.concat([['d']]).forEach(function (f) {
                if (dates.every(function (d) { return state.cut[f[0] + ':' + d.date]; })) (days[dow] = days[dow] || {})[f[0]] = true;
            });
        });
        mine[state.mode] = { cols: Object.keys(state.hidden).filter(function (k) { return state.hidden[k]; }), days: days };
        mine.layout = state.layout;
        all[job.project.code] = mine;
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(all)); } catch (e) { /* kept for this tab only */ }
    }

    // What a mode starts with: what was kept for it, else everything on, but the client print
    // leaves out the Employee group, the workers' pay.
    function modeState(mode) {
        var p = projectPrefs()[mode];
        var s = { hidden: {}, cut: {} };
        if (!p) {
            if (mode === 'client') groupKeys('emp').forEach(function (k) { s.hidden[k] = true; });
            return s;
        }
        (p.cols || []).forEach(function (k) {
            if (k === 'emp' || k === 'cli') groupKeys(k).forEach(function (key) { s.hidden[key] = true; });
            else if (k.indexOf('date:') !== 0) s.hidden[k] = true;
        });
        var days = p.days || {};
        if (Array.isArray(days)) {   // weekdays blanked whole, 06-11 to 11-11-2026
            var both = {};
            days.forEach(function (d) { both[d] = { p: true, o: true }; });
            days = both;
        }
        job.dates.forEach(function (d) {
            var rule = days[d.dow];
            if (!rule) return;
            FIELDS.concat([['d']]).forEach(function (f) { if (rule[f[0]]) s.cut[f[0] + ':' + d.date] = true; });
        });
        return s;
    }

    // mode: 'internal' or 'client'; data: 'latest' or 'system', the Internal print's data (the
    // newest version of each day, or what the machine recorded: meeting 10-11-2026, 00:03:33,
    // "internal ini bakal… yang update-an atau yang dari sistem"; Baldy, 13-11-2026: "original
    // ganti jadi system"); layout: 'landscape' or 'portrait' (13-11-2026); hidden: columns left
    // out; cut: a date's field off; rows: people left out; open: the people groups unfolded.
    function freshState(mode, withPrefs) {
        var s = withPrefs ? modeState(mode) : { hidden: {}, cut: {} };
        var layout = withPrefs && projectPrefs().layout === 'portrait' ? 'portrait' : 'landscape';
        return { mode: mode, data: 'latest', layout: layout, hidden: s.hidden, cut: s.cut, rows: {}, open: {} };
    }

    function systemData() { return state.mode === 'internal' && state.data === 'system'; }

    function view() {
        return { hidden: state.hidden, cut: state.cut, rowsOff: state.rows, client: state.mode === 'client',
                 system: systemData(), portrait: state.layout === 'portrait' };
    }

    /* ---------- the panel ---------- */
    // 'all', 'some' or 'none' of these are on.
    function tri(on, total) { return !on ? 'none' : on === total ? 'all' : 'some'; }

    function box(kind, attrs, st, label) {
        return '<input type="checkbox" class="form-check-input" data-pp="' + kind + '"' + attrs + ' data-state="' + st + '"' +
            (label ? ' aria-label="' + esc(label) + '"' : '') + '>';
    }

    function fieldOn(f, date) { return !state.cut[f + ':' + date]; }

    function dayOn(date) { return !state.cut['d:' + date]; }

    function dateLabel(d) {
        return (d.dow >= 0 ? DAY_SHORT[d.dow] + ' ' : '') + d.label;
    }

    /* Each date with its Period and Overtime; no "All dates" row (Baldy, 13-11-2026: "gausah ada all
       days"). The box before a date leaves the whole date out, its column too ("aku kira… ketika
       di un checklist itu bakal mengapus hari nya… coba deh mungkin yang di kiri itu hari nya yang
       ke hide sebaris"); Period and Overtime only empty their own cells, the column stays (the
       meeting of 10-11: a Sunday printed empty under its date). */
    function datesSection() {
        var rows = job.dates.map(function (d) {
            var on = dayOn(d.date);
            var p = fieldOn('p', d.date), o = fieldOn('o', d.date);
            var off = on ? '' : ' disabled';
            return '<tr' + (on ? '' : ' class="is-off"') + '>' +
                '<th scope="row"><label class="pp-opt">' + box('date', ' data-key="' + esc(d.date) + '"', on ? 'all' : 'none', d.label + ', the whole date') +
                    '<span>' + esc(dateLabel(d)) + '</span></label></th>' +
                '<td>' + box('cell', ' data-key="' + esc(d.date) + '" data-field="p"' + off, p ? 'all' : 'none', 'Period (daily), ' + d.label) + '</td>' +
                '<td>' + box('cell', ' data-key="' + esc(d.date) + '" data-field="o"' + off, o ? 'all' : 'none', 'Overtime (hour), ' + d.label) + '</td>' +
            '</tr>';
        }).join('');
        return '<section class="pp-section" aria-labelledby="ppDatesTitle">' +
            '<h2 class="pp-section-title" id="ppDatesTitle">Dates</h2>' +
            '<table class="pp-grid"><thead><tr><th scope="col">Date</th><th scope="col">Period<br>(daily)</th><th scope="col">Overtime<br>(hour)</th></tr></thead><tbody>' +
            rows + '</tbody></table></section>';
    }

    function colOn(c) { return !state.hidden[c.key]; }

    function colItem(c, sub) {
        return '<li' + (sub ? ' class="pp-sub"' : '') + '><label class="pp-opt">' + box('col', ' data-key="' + esc(c.key) + '"', colOn(c) ? 'all' : 'none') +
            '<span>' + esc(plain(c.label)) + '</span></label></li>';
    }

    function colGroup(group, title) {
        var cols = columns[group];
        if (!cols.length) return '';
        var on = cols.filter(colOn).length;
        return '<li><label class="pp-opt pp-strong">' + box('colgroup', ' data-key="' + group + '"', tri(on, cols.length)) + '<span>' + title + '</span></label></li>' +
            cols.map(function (c) { return colItem(c, true); }).join('');
    }

    function columnsSection() {
        return '<section class="pp-section" aria-labelledby="ppColsTitle">' +
            '<h2 class="pp-section-title" id="ppColsTitle">Columns</h2>' +
            '<ul class="pp-list">' +
                columns.totals.map(function (c) { return colItem(c, false); }).join('') +
                colGroup('emp', 'Employee (IDR)') +
                colGroup('cli', 'Client (IDR)') +
                columns.pay.map(function (c) { return colItem(c, false); }).join('') +
            '</ul></section>';
    }

    function personOn(row) { return !state.rows[row.code]; }

    // The occupations, each unfolding to its people; no "All people" row (Baldy, 13-11-2026: "ini
    // occupation bukan people, all people nya di apus").
    function peopleSection() {
        var groups = window.FeriizPrintSheet.groups(job.rows);
        return '<section class="pp-section" aria-labelledby="ppPeopleTitle">' +
            '<h2 class="pp-section-title" id="ppPeopleTitle">Occupation</h2>' +
            '<ul class="pp-list">' +
            groups.map(function (g) {
                var gOn = g.rows.filter(personOn).length;
                var open = Boolean(state.open[g.name]);
                return '<li class="pp-group">' +
                    '<div class="pp-group-head">' +
                        '<label class="pp-opt">' + box('group', ' data-key="' + esc(g.name) + '"', tri(gOn, g.rows.length)) + '<span>' + esc(g.name) + '</span>' +
                            '<span class="pp-count">' + gOn + ' / ' + g.rows.length + '</span></label>' +
                        '<button type="button" class="pp-expand" data-group="' + esc(g.name) + '" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' the people of ' + esc(g.name) + '">' +
                            '<i class="fa-solid fa-chevron-' + (open ? 'up' : 'down') + '" aria-hidden="true"></i></button>' +
                    '</div>' +
                    (open ? '<ul class="pp-list">' + g.rows.map(function (row) {
                        return '<li class="pp-sub"><label class="pp-opt">' + box('person', ' data-key="' + esc(row.code) + '"', personOn(row) ? 'all' : 'none') +
                            '<span>' + esc(row.name) + '</span></label></li>';
                    }).join('') + '</ul>' : '') +
                '</li>';
            }).join('') +
            '</ul></section>';
    }

    function renderPanel() {
        var panel = $('ppPanel');
        var scroll = panel.scrollTop;
        panel.innerHTML = datesSection() + columnsSection() + peopleSection();
        panel.querySelectorAll('input[data-state]').forEach(function (input) {
            input.checked = input.dataset.state === 'all';
            input.indeterminate = input.dataset.state === 'some';
        });
        panel.scrollTop = scroll;
    }

    /* ---------- changes from the panel ---------- */
    // Ticked or with its minus, an "All…" box turns all of them off; empty, it turns them all on.
    function setAll(keys, isOn, setter) {
        var anyOn = keys.some(isOn);
        keys.forEach(function (k) { setter(k, !anyOn); });
    }

    function setCut(key, on) { if (on) delete state.cut[key]; else state.cut[key] = true; }
    function setHidden(key, on) { if (on) delete state.hidden[key]; else state.hidden[key] = true; }
    function setPerson(code, on) { if (on) delete state.rows[code]; else state.rows[code] = true; }

    function onPanelChange(e) {
        var input = e.target.closest('input[data-pp]');
        if (!input) return;
        var key = input.dataset.key;
        var field = input.dataset.field;
        var kind = input.dataset.pp;
        if (kind === 'cell') {
            setCut(field + ':' + key, !fieldOn(field, key));
        } else if (kind === 'date') {
            setCut('d:' + key, !dayOn(key));
        } else if (kind === 'col') {
            setHidden(key, Boolean(state.hidden[key]));
        } else if (kind === 'colgroup') {
            setAll(columns[key].map(function (c) { return c.key; }), function (k) { return !state.hidden[k]; }, setHidden);
        } else if (kind === 'person') {
            setPerson(key, Boolean(state.rows[key]));
        } else if (kind === 'group') {
            var group = window.FeriizPrintSheet.groups(job.rows).filter(function (g) { return g.name === key; })[0];
            if (group) setAll(group.rows.map(function (r) { return r.code; }), function (c) { return !state.rows[c]; }, setPerson);
        }
        render();
        // The same box keeps the keyboard focus after drawing again.
        var selector = 'input[data-pp="' + kind + '"]' + (key ? '[data-key="' + key.replace(/"/g, '\\"') + '"]' : '') + (field ? '[data-field="' + field + '"]' : '');
        var again = $('ppPanel').querySelector(selector);
        if (again) again.focus();
    }

    function onPanelClick(e) {
        var btn = e.target.closest('button[data-group]');
        if (!btn) return;
        var name = btn.dataset.group;
        state.open[name] = !state.open[name];
        renderPanel();
        var again = $('ppPanel').querySelector('button[data-group="' + name.replace(/"/g, '\\"') + '"]');
        if (again) again.focus();
    }

    /* ---------- the page ---------- */
    function nothingLeft() { return count(state.rows) >= job.rows.length; }

    function summary() {
        if (nothingLeft()) return 'Everyone is left out, so there is nothing to print. Tick an occupation or a person under Occupation, or Reset.';
        var mode = state.mode === 'client'
            ? 'For the client: every day with data prints the Set Default of its occupation. '
            : systemData() ? 'Internal, system data: each day as the machine recorded it, before imports and Add Hours. '
            : 'Internal: the Report\'s own data, the newest version of each day. ';
        var parts = [];
        var gone = job.dates.filter(function (d) { return !dayOn(d.date); }).length;
        if (gone) parts.push(gone + (gone === 1 ? ' date' : ' dates') + ' left out');
        FIELDS.forEach(function (f) {
            var off = job.dates.filter(function (d) { return dayOn(d.date) && !fieldOn(f[0], d.date); }).length;
            if (off) parts.push(f[1] + ' off on ' + off + (off === 1 ? ' date' : ' dates'));
        });
        var cols = count(state.hidden);
        if (cols) parts.push(cols + (cols === 1 ? ' column' : ' columns') + ' left out');
        var people = count(state.rows);
        if (people) parts.push(people + (people === 1 ? ' person' : ' people') + ' left out');
        if (!parts.length) return mode + 'The paper shows A4 ' + state.layout + '; in the print dialog pick the same Layout (A3 or A2 there gets the same sheet, larger). Untick a date to leave it out, or only its Period or Overtime to leave them empty; a column or a person goes the same way.';
        return mode + parts.join(' · ') + '. The totals and the pay count only what prints.';
    }

    function renderMode() {
        $('ppMode').querySelectorAll('button[data-mode]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
        });
        // Data: Latest | System, for the Internal print of a period where a day was changed.
        $('ppData').hidden = !(state.mode === 'internal' && window.FeriizPrintSheet.hasSystemData(job));
        $('ppData').querySelectorAll('button[data-data]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.data === state.data));
        });
        $('ppLayout').querySelectorAll('button[data-layout]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.layout === state.layout));
        });
        // The paper on screen stands up for Portrait; what prints follows the print dialog's Layout.
        $('ppPaper').classList.toggle('is-portrait', state.layout === 'portrait');
    }

    function onLayoutClick(e) {
        var btn = e.target.closest('button[data-layout]');
        if (!btn || btn.dataset.layout === state.layout) return;
        state.layout = btn.dataset.layout;
        render();
        var again = $('ppLayout').querySelector('button[data-layout="' + state.layout + '"]');
        if (again) again.focus();
    }

    function onDataClick(e) {
        var btn = e.target.closest('button[data-data]');
        if (!btn || btn.dataset.data === state.data) return;
        state.data = btn.dataset.data;
        render();
        var again = $('ppData').querySelector('button[data-data="' + state.data + '"]');
        if (again) again.focus();
    }

    function render() {
        $('ppSheet').innerHTML = window.FeriizPrintSheet.render(job, view());
        renderPanel();
        savePrefs();
        renderMode();
        $('ppSummary').textContent = summary();
        $('ppSummary').classList.toggle('is-warning', nothingLeft());
    }

    // Another mode keeps the people left out, and takes its own columns and dates.
    function onModeClick(e) {
        var btn = e.target.closest('button[data-mode]');
        if (!btn || btn.dataset.mode === state.mode) return;
        var s = modeState(btn.dataset.mode);
        state.mode = btn.dataset.mode;
        state.hidden = s.hidden;
        state.cut = s.cut;
        render();
        var again = $('ppMode').querySelector('button[data-mode="' + state.mode + '"]');
        if (again) again.focus();
    }

    function printSheet() {
        if (nothingLeft()) {
            $('ppSummary').focus();
            return;
        }
        window.print();
    }

    // Back to the Report: the tab was opened by it, so it can close; opened on its own, it goes there.
    function closeTab() {
        window.close();
        setTimeout(function () {
            if (!window.closed) location.href = job ? job.pageUrl : 'projects.html';
        }, 200);
    }

    function fail(message) {
        $('ppState').textContent = message;
        ['ppMode', 'ppData', 'ppLayout', 'ppReset', 'ppPrint'].forEach(function (id) { $(id).hidden = true; });
        $('ppSummary').textContent = '';
    }

    function init() {
        $('ppClose').addEventListener('click', closeTab);
        var id = new URL(location.href).searchParams.get('job');
        job = id && window.FeriizPrintSheet ? window.FeriizPrintSheet.load(id) : null;
        if (!job) {
            fail('This print preview is no longer available. Go back to the Report and press Print again.');
            return;
        }
        if (!job.rows.length) {
            fail('There is nobody to print. Go back to the Report and change its filters.');
            return;
        }
        columns = window.FeriizPrintSheet.columns(job);
        pageTitle = 'Feriiz - Print preview - ' + (job.project.name || 'Report');
        document.title = pageTitle;
        $('ppContext').textContent = (job.employeePage ? job.subtitle.split(' • ')[0] + ' · ' : '') + job.title + ' · ' + job.period;
        $('ppSummary').tabIndex = -1;
        state = freshState('internal', true);
        render();
        $('ppState').hidden = true;
        $('ppPanel').hidden = false;
        $('ppPaper').hidden = false;

        $('ppPanel').addEventListener('change', onPanelChange);
        $('ppPanel').addEventListener('click', onPanelClick);
        $('ppMode').addEventListener('click', onModeClick);
        $('ppData').addEventListener('click', onDataClick);
        $('ppLayout').addEventListener('click', onLayoutClick);
        $('ppReset').addEventListener('click', function () {
            var open = state.open;
            var layout = state.layout;
            state = freshState(state.mode, false);
            state.open = open;
            state.layout = layout;
            render();
        });
        $('ppPrint').addEventListener('click', printSheet);
        // "Save as PDF" names the file after the sheet, as the Report's print did.
        window.addEventListener('beforeprint', function () { document.title = window.FeriizPrintSheet.identifier(job, view()); });
        window.addEventListener('afterprint', function () { document.title = pageTitle; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
