/* =============================================
   FERIIZ — Print Options (report_print.html, 06-11-2026)
   The Report's Print opens this tab with the sheet it would print (print-report.js,
   FeriizPrintSheet), and the dates above it decide what prints. It was "Print preview" until
   13-11-2026 (Baldy: "print konfigurasi kali ya namanya jangan print preview"), then "Print
   Configuration" until 16-11-2026 ("print opstions aja kali": configuration sounded like setting
   up the system, not choosing what this printout holds). The paper here
   shows the sheet, not each printed page. The print dialog's paper and Layout decide the pages,
   and the sheet fits itself to them (print-report.js: a wide fit and a narrow fit), so the
   Landscape | Portrait of this page is gone ("ga perlu deh, kita kayanya jangan samain banget
   dengan yang di print").
   - Dates, in a strip above the paper, going right as on the sheet (Baldy, 16-11-2026: "yang
     dates itu mungkin pindahin ke atas kali ya dan rapikan"; a panel beside the paper before):
     each date whole, or only its Period (daily) or Overtime (hour) ("bisa hapus daily nya… atau
     overtime nya aja"). A date left out has no column; a field off prints empty under its header
     (meeting 05-11, 1:38: the Sunday header stays). Neither counts in the totals and the pay.
   - Who prints is the Report's: its filters already pick the occupations, so the Occupation
     boxes here (13-11-2026) went on 16-11-2026 ("aku baru inget kalau itu ternyata udah bisa di
     tangani di pages report"); so did the sentence under the title that told what would print.
   The paper here is one table, the rows going right as in the Report and filling the width
   ("di kanan kosong kok isi aja… kita gausah samain dengan ukuran hasil"); on paper the sheet
   fits itself to the print dialog's paper and Layout and may split a long period.
   The columns are the Report's own, from its Columns menu; this page's Columns is gone (Baldy,
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

    // mode: 'internal' or 'client'; cut: a date or one of its fields off. Internal prints the
    // Report's newest data: its Data: Latest | System went on 13-11-2026 ("ga di minta deh kayanya
    // apus dulu").
    function freshState(mode, withPrefs) {
        return { mode: mode, cut: withPrefs ? modeCut(mode) : {} };
    }

    // screen: the sheet draws its one table for this page (print-report.js screenTable); for
    // paper (screen false) the tables fitted to a wide and a narrow page.
    function view(forPaper) {
        return { hidden: {}, cut: state.cut, client: state.mode === 'client', screen: !forPaper };
    }

    /* ---------- the dates above the paper ---------- */
    function box(kind, attrs, st, label) {
        return '<input type="checkbox" class="form-check-input" data-pp="' + kind + '"' + attrs + ' data-state="' + st + '"' +
            (label ? ' aria-label="' + esc(label) + '"' : '') + '>';
    }

    // A box filling its cell, so the whole cell takes the click.
    function cellBox(kind, attrs, st, label, disabled) {
        return '<label class="pp-hit' + (disabled ? ' is-disabled' : '') + '">' +
            box(kind, attrs + (disabled ? ' disabled' : ''), st, label) + '</label>';
    }

    function fieldOn(f, date) { return !state.cut[f + ':' + date]; }

    function dayOn(date) { return !state.cut['d:' + date]; }

    // "03 Nov" of "03 Nov 2026": the year is in the period under the title.
    function shortLabel(d) { return String(d.label).replace(/\s+\d{4}$/, ''); }

    /* The dates going right, as on the sheet, a column each with three boxes: the Date itself, its
       Period (daily), its Overtime (hour). No "All dates" box (Baldy, 13-11-2026: "gausah ada all
       days"). The Date box leaves the whole date out, its column too ("aku kira… ketika di un
       checklist itu bakal mengapus hari nya"); Period and Overtime only empty their own cells, the
       column stays (the meeting of 10-11: a Sunday printed empty under its date). */
    function datesTable() {
        var head = '', whole = '', fields = { p: '', o: '' };
        job.dates.forEach(function (d) {
            var on = dayOn(d.date);
            var cls = on ? '' : ' class="is-off"';
            var key = ' data-key="' + esc(d.date) + '"';
            head += '<th scope="col"' + cls + '>' + (d.dow >= 0 ? '<span class="pp-date-dow">' + DAY_SHORT[d.dow] + '</span>' : '') +
                '<span class="pp-date-day">' + esc(shortLabel(d)) + '</span></th>';
            whole += '<td' + cls + '>' + cellBox('date', key, on ? 'all' : 'none', d.label + ', the whole date') + '</td>';
            FIELDS.forEach(function (f) {
                fields[f[0]] += '<td' + cls + '>' + cellBox('cell', key + ' data-field="' + f[0] + '"',
                    fieldOn(f[0], d.date) ? 'all' : 'none', f[1] + ', ' + d.label, !on) + '</td>';
            });
        });
        return '<table class="pp-dates-grid">' +
            '<thead><tr><th scope="col" class="pp-dates-title">Dates</th>' + head + '</tr></thead>' +
            '<tbody><tr><th scope="row">Date</th>' + whole + '</tr>' +
            FIELDS.map(function (f) { return '<tr><th scope="row">' + f[1] + '</th>' + fields[f[0]] + '</tr>'; }).join('') +
            '</tbody></table>';
    }

    // Drawn again on each change; a long period stays where it was scrolled to.
    function renderDates() {
        var strip = $('ppDates');
        var scroll = strip.querySelector('.pp-dates-scroll');
        var left = scroll ? scroll.scrollLeft : 0;
        strip.innerHTML = '<div class="pp-dates-scroll">' + datesTable() + '</div>';
        strip.querySelectorAll('input[data-state]').forEach(function (input) {
            input.checked = input.dataset.state === 'all';
        });
        strip.querySelector('.pp-dates-scroll').scrollLeft = left;
    }

    /* ---------- changes from the dates ---------- */
    function setCut(key, on) { if (on) delete state.cut[key]; else state.cut[key] = true; }

    function onDatesChange(e) {
        var input = e.target.closest('input[data-pp]');
        if (!input) return;
        var key = input.dataset.key;
        var field = input.dataset.field;
        var kind = input.dataset.pp;
        if (kind === 'cell') setCut(field + ':' + key, !fieldOn(field, key));
        else if (kind === 'date') setCut('d:' + key, !dayOn(key));
        render();
        // The same box keeps the keyboard focus after drawing again.
        var again = $('ppDates').querySelector('input[data-pp="' + kind + '"][data-key="' + key + '"]' +
            (field ? '[data-field="' + field + '"]' : ''));
        if (again) again.focus();
    }

    /* ---------- the page ---------- */
    function renderMode() {
        $('ppMode').querySelectorAll('button[data-mode]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
        });
    }

    function render() {
        $('ppSheet').innerHTML = window.FeriizPrintSheet.render(job, view());
        window.FeriizPrintSheet.pageBoxes(job, view(), 'feriiz-preview');
        renderDates();
        savePrefs();
        renderMode();
    }

    // Another mode takes its own dates (what is kept for its weekdays).
    function onModeClick(e) {
        var btn = e.target.closest('button[data-mode]');
        if (!btn || btn.dataset.mode === state.mode) return;
        state.mode = btn.dataset.mode;
        state.cut = modeCut(state.mode);
        render();
        var again = $('ppMode').querySelector('button[data-mode="' + state.mode + '"]');
        if (again) again.focus();
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
    }

    function init() {
        $('ppClose').addEventListener('click', closeTab);
        var id = new URL(location.href).searchParams.get('job');
        job = id && window.FeriizPrintSheet ? window.FeriizPrintSheet.load(id) : null;
        if (!job) {
            fail('These print options are no longer available. Go back to the Report and press Print again.');
            return;
        }
        if (!job.rows.length) {
            fail('There is nobody to print. Go back to the Report and change its filters.');
            return;
        }
        pageTitle = 'Feriiz - Print Options - ' + (job.project.name || 'Report');
        document.title = pageTitle;
        $('ppContext').textContent = (job.employeePage ? job.subtitle.split(' • ')[0] + ' · ' : '') + job.title + ' · ' + job.period;
        state = freshState('internal', true);
        render();
        $('ppState').hidden = true;
        $('ppDates').hidden = false;
        $('ppPaper').hidden = false;

        $('ppDates').addEventListener('change', onDatesChange);
        $('ppMode').addEventListener('click', onModeClick);
        $('ppReset').addEventListener('click', function () {
            state = freshState(state.mode, false);
            render();
        });
        $('ppPrint').addEventListener('click', function () { window.print(); });
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
