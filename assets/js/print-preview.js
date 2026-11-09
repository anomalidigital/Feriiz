/* =============================================
   FERIIZ — Print preview (report_print.html, 06-11-2026)
   The Report's Print opens this tab with the sheet it would print (print-report.js,
   FeriizPrintSheet), so the admin can leave things out first (Baldy, 06-11-2026: "kebuka
   tab baru dulu… bisa ilangin coloms tabel"; the meeting of 05-11, 1:55: "pakai mata"):
   - the eye in a column's header leaves that column out, in a group's header the group;
   - the eye by a name leaves that person out;
   - the eraser in a date's header prints the header with nothing under it, and "Blank
     days" does it for every such weekday: a client who must not see Sunday work, but asks
     why a date is missing (meeting 05-11, 1:38: "ilangin semua data Minggunya, tapi header
     Minggunya tetap ada"). It works for any day and any project.
   What is left out stays in sight, faded, until "Show print result". The sheet adds up
   only what it prints. The columns left out and the blanked weekdays are kept for the
   project's next print, for each of Internal and Client; single dates and people are not.
   For: Internal | Client (meeting 05-11-2026, 0:34:01: "ada yang buat klien, ada yang buat
   internal"): Client prints every day with data at the Set Default, Daily 1 with the
   project's Default Hours and overtime of that weekday, without changing the Report; it
   starts without the Employee group, the workers' pay. Local only for now (Baldy, 06-11-2026: "di local dulu
   aja"; 09-11-2026: the meeting's items, local).
   ============================================= */
(function () {
    'use strict';

    var PREFS_KEY = 'feriiz_print_prefs_v1';
    var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var job = null;
    var state = null;
    var pageTitle = document.title;

    function $(id) { return document.getElementById(id); }

    function readPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    // { internal: { cols, days }, client: { cols, days } } kept for the project (06-11 kept one set: Internal).
    function projectPrefs() {
        var p = readPrefs()[job.project.code] || {};
        return p.internal || p.client ? p : { internal: p };
    }

    function modePrefs(mode) { return projectPrefs()[mode] || null; }

    function keptCount(p) { return p ? (p.cols || []).length + (p.days || []).length : 0; }

    function savePrefs() {
        var all = readPrefs();
        var mine = projectPrefs();
        var cols = Object.keys(state.hidden).filter(function (k) { return state.hidden[k] && k.indexOf('date:') !== 0; });
        var days = Object.keys(state.days).filter(function (d) { return state.days[d]; }).map(Number);
        mine[state.mode] = { cols: cols, days: days };
        all[job.project.code] = mine;
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(all)); } catch (e) { /* kept for this tab only */ }
    }

    // What a mode starts with: what was kept for it, else nothing left out, but the client
    // print leaves out the Employee group, the workers' pay.
    function modeColumns(mode) {
        var p = modePrefs(mode);
        var s = { hidden: {}, days: {} };
        if (p) {
            (p.cols || []).forEach(function (k) { s.hidden[k] = true; });
            (p.days || []).forEach(function (d) { s.days[d] = true; });
        } else if (mode === 'client') {
            s.hidden.emp = true;
        }
        return s;
    }

    // mode: 'internal' or 'client'; hidden: columns left out; days: blanked weekdays; dates: a
    // single date blanked (true) or kept although its weekday is blanked (false); rows: people
    // left out.
    function freshState(mode, withPrefs) {
        var cols = withPrefs ? modeColumns(mode) : { hidden: {}, days: {} };
        return { mode: mode, hidden: cols.hidden, days: cols.days, dates: {}, rows: {}, result: false };
    }

    function isBlank(d) {
        return state.dates[d.date] === true || (state.dates[d.date] !== false && Boolean(state.days[d.dow]));
    }

    function view(controls) {
        var blank = {};
        job.dates.forEach(function (d) { if (isBlank(d)) blank[d.date] = true; });
        return { hidden: state.hidden, blank: blank, rowsOff: state.rows, controls: controls, client: state.mode === 'client' };
    }

    function weekdays() {
        var seen = {};
        job.dates.forEach(function (d) { if (d.dow >= 0) seen[d.dow] = true; });
        return Object.keys(seen).map(Number).sort();
    }

    function count(map) { return Object.keys(map).filter(function (k) { return map[k]; }).length; }

    function listText(items) {
        return items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items[0];
    }

    function nothingLeft() { return count(state.rows) >= job.rows.length; }

    function summary() {
        if (nothingLeft()) return 'Everyone is left out, so there is nothing to print. Bring someone back with the eye by their name, or Reset.';
        var mode = state.mode === 'client'
            ? 'For the client: every day with data prints the Set Default, Daily 1 with its default hours and overtime. '
            : 'Internal: the Report\'s own data. ';
        var parts = [];
        var blankDays = weekdays().filter(function (d) {
            return state.days[d] && job.dates.some(function (x) { return x.dow === d && isBlank(x); });
        }).map(function (d) { return DAY_LONG[d]; });
        if (blankDays.length) parts.push(listText(blankDays) + ' blanked, header kept');
        var singles = job.dates.filter(function (d) { return isBlank(d) && !state.days[d.dow]; }).length;
        if (singles) parts.push(singles + (singles === 1 ? ' date' : ' dates') + ' blanked');
        var cols = count(state.hidden);
        if (cols) parts.push(cols + (cols === 1 ? ' column' : ' columns') + ' left out');
        var people = count(state.rows);
        if (people) parts.push(people + (people === 1 ? ' person' : ' people') + ' left out');
        if (!parts.length) {
            return mode + 'Use the eye in a header or by a name to leave it out, or the eraser on a date to print its header only.';
        }
        return mode + parts.join(' · ') + '. The totals count only what prints.' +
            (keptCount(modePrefs(state.mode)) ? ' Columns and days left out are kept for this project\'s next ' + (state.mode === 'client' ? 'client' : 'internal') + ' print.' : '');
    }

    function renderMode() {
        $('ppMode').querySelectorAll('button[data-mode]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.mode));
        });
    }

    function renderDays() {
        var days = weekdays();
        $('ppDays').innerHTML = days.length ? '<span class="pp-days-label">Blank days</span>' + days.map(function (d) {
            var on = Boolean(state.days[d]);
            var label = on ? 'Print every ' + DAY_LONG[d] + ' again' : 'Blank every ' + DAY_LONG[d] + ', keep its header';
            return '<button type="button" class="pp-day" data-day="' + d + '" aria-pressed="' + on + '" title="' + label + '" aria-label="' + label + '">' +
                DAY_SHORT[d] + '</button>';
        }).join('') : '';
    }

    function render() {
        $('ppSheet').innerHTML = window.FeriizPrintSheet.render(job, view(true));
        $('ppPrintSheet').innerHTML = window.FeriizPrintSheet.render(job, view(false));
        $('ppStage').classList.toggle('is-result', state.result);
        $('ppResult').checked = state.result;
        savePrefs();
        renderMode();
        renderDays();
        $('ppSummary').textContent = summary();
        $('ppSummary').classList.toggle('is-warning', nothingLeft());
    }

    // After drawing again, the same button keeps the keyboard focus.
    function refocus(container, selector) {
        var again = container.querySelector(selector);
        if (again) again.focus();
    }

    function onSheetClick(e) {
        var btn = e.target.closest('button[data-pp]');
        if (!btn) return;
        var key = btn.dataset.key;
        if (btn.dataset.pp === 'col') {
            state.hidden[key] = !state.hidden[key];
        } else if (btn.dataset.pp === 'row') {
            state.rows[key] = !state.rows[key];
        } else if (btn.dataset.pp === 'blank') {
            var date = job.dates.filter(function (d) { return d.date === key; })[0];
            if (date) state.dates[key] = !isBlank(date);
        }
        render();
        refocus($('ppSheet'), 'button[data-pp="' + btn.dataset.pp + '"][data-key="' + key + '"]');
    }

    function onDayClick(e) {
        var btn = e.target.closest('button[data-day]');
        if (!btn) return;
        var day = Number(btn.dataset.day);
        state.days[day] = !state.days[day];
        // The weekday decides for all its dates again.
        job.dates.forEach(function (d) { if (d.dow === day) delete state.dates[d.date]; });
        render();
        refocus($('ppDays'), 'button[data-day="' + day + '"]');
    }

    // Another mode keeps the people and dates left out, and takes its own columns and days.
    function onModeClick(e) {
        var btn = e.target.closest('button[data-mode]');
        if (!btn || btn.dataset.mode === state.mode) return;
        var cols = modeColumns(btn.dataset.mode);
        state.mode = btn.dataset.mode;
        state.hidden = cols.hidden;
        state.days = cols.days;
        state.dates = {};
        render();
        refocus($('ppMode'), 'button[data-mode="' + state.mode + '"]');
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
        ['ppMode', 'ppDays', 'ppResultWrap', 'ppReset', 'ppPrint'].forEach(function (id) { $(id).hidden = true; });
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
        pageTitle = 'Feriiz - Print preview - ' + (job.project.name || 'Report');
        document.title = pageTitle;
        $('ppContext').textContent = (job.employeePage ? job.subtitle.split(' • ')[0] + ' · ' : '') + job.title + ' · ' + job.period;
        $('ppSummary').tabIndex = -1;
        state = freshState('internal', true);
        render();
        $('ppState').hidden = true;
        $('ppPaper').hidden = false;

        $('ppSheet').addEventListener('click', onSheetClick);
        $('ppDays').addEventListener('click', onDayClick);
        $('ppMode').addEventListener('click', onModeClick);
        $('ppResult').addEventListener('change', function () { state.result = this.checked; render(); });
        $('ppReset').addEventListener('click', function () { state = freshState(state.mode, false); render(); });
        $('ppPrint').addEventListener('click', printSheet);
        // "Save as PDF" names the file after the sheet, as the Report's print did.
        window.addEventListener('beforeprint', function () { document.title = window.FeriizPrintSheet.identifier(job, view(false)); });
        window.addEventListener('afterprint', function () { document.title = pageTitle; });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
