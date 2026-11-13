/* =============================================
   FERIIZ — Print Configuration (report_print.html, 06-11-2026)
   The Report's Print opens this tab with the sheet it would print (print-report.js,
   FeriizPrintSheet), and one panel beside it decides what prints. It was "Print preview" until
   13-11-2026 (Baldy: "print konfigurasi kali ya namanya jangan print preview"): the paper here
   shows the sheet, not each printed page. The print dialog's paper and Layout decide the pages,
   and the sheet fits itself to them (print-report.js: a wide fit and a narrow fit), so the
   Landscape | Portrait of this page is gone ("ga perlu deh, kita kayanya jangan samain banget
   dengan yang di print").
   - Dates: each date whole, or only its Period (daily) or Overtime (hour) ("bisa hapus daily
     nya… atau overtime nya aja"). A date left out has no column; a field off prints empty under
     its header (meeting 05-11, 1:38: the Sunday header stays). Neither counts in the totals and
     the pay.
   - Occupation: each occupation on or off, A to Z, as the sheet groups them; no person alone
     (Baldy, 13-11-2026: "ini hide nya by occupation deh jangan segala ada hide employee").
   The paper here is one table, the rows going right as in the Report and filling the width
   ("di kanan kosong kok isi aja… kita gausah samain dengan ukuran hasil"); on paper the sheet
   fits itself to the print dialog's paper and Layout and may split a long period.
   The columns are the Report's own, from its Columns menu; this panel's Columns is gone (Baldy,
   13-11-2026: "colums ini gausah ada gausah ga perlu, ini cuma ada di report project aja").
   For: Internal | Client (meeting 05-11-2026, 0:34:01): Client only changes the data, every day
   with data at the Set Default of the person's occupation (Daily 1 when its hours make a full
   working day, else 0.5), without changing the Report; its columns are the Report's too, the
   Employee ones included (Baldy, 13-11-2026: "fungsi client cuma buat ubah data nya menjadi
   sesuai set default nya, untuk coloms nya itu jangan di ubah"; it left them out before). A date
   or a field off on every date of a weekday (Sundays, say) is kept for the project's next print
   of that kind.
   ============================================= */
(function () {
    'use strict';

    var PREFS_KEY = 'feriiz_print_prefs_v1';
    var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var FIELDS = [['p', 'Period (daily)'], ['o', 'Overtime (hour)']];
    var job = null;
    var state = null;
    var pageTitle = document.title;

    function $(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function count(map) { return Object.keys(map).filter(function (k) { return map[k]; }).length; }

    /* ---------- what is kept for the project's next print ---------- */
    function readPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    // { internal: { days }, client: { days } } for the project (06-11 kept one set: Internal). The
    // columns and the layout kept until 13-11-2026 are not read any more.
    function projectPrefs() {
        var p = readPrefs()[job.project.code] || {};
        return p.internal || p.client ? p : { internal: p };
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
        mine[state.mode] = { days: days };
        delete mine.layout;
        all[job.project.code] = mine;
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(all)); } catch (e) { /* kept for this tab only */ }
    }

    // What a mode starts with: the weekdays kept for it (left out whole, or a field off), else
    // every date on.
    function modeCut(mode) {
        var p = projectPrefs()[mode];
        var cut = {};
        if (!p) return cut;
        var days = p.days || {};
        if (Array.isArray(days)) {   // weekdays blanked whole, 06-11 to 11-11-2026
            var both = {};
            days.forEach(function (d) { both[d] = { p: true, o: true }; });
            days = both;
        }
        job.dates.forEach(function (d) {
            var rule = days[d.dow];
            if (!rule) return;
            FIELDS.concat([['d']]).forEach(function (f) { if (rule[f[0]]) cut[f[0] + ':' + d.date] = true; });
        });
        return cut;
    }

    // mode: 'internal' or 'client'; cut: a date or one of its fields off; rows: the people of the
    // occupations left out. Internal prints the Report's newest data: its Data: Latest | System
    // went on 13-11-2026 ("ga di minta deh kayanya apus dulu").
    function freshState(mode, withPrefs) {
        return { mode: mode, cut: withPrefs ? modeCut(mode) : {}, rows: {} };
    }

    // screen: the sheet draws its one table for this page (print-report.js screenTable); for
    // paper (screen false) the tables fitted to a wide and a narrow page.
    function view(forPaper) {
        return { hidden: {}, cut: state.cut, rowsOff: state.rows, client: state.mode === 'client', screen: !forPaper };
    }

    /* ---------- the panel ---------- */
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

    function groupOn(g) { return !g.rows.some(function (row) { return state.rows[row.code]; }); }

    // The occupations, each with how many people it has; on or off as a whole (Baldy, 13-11-2026:
    // "ini hide nya by occupation deh jangan segala ada hide employee"; "ini occupation bukan
    // people, all people nya di apus").
    function peopleSection() {
        var groups = window.FeriizPrintSheet.groups(job.rows);
        return '<section class="pp-section" aria-labelledby="ppPeopleTitle">' +
            '<h2 class="pp-section-title" id="ppPeopleTitle">Occupation</h2>' +
            '<ul class="pp-list">' +
            groups.map(function (g) {
                return '<li><label class="pp-opt">' + box('group', ' data-key="' + esc(g.name) + '"', groupOn(g) ? 'all' : 'none') +
                    '<span>' + esc(g.name) + '</span><span class="pp-count">' + g.rows.length + '</span></label></li>';
            }).join('') +
            '</ul></section>';
    }

    function renderPanel() {
        var panel = $('ppPanel');
        var scroll = panel.scrollTop;
        panel.innerHTML = datesSection() + peopleSection();
        panel.querySelectorAll('input[data-state]').forEach(function (input) {
            input.checked = input.dataset.state === 'all';
        });
        panel.scrollTop = scroll;
    }

    /* ---------- changes from the panel ---------- */
    function setCut(key, on) { if (on) delete state.cut[key]; else state.cut[key] = true; }
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
        } else if (kind === 'group') {
            var group = window.FeriizPrintSheet.groups(job.rows).filter(function (g) { return g.name === key; })[0];
            if (group) {
                var on = !groupOn(group);
                group.rows.forEach(function (row) { setPerson(row.code, on); });
            }
        }
        render();
        // The same box keeps the keyboard focus after drawing again.
        var selector = 'input[data-pp="' + kind + '"]' + (key ? '[data-key="' + key.replace(/"/g, '\\"') + '"]' : '') + (field ? '[data-field="' + field + '"]' : '');
        var again = $('ppPanel').querySelector(selector);
        if (again) again.focus();
    }

    /* ---------- the page ---------- */
    function nothingLeft() { return count(state.rows) >= job.rows.length; }

    function summary() {
        if (nothingLeft()) return 'Every occupation is left out, so there is nothing to print. Tick one under Occupation, or Reset.';
        var mode = state.mode === 'client'
            ? 'For the client: every day with data prints the Set Default of its occupation, Daily 1 when its hours make a full working day, else 0.5. '
            : 'Internal: the Report\'s own data, the newest version of each day. ';
        var parts = [];
        var gone = job.dates.filter(function (d) { return !dayOn(d.date); }).length;
        if (gone) parts.push(gone + (gone === 1 ? ' date' : ' dates') + ' left out');
        FIELDS.forEach(function (f) {
            var off = job.dates.filter(function (d) { return dayOn(d.date) && !fieldOn(f[0], d.date); }).length;
            if (off) parts.push(f[1] + ' off on ' + off + (off === 1 ? ' date' : ' dates'));
        });
        var occs = window.FeriizPrintSheet.groups(job.rows).filter(function (g) { return !groupOn(g); }).length;
        if (occs) parts.push(occs + (occs === 1 ? ' occupation' : ' occupations') + ' left out');
        if (!parts.length) return mode + 'The columns are the Report\'s. Untick a date, its Period or Overtime, or an occupation to leave it out. On paper the sheet fits the paper and Layout picked in the print dialog; a long period prints in several tables.';
        return mode + parts.join(' · ') + '. The totals and the pay count only what prints.';
    }

    function renderMode() {
        $('ppMode').querySelectorAll('button[data-mode]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
        });
    }

    function render() {
        $('ppSheet').innerHTML = window.FeriizPrintSheet.render(job, view());
        window.FeriizPrintSheet.pageBoxes(job, view(), 'feriiz-preview');
        renderPanel();
        savePrefs();
        renderMode();
        $('ppSummary').textContent = summary();
        $('ppSummary').classList.toggle('is-warning', nothingLeft());
    }

    // Another mode keeps the people left out, and takes its own dates.
    function onModeClick(e) {
        var btn = e.target.closest('button[data-mode]');
        if (!btn || btn.dataset.mode === state.mode) return;
        state.mode = btn.dataset.mode;
        state.cut = modeCut(state.mode);
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
        ['ppMode', 'ppReset', 'ppPrint'].forEach(function (id) { $(id).hidden = true; });
        $('ppSummary').textContent = '';
    }

    function init() {
        $('ppClose').addEventListener('click', closeTab);
        var id = new URL(location.href).searchParams.get('job');
        job = id && window.FeriizPrintSheet ? window.FeriizPrintSheet.load(id) : null;
        if (!job) {
            fail('This print configuration is no longer available. Go back to the Report and press Print again.');
            return;
        }
        if (!job.rows.length) {
            fail('There is nobody to print. Go back to the Report and change its filters.');
            return;
        }
        pageTitle = 'Feriiz - Print Configuration - ' + (job.project.name || 'Report');
        document.title = pageTitle;
        $('ppContext').textContent = (job.employeePage ? job.subtitle.split(' • ')[0] + ' · ' : '') + job.title + ' · ' + job.period;
        $('ppSummary').tabIndex = -1;
        state = freshState('internal', true);
        render();
        $('ppState').hidden = true;
        $('ppPanel').hidden = false;
        $('ppPaper').hidden = false;

        $('ppPanel').addEventListener('change', onPanelChange);
        $('ppMode').addEventListener('click', onModeClick);
        $('ppReset').addEventListener('click', function () {
            state = freshState(state.mode, false);
            render();
        });
        $('ppPrint').addEventListener('click', printSheet);
        // On print: the sheet fitted to the paper (its tables measured now, with Poppins in), the
        // file named after the sheet as the Report's print did, the top of each page saying when it
        // printed. After it, the page's own table again.
        window.addEventListener('beforeprint', function () {
            $('ppSheet').innerHTML = window.FeriizPrintSheet.render(job, view(true));
            document.title = window.FeriizPrintSheet.identifier(job, view(true));
            window.FeriizPrintSheet.pageBoxes(job, view(true), 'feriiz-preview');
        });
        window.addEventListener('afterprint', function () {
            document.title = pageTitle;
            $('ppSheet').innerHTML = window.FeriizPrintSheet.render(job, view());
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
