(function () {
    'use strict';

    /* =============================================
       DATA
       ============================================= */
    /* Day columns run from the start of the selected range up to TODAY and never
       past it: a day that has not happened yet has no attendance, so it gets no
       column. Default range = Sunday of the current week through today (weeks run
       Sunday to Saturday, as on dev and as Arcon works, Baldy 30-10-2026), so on a
       Sunday the table shows one day, on Monday two, and so on.

       All dates are 'YYYY-MM-DD' strings in local time (never toISOString(),
       which shifts the day in UTC+7). */
    var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                       'August', 'September', 'October', 'November', 'December'];

    function pad2(n) { return String(n).padStart(2, '0'); }
    function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function fromISO(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
    function addDays(iso, n) { var d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
    function sundayOf(iso) { return addDays(iso, -fromISO(iso).getDay()); }

    // Set once the dataset loads (see loadProjectContext).
    var reportToday = toISO(new Date());
    var dataStart = '';

    function defaultRange() {
        return { start: sundayOf(reportToday), end: reportToday };
    }

    // Every day from start to end, cut off at today and at the first day with data.
    function datesInRange(start, end) {
        var from = start || defaultRange().start;
        var to = end || reportToday;
        if (to > reportToday) to = reportToday;
        if (dataStart && from < dataStart) from = dataStart;
        var dates = [];
        for (var d = from; d <= to; d = addDays(d, 1)) dates.push(d);
        return dates;
    }

    // Project + employees are resolved from URL ?project=CODE (&employee=CODE) and FERIIZ_DATA.
    var projectContext = null;
    var reportEmployees = [];
    // Fast lookup for attendance records keyed by employeeCode + '|' + date
    var attendanceIndex = {};
    // Accepted requests (sick, leave, remote, permission) keyed the same way.
    var requestIndex = {};

    function isOffDay(date) {
        var days = projectContext && projectContext.workingDays;
        if (!days || !days.length) return false;
        return days.indexOf(DAY_NAMES[fromISO(date).getDay()]) < 0;
    }

    // Dropdown controls are drafts. Only Apply is allowed to replace this state.
    var appliedReportFilters = {
        missingTypes: [],
        occupations: [],
        occupationLabels: [],
        range: null,           // { start, end } chosen in the filter; null = the default week
        original: false        // Show history: the hours the real logs make; changed days split newest | original
    };

    function appliedRange() {
        return appliedReportFilters.range || defaultRange();
    }

    // The range typed in the filter (both empty = the default week).
    function draftRange() {
        var di = document.querySelectorAll('.filter-date');
        var s = di[0] ? di[0].value : '';
        var e = di[1] ? di[1].value : '';
        if (!s && !e) return defaultRange();
        if (s && e && s > e) { var t = s; s = e; e = t; }
        return { start: s || e, end: e || s };
    }

    function selectedOccupationLabels() {
        var select = document.querySelector('.filter-occ');
        if (!select) return [];
        return Array.prototype.filter.call(select.options, function (o) { return o.selected && !/^all\b/i.test(o.textContent.trim()); })
            .map(function (o) { return o.textContent.trim(); });
    }

    function formatIDR(n) {
        if (!n && n !== 0) return 'IDR0';
        return 'IDR' + Number(n).toLocaleString('id-ID');
    }

    function attendanceFor(employeeCode, date) {
        return attendanceIndex[employeeCode + '|' + date] || null;
    }

    function escapeHTML(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* =============================================
       HOURS
       From the real logs, hours are the time worked, at most the Time Period; overtime is
       what is worked beyond the Working Time (Baldy, 30-10-2026, like the old Feriiz: in
       08:54, out 18:06 shows 0.21h of overtime).
       - The Time Period is the project's Default Hours for that weekday: 8 of 08:00-17:00
         (Baldy, 04-11-2026: "yang di lapangan kerjanya 8 jam kerja", it was 9). Without
         Default Hours it is the whole Working Time.
       - The hour between them (8h to 9h) is the break: neither hours nor overtime.
       - The Working Time is the person's own, else the project's.
       Every day counts the hours its times make, in both views (Baldy, 05-11-2026: a day
       nobody changed counts its real times, a changed day its newest version's times).
       ============================================= */
    function toSeconds(t) {
        var p = String(t || '').split(':').map(Number);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }

    // The person's own Working Time (employee form), else the project's: { start: '08:00:00', end: '17:00:00' }.
    function workTimeOf(code) {
        var emp = code && window.FERIIZ_DATA ? window.FERIIZ_DATA.findEmployeeByCode(code) : null;
        return {
            start: ((emp && emp.workStart) || (projectContext && projectContext.workStart) || '08:00') + ':00',
            end: ((emp && emp.workEnd) || (projectContext && projectContext.workEnd) || '17:00') + ':00'
        };
    }

    // How long the Working Time is: 9h for 08:00-17:00.
    function spanOf(code) {
        var t = workTimeOf(code);
        var start = toSeconds(t.start), end = toSeconds(t.end);
        return end > start ? (end - start) / 3600 : 0;
    }

    // The Time Period: the Default Hours of that day's weekday; without a date, the Default
    // Hours when every weekday has the same. Else the whole Working Time.
    function periodOf(code, date) {
        var def = date ? dayDefault(date) : null;
        var hours = def ? def.work : date ? null : defaultWorkHours();
        return hours || spanOf(code);
    }

    function computeHours(inTime, outTime, period, span) {
        if (!inTime || !outTime) return { work: 0, ot: 0 };
        var i = toSeconds(inTime), o = toSeconds(outTime);
        if (o <= i) return { work: 0, ot: 0 };
        var worked = (o - i) / 3600;
        var limit = period == null ? periodOf('') : period;
        var otFrom = Math.max(limit, span == null ? spanOf('') : span);
        return { work: Math.min(worked, limit), ot: Math.max(0, worked - otFrom) };
    }

    function cellHours(code, date, inTime, outTime) {
        return computeHours(inTime, outTime, periodOf(code, date), spanOf(code));
    }

    /* =============================================
       DEFAULT HOURS (Baldy, 02-11-2026)
       A project sets the Hours and Overtime of its working day, for every day or per
       weekday (Projects > Project Detail > Default Hours; Arcon's "8/2"). The Hours are the
       day's Time Period: the hours a full day (Daily 1) needs. From 02-11 to 05-11-2026 a
       complete day counted the default Hours and Overtime whatever the clock said; since
       05-11 every day counts its real times (Baldy: "pake waktu yang aseli"), as the live
       Feriiz does, so the default Overtime is not added any more. Filter > Show history only
       puts each changed day's newest version next to its original; it changes no number.
       ============================================= */
    // { work, ot } in hours for one weekday ('Mon'), or null: no default, so the real logs count.
    function defaultFor(dayName) {
        var set = projectContext && projectContext.defaultHours;
        if (!set) return null;
        var day = set.custom ? (set.days || {})[dayName] : set.daily;
        var work = day ? Number(day.work) || 0 : 0;
        return work > 0 ? { work: work, ot: Math.max(0, Number(day.ot) || 0) } : null;
    }

    function dayDefault(date) { return defaultFor(DAY_NAMES[fromISO(date).getDay()]); }

    // The hours of a default day when every weekday has the same (Download Log's Period), else null.
    function defaultWorkHours() {
        var hours = [];
        DAY_NAMES.forEach(function (n) {
            var d = defaultFor(n);
            if (d && hours.indexOf(d.work) < 0) hours.push(d.work);
        });
        return hours.length === 1 ? hours[0] : null;
    }

    function showOriginal() { return appliedReportFilters.original; }

    // What a day's logs show: its log in / log out and the hours they make, the same in both
    // views (Baldy, 05-11-2026: the numbers follow the newest times, never a view switch).
    function dayView(code, date, inTime, outTime) {
        return { inTime: inTime, outTime: outTime, hours: cellHours(code, date, inTime, outTime) };
    }

    /* =============================================
       CHANGES: IMPORT, ADD LOG, DELETE LOG (Baldy, 05-11-2026)
       Every change to a day is a version, kept in order:
       - Import XLSX sets the day's NUMBERS: Daily (1 = the project's hours met, 0.5 = came
         but did not meet them, 0 = did not come) and Overtime hours, plus the rates in the file
         (Feriiz team, 27-10-2026). The file has no log times: a day it raises to Daily 1 takes
         the working time as its log in and log out (Baldy, 05-11-2026, as the live Feriiz does:
         "langsung keisi"); the other days keep their logs.
       - Add Log sets the LOGS (a custom time like 07:00 -> 08:00 is done here, Baldy
         05-11-2026) and Delete Log empties them; the numbers come from the logs again.
       The newest version is what the day shows and counts ("import 1 > import 2 > add log:
       yang dipake add log", and the other way round). A day that now differs from the
       machine's original is blue as a whole cell ("lansung coloms nya"), for an import and
       for Add Log alike ("sama sama update"). With Filter > Show history a changed day splits:
       the newest version on the left, the original on the right (Pak Stef, 04-11-2026), and
       a date's History lists every version. Prototype only: kept in this browser per project
       until the API exists.
       ============================================= */
    var IMPORT_KEY = 'feriiz_report_imports_v1';   // every version, not only imports (the key keeps its name)
    var LEGACY_LOG_EDITS_KEY = 'feriiz_report_log_edits_v1';   // where v3.7.56 kept Add Log / Delete Log
    var RATE_LABELS = { daily: 'Daily Rate', ot: 'Rate Overtime', clientDaily: 'Client Daily Rate', clientOt: 'Client Rate Overtime' };
    var importStore = {};
    try { importStore = JSON.parse(localStorage.getItem(IMPORT_KEY) || '{}') || {}; } catch (e) { importStore = {}; }

    // { rates, batches: every version in order, { id, kind: 'import' | 'add' | 'delete', at, by,
    //   role, file (import), note (add), cells: { 'CODE|DATE': the numbers (import) or the logs
    //   it added (add) } } }. Imports kept before 05-11-2026 have no kind.
    function projectImports() {
        var code = projectContext ? projectContext.code : '';
        var p = importStore[code] || (importStore[code] = { rates: {}, batches: [] });
        if (!p.batches) p.batches = batchesFromCells(p.cells || {});
        if (!p.rates) p.rates = {};
        return p;
    }

    function kindOf(b) { return b.kind || 'import'; }

    // Imports kept before 30-10-2026 had no history: each file and time becomes one import.
    function batchesFromCells(cells) {
        var byId = {};
        Object.keys(cells).forEach(function (key) {
            var c = cells[key];
            var id = (c.file || '') + '|' + (c.at || '');
            var b = byId[id] || (byId[id] = { id: 'IMP-' + Object.keys(byId).length, file: c.file || '', at: c.at || '', by: c.by || 'Admin', cells: {} });
            b.cells[key] = { daily: c.daily, ot: c.ot, start: c.start, end: c.end, period: c.period };
        });
        return Object.keys(byId).map(function (id) { return byId[id]; })
            .sort(function (a, b) { return a.at.localeCompare(b.at); });
    }

    // v3.7.56 kept Add Log / Delete Log apart, as each day's final logs. They become versions: a
    // Delete Log where a machine log is gone, then an Add Log for the logs an admin added, at
    // the time they were added. Runs once per project, after the machine's logs are indexed.
    function migrateLogEdits() {
        var all = null;
        try { all = JSON.parse(localStorage.getItem(LEGACY_LOG_EDITS_KEY) || 'null'); } catch (e) { all = null; }
        var code = projectContext && projectContext.code;
        if (!all || !code || !all[code]) return;
        var p = projectImports(), byId = {};
        function version(kind, stamp, note) {
            var id = kind + '|' + (stamp.at || '');
            return byId[id] || (byId[id] = { id: (kind === 'add' ? 'ADD-' : 'DEL-') + Object.keys(byId).length, kind: kind,
                at: stamp.at || '', by: stamp.by, role: stamp.role, note: note || '', cells: {} });
        }
        Object.keys(all[code]).forEach(function (key) {
            var rec = all[code][key] || {}, machine = attendanceIndex[key] || {};
            var stamp = rec.inAdded || rec.outAdded || {};
            var gone = (machine.inTime && rec.inTime !== machine.inTime) || (machine.outTime && rec.outTime !== machine.outTime);
            if (gone) {
                var before = stamp.at ? new Date(new Date(stamp.at).getTime() - 1000).toISOString() : '';
                version('delete', { at: before, by: stamp.by, role: stamp.role }).cells[key] = {};
            }
            var added = {};
            if (rec.inAdded && rec.inTime) added.inTime = rec.inTime;
            if (rec.outAdded && rec.outTime) added.outTime = rec.outTime;
            if (added.inTime || added.outTime) version('add', stamp, (rec.inAdded && rec.inNote) || (rec.outAdded && rec.outNote) || '').cells[key] = added;
        });
        Object.keys(byId).forEach(function (id) { p.batches.push(byId[id]); });
        p.batches.sort(function (a, b) { return (a.at || '').localeCompare(b.at || ''); });
        saveImports();
        delete all[code];
        try {
            if (Object.keys(all).length) localStorage.setItem(LEGACY_LOG_EDITS_KEY, JSON.stringify(all));
            else localStorage.removeItem(LEGACY_LOG_EDITS_KEY);
        } catch (e) { /* tried again next time */ }
    }

    // Who changes a day, for its History: the account's name and role, as My Account shows them
    // (Baldy, 04-11-2026). Sessions and imports from before then kept only "Admin": that is the
    // demo account.
    var DEMO_ACCOUNT = { name: 'Baldyas Satrio', role: 'Admin' };

    function accountOf(name, role) {
        var bare = !name || name === DEMO_ACCOUNT.role;
        return { name: bare ? DEMO_ACCOUNT.name : name, role: role || DEMO_ACCOUNT.role };
    }

    function currentAccount() {
        var user = {};
        try { user = JSON.parse(localStorage.getItem('feriiz_user') || '{}') || {}; } catch (e) { /* no session */ }
        return accountOf(user.name, user.role);
    }

    // The versions that changed this day for someone in this report, oldest first.
    function versionsOn(date) {
        var inReport = {};
        reportEmployees.forEach(function (e) { inReport[e.code] = true; });
        return projectImports().batches.filter(function (b) {
            return Object.keys(b.cells).some(function (key) {
                var parts = key.split('|');
                return parts[1] === date && inReport[parts[0]];
            });
        });
    }

    function saveImports() {
        try { localStorage.setItem(IMPORT_KEY, JSON.stringify(importStore)); } catch (e) { /* kept for this page only */ }
    }

    function hasImports() {
        var p = projectImports();
        return p.batches.length > 0 || Object.keys(p.rates).length > 0;
    }

    function dayOffFor(code, date) {
        var rec = attendanceFor(code, date);
        return rec ? (rec.status === 'weekend' || rec.status === 'holiday') : isOffDay(date);
    }

    // A day after its versions, oldest first, up to and with `upTo` (null: none, the machine's
    // original). The newest decides: an import sets the numbers, and a day it raises to Daily 1
    // takes the working time as its logs (filled); Add Log sets logs and Delete Log empties
    // them, after which the numbers come from the logs again. A day off ignores the machine's
    // logs, as it always did; Add Log can still give it some.
    function dayState(code, date, upTo) {
        var key = code + '|' + date;
        var rec = attendanceIndex[key] || {};
        var off = dayOffFor(code, date);
        var s = { off: off, inTime: off ? '' : rec.inTime || '', outTime: off ? '' : rec.outTime || '',
                  inNote: off ? '' : rec.inNote || '', outNote: off ? '' : rec.outNote || '', numbers: null, last: null, filled: false };
        if (upTo === null) return s;
        var batches = projectImports().batches;
        for (var i = 0; i < batches.length; i++) {
            var b = batches[i], c = b.cells[key];
            if (!c) continue;
            var kind = kindOf(b);
            if (kind === 'add') {
                if (c.inTime) { s.inTime = c.inTime; s.inNote = b.note || ''; }
                if (c.outTime) { s.outTime = c.outTime; s.outNote = b.note || ''; }
                s.numbers = null;
                s.filled = false;
            } else if (kind === 'delete') {
                s.inTime = s.outTime = s.inNote = s.outNote = '';
                s.numbers = null;
                s.filled = false;
            } else {
                if (Number(c.daily) === 1 && logCount(code, date, s.inTime, s.outTime).daily < 1) {
                    var workTime = workTimeOf(code);
                    s.inTime = c.start || workTime.start;
                    s.outTime = c.end || workTime.end;
                    s.inNote = s.outNote = '';
                    s.filled = true;
                }
                s.numbers = c;
            }
            s.last = b;
            if (b === upTo) break;
        }
        return s;
    }

    // What a day's logs count, by the live Feriiz's rule (Baldy, 05-11-2026): Daily 1 when the day
    // meets the project's hours, 0.5 when someone came but did not (7 of 8 hours, or only one
    // log), 0 when nobody came. Hours and overtime need both logs and come from their times.
    function logCount(code, date, inTime, outTime) {
        if (!inTime && !outTime) return { daily: 0, work: 0, ot: 0 };
        if (!inTime || !outTime) return { daily: 0.5, work: 0, ot: 0 };
        var view = dayView(code, date, inTime, outTime);
        var work = round2(view.hours.work);
        return { daily: work >= round2(periodOf(code, date)) ? 1 : 0.5, work: work, ot: round2(view.hours.ot) };
    }

    // What a day shows and counts now: the newest import's numbers, else its logs'. A Daily the
    // import left as it was keeps the hours the logs make, so a plain download and import
    // changes nothing on screen; a changed Daily counts Daily x the file's Period.
    function stateCount(employee, date, s) {
        var logs = logCount(employee.code, date, s.inTime, s.outTime);
        var imp = s.numbers;
        if (!imp) return logs;
        return {
            daily: imp.daily,
            work: imp.daily !== logs.daily ? round2((Number(imp.daily) || 0) * importHours(employee, imp).period) : logs.work,
            ot: round2(imp.ot)
        };
    }

    function differs(a, b) { return a.daily !== b.daily || Math.abs((a.ot || 0) - (b.ot || 0)) >= 0.01; }

    // Does the day now differ from the machine's original: other logs, or numbers an import changed.
    function isChanged(employee, date, s) {
        if (!s.last) return false;
        var o = dayState(employee.code, date, null);
        if (s.inTime !== o.inTime || s.outTime !== o.outTime) return true;
        return Boolean(s.numbers) && differs(s.numbers, logCount(employee.code, date, s.inTime, s.outTime));
    }

    // "Daily 1 · OT 1.47h", in the words of the Excel columns.
    function dayText(d) { return 'Daily ' + d.daily + ' · OT ' + formatHour(d.ot); }

    function stampText(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return shortDate(toISO(d)) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function versionName(b) {
        var kind = kindOf(b);
        return kind === 'add' ? 'Add Log' : kind === 'delete' ? 'Delete Log' : 'Import';
    }

    // Who changed a day last, and how: the tooltip of a blue day.
    function versionText(b) {
        var who = accountOf(b.by, b.role);
        var what = kindOf(b) === 'import' ? 'Imported' + (b.file ? ' from ' + b.file : '') : versionName(b);
        return what + ' by ' + who.name + ' · ' + who.role + (b.at ? ', ' + stampText(b.at) : '') + '.' + (b.note ? ' Note: ' + b.note : '');
    }

    // The rates a row is paid with: the imported ones, else the system's.
    function ratesFor(employee) {
        var r = {
            daily: Number(employee.dailyRate) || 0,
            ot: projectContext ? Number(projectContext.overtimeRate) || 0 : 0,
            clientDaily: Number(employee.clientDailyRate) || 0,
            clientOt: projectContext ? Number(projectContext.clientOvertimeRate) || 0 : 0
        };
        var imp = projectImports().rates[employee.code];
        if (imp) Object.keys(r).forEach(function (k) { if (imp[k] != null) r[k] = imp[k]; });
        return r;
    }

    // The working day of an import: the file's Time Start / Time End / Period for the person,
    // else their own hours, else the project's (imports from before 30-10-2026 kept only Daily
    // and Overtime).
    function importHours(employee, imp) {
        var workTime = workTimeOf(employee.code);
        var start = imp.start || workTime.start;
        var end = imp.end || workTime.end;
        var period = imp.period != null ? imp.period : periodOf(employee.code);
        return { start: start, end: end, period: period };
    }

    // { 'YYYY-MM-DD': true } for the days on screen that split into newest | original: with Show
    // history, the dates where someone's day changed.
    var splitDates = {};

    function computeSplitDates(dates) {
        splitDates = {};
        if (!showOriginal()) return;
        dates.forEach(function (date) {
            if (reportEmployees.some(function (e) { return isChanged(e, date, dayState(e.code, date)); })) splitDates[date] = true;
        });
    }

    var EMPTY_CLOCK_LINE = '<div class="feriiz-u-141 log-empty-row"><span class="log-placeholder">--:--:--</span></div>';

    /* History of one day (the clock button after its date, with Show history, from its second
       change on). Every version of that day side by side, oldest first, each drawn as the day
       looked right after it: hours, overtime, log in, log out. Imports, Add Log and Delete Log
       alike (Baldy, 05-11-2026: "add log juga masuk ke history"). Each column's title says
       what, when and who (Baldy, 04-11-2026: the account's name and role); an import's file and
       an Add Log's note are in its tooltip. The newest is what the day shows. */
    var historyModal = null;

    // What a person's day shows after a version, to compare one version with the one before.
    function snapshot(employee, date, upTo) {
        var s = dayState(employee.code, date, upTo);
        var c = stateCount(employee, date, s);
        return s.inTime + '|' + s.outTime + '|' + c.daily + '|' + c.work + '|' + c.ot;
    }

    function historyValueHTML(employee, date, b) {
        if (!b.cells[employee.code + '|' + date]) return '<span class="import-history-none">–</span>';
        var s = dayState(employee.code, date, b);
        var c = stateCount(employee, date, s);
        return '<div class="day-half day-half--changed">' + badgesHTML(c.work, c.ot) + logLinesHTML(s) + '</div>';
    }

    function buildHistoryModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'importHistoryModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'importHistoryTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="importHistoryTitle">History</h2>' +
                            '<p class="tpl-subtitle" id="importHistoryContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="tpl-people-head">' +
                            '<span class="tpl-people-label" id="importHistoryCount"></span>' +
                            '<div class="tpl-people-tools">' +
                                '<input type="search" class="form-control form-control-sm" id="importHistorySearch" placeholder="Search name or code" aria-label="Search people">' +
                            '</div>' +
                        '</div>' +
                        '<div class="import-history-wrap"><table class="data-table import-history-table">' +
                            '<thead id="importHistoryHead"></thead><tbody id="importHistoryRows"></tbody>' +
                        '</table></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Close</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#importHistorySearch').addEventListener('input', function (e) {
            var q = e.target.value.trim().toLowerCase();
            el.querySelectorAll('#importHistoryRows tr').forEach(function (tr) {
                tr.hidden = Boolean(q) && tr.dataset.search.indexOf(q) < 0;
            });
        });
        return el;
    }

    function openImportHistory(date) {
        var batches = versionsOn(date);
        if (batches.length < 2) return;
        if (!historyModal) historyModal = buildHistoryModal();
        var last = batches.length - 1;
        historyModal.querySelector('#importHistoryContext').textContent = projectContext.name + ' · ' +
            DAY_NAMES[fromISO(date).getDay()] + ', ' + shortDate(date) + ' · ' + batches.length + ' changes';
        historyModal.querySelector('#importHistoryHead').innerHTML = '<tr><th>Name</th>' + batches.map(function (b, i) {
            var who = accountOf(b.by, b.role);
            var tip = b.file || (b.note ? 'Note: ' + b.note : '');
            return '<th' + (i === last ? ' class="is-current"' : '') + (tip ? ' title="' + escapeHTML(tip) + '"' : '') + '>' +
                '#' + (i + 1) + ' · ' + versionName(b) + (i === last ? ' · now' : '') +
                '<small>' + escapeHTML(stampText(b.at)) + '</small>' +
                '<small class="import-history-by">' + escapeHTML(who.name) + ' · ' + escapeHTML(who.role) + '</small></th>';
        }).join('') + '</tr>';
        // People whose day one of the versions changed come first.
        var rows = reportEmployees.map(function (e) {
            var key = e.code + '|' + date;
            var touched = batches.filter(function (b) { return b.cells[key]; });
            if (!touched.length) return null;
            var prev = snapshot(e, date, null);
            var changed = touched.some(function (b) {
                var now = snapshot(e, date, b);
                var moved = now !== prev;
                prev = now;
                return moved;
            });
            return { e: e, changed: changed };
        }).filter(Boolean).sort(function (a, b) {
            return (b.changed - a.changed) || a.e.name.localeCompare(b.e.name);
        });
        var changedCount = rows.filter(function (r) { return r.changed; }).length;
        historyModal.querySelector('#importHistoryCount').textContent = changedCount + ' of ' + rows.length + ' people changed';
        historyModal.querySelector('#importHistoryRows').innerHTML = rows.map(function (r) {
            return '<tr data-search="' + escapeHTML((r.e.name + ' ' + r.e.code).toLowerCase()) + '"' + (r.changed ? ' class="is-changed"' : '') + '>' +
                '<td><div class="import-history-name">' + escapeHTML(r.e.name) + '</div><small>' + escapeHTML(r.e.code) +
                    (r.e.occupation ? ' · ' + escapeHTML(r.e.occupation) : '') + '</small></td>' +
                batches.map(function (b) { return '<td>' + historyValueHTML(r.e, date, b) + '</td>'; }).join('') +
            '</tr>';
        }).join('');
        historyModal.querySelector('#importHistorySearch').value = '';
        window.bootstrap.Modal.getOrCreateInstance(historyModal).show();
    }

    /* =============================================
       CELL RENDERING
       ============================================= */
    function buildClockLine(type, value, options) {
        var note = (options && options.note) || '';
        var iconClass = type === 'in'
            ? 'fa-arrow-right-to-bracket feriiz-u-142'
            : 'fa-arrow-right-from-bracket feriiz-u-144';
        var noteButton = note
            ? '<button type="button" class="report-log-note-btn" data-log-type="' + type + '" title="View log note" aria-label="View ' + (type === 'in' ? 'log in' : 'log out') + ' note"><i class="fa-solid fa-note-sticky"></i></button>'
            : '';
        return '<div class="feriiz-u-141">' +
            '<span><i class="fa-solid ' + iconClass + '"></i>' + escapeHTML(value) + '</span>' +
            noteButton + '</div>';
    }

    // A day's log in over its log out, "--:--:--" for a missing one.
    function logLinesHTML(logs) {
        return '<div class="feriiz-u-140">' +
            (logs.inTime ? buildClockLine('in', logs.inTime, { note: logs.inNote }) : EMPTY_CLOCK_LINE) +
            (logs.outTime ? buildClockLine('out', logs.outTime, { note: logs.outNote }) : EMPTY_CLOCK_LINE) +
        '</div>';
    }

    // A day's hours and overtime badges.
    function badgesHTML(work, ot) {
        return '<div class="feriiz-u-133"><div class="feriiz-u-134">' +
            '<span class="badge feriiz-u-135">' + formatHour(work) + '</span>' +
            '<span class="badge feriiz-u-136">' + formatHour(ot) + ' OT</span>' +
        '</div></div>';
    }

    /* =============================================
       TABLE GENERATION
       ============================================= */
    function getMissingType(inTime, outTime) {
        if (!inTime && !outTime) return 'both';
        if (!inTime && outTime) return 'in';
        if (inTime && !outTime) return 'out';
        return '';
    }

    function requestFor(code, date) { return requestIndex[code + '|' + date] || null; }

    // Same categories and colours as the Calendar.
    function requestCategory(type) {
        var t = String(type || '').toLowerCase();
        if (t.indexOf('sick') >= 0) return 'sick';
        if (t.indexOf('remote') >= 0) return 'work';
        if (t.indexOf('leave') >= 0 || t.indexOf('permission') >= 0) return 'leave';
        return 'other';
    }

    // A day without logs covered by an accepted request shows the request instead of
    // "log incomplete" (backlog A1, 28-10-2026). It is not a missing log, so the Log In /
    // Log Out filter skips it, and it still counts as no day worked.
    function requestChipHTML(req) {
        var title = req.type + ' (' + req.id + '), accepted' + (req.reason ? ': ' + req.reason : '');
        return '<div class="feriiz-u-133"><div class="feriiz-u-134">' +
            '<span class="badge cell-request-chip cat-' + requestCategory(req.type) + '-bg" title="' + escapeHTML(title) + '">' + escapeHTML(req.type) + '</span>' +
        '</div></div>';
    }

    var EMPTY_LOG_ATTRS = ' data-in-time="" data-out-time="" data-in-note="" data-out-note=""';

    function logDataAttrs(logs) {
        return ' data-in-time="' + escapeHTML(logs.inTime) + '" data-out-time="' + escapeHTML(logs.outTime) + '"' +
            ' data-in-note="' + escapeHTML(logs.inNote) + '" data-out-note="' + escapeHTML(logs.outNote) + '"';
    }

    // What a day is missing, for its colour and the Log Status filter: '', 'in', 'out' or 'both'.
    // A day without logs that an accepted request covers is not missing anything.
    function dayIssue(code, date, logs) {
        var issue = getMissingType(logs.inTime, logs.outTime);
        return issue === 'both' && requestFor(code, date) ? '' : issue;
    }

    // The colour of a day that misses logs: yellow for one, red for both (Baldy, 04-11-2026).
    function missingClass(issue) {
        return issue === 'both' ? ' no-log-cell log-missing-both' : issue ? ' no-log-cell' : '';
    }

    /* Request chips: what a day was given with Assign Request, by the template's name
       ("Uang Makan") on a line of their own under the day (Baldy, 04-11-2026: "taro di
       bawahnya", not next to the hours and overtime; they were initials in the badge row
       before). They are labels: a request is assigned and removed with Batch Update (Baldy,
       04-11-2026: "jangan di tabel nya"). Print leaves them out. */
    var requestDayIndex = {};   // FeriizTemplates.dayIndex for the days on screen

    function requestDayChips(code, date) {
        var items = requestDayIndex[code + '|' + date];
        if (!items || !items.length) return '';
        return items.map(function (it) {
            var tip = it.name + ' · ' + formatIDR(it.amount) + (it.note ? ' · ' + it.note : '');
            return '<span class="req-chip" title="' + escapeHTML(tip) + '">' + escapeHTML(it.name) + '</span>';
        }).join('');
    }

    // The chips go on their own line under everything else in the day.
    function withRequestChips(content, code, date) {
        var chips = requestDayChips(code, date);
        return chips ? content + '<div class="req-chip-row">' + chips + '</div>' : content;
    }

    // A day in a given state: its class and data, and what goes inside. Its colour follows its
    // logs (Baldy, 04-11-2026): yellow when one is missing, red when both are. noteAttrs lets
    // the original half of a split day open its own log notes.
    function dayContent(employee, date, s) {
        var code = employee.code;
        var numbered = s.numbers && (s.numbers.daily || s.numbers.ot);
        if (s.off && !s.inTime && !s.outTime && !numbered) {
            return { cls: 'weekend-off-cell', off: true, attrs: EMPTY_LOG_ATTRS, content: withRequestChips('', code, date) };
        }
        var request = !s.inTime && !s.outTime && !numbered ? requestFor(code, date) : null;
        if (request) {
            return { cls: 'request-day-cell', content: withRequestChips(requestChipHTML(request), code, date),
                     attrs: ' data-request="' + escapeHTML(request.type) + '"' + EMPTY_LOG_ATTRS + ' data-daily="0" data-work="0" data-ot="0" data-ot-total="0"' };
        }
        var issue = dayIssue(code, date, s);
        // The data keeps the logs (notes, Batch Update); the cell shows the view.
        var count = stateCount(employee, date, s);
        return {
            cls: missingClass(issue).trim(),
            issue: issue,
            attrs: (s.numbers ? ' data-imported="1"' : '') + ' data-daily="' + count.daily + '"' + (issue ? ' data-missing="' + issue + '"' : '') + logDataAttrs(s) +
                ' data-work="' + count.work.toFixed(4) + '" data-ot="' + count.ot.toFixed(4) + '" data-ot-total="' + count.ot.toFixed(4) + '"',
            noteAttrs: ' data-date="' + date + '"' + logDataAttrs(s),
            content: withRequestChips(badgesHTML(count.work, count.ot) + logLinesHTML(s), code, date)
        };
    }

    // The right half of a split day: the machine's original, yellow when a log is missing and red
    // when both are. A day off keeps its request chips (a red-date incentive).
    function systemHalfHTML(sys) {
        if (sys.off) return '<div class="day-half day-half--system is-empty">' + (sys.content || '') + '<span class="day-half-empty">Day off</span></div>';
        var state = sys.issue === 'both' ? ' is-incomplete is-missing-both' : sys.issue ? ' is-incomplete' : '';
        return '<div class="day-half day-half--system' + state + '"' + (sys.noteAttrs || '') + '>' + sys.content + '</div>';
    }

    var NO_CHANGE_HALF = '<div class="day-half day-half--changed is-empty"><span class="day-half-empty">No change</span></div>';
    var CELL_CHECKBOX = '<div class="day-cell-checkbox"><input type="checkbox" class="day-cell-select"></div>';

    // One day as it stands. A day that differs from the machine's original is blue as a whole
    // cell, whatever changed it (Baldy, 05-11-2026), with who did it in its tooltip; the others
    // are yellow or red by their logs. With Show history a split column shows the newest
    // version on the left and the original on the right; a day nobody changed has an empty
    // left half.
    function dayCellHTML(employee, date) {
        var s = dayState(employee.code, date);
        var changed = isChanged(employee, date, s);
        var now = dayContent(employee, date, s);
        var cls = changed ? ' day-changed' : now.cls ? ' ' + now.cls : '';
        var title = changed ? ' title="' + escapeHTML(versionText(s.last) + (s.filled ? ' Daily 1: the log in and log out follow the working time.' : '')) + '"' : '';
        if (splitDates[date] && !(now.off && !changed)) {
            var halves = changed
                ? '<div class="day-half day-half--changed"' + title + '>' + now.content + '</div>' +
                    systemHalfHTML(dayContent(employee, date, dayState(employee.code, date, null)))
                : NO_CHANGE_HALF + systemHalfHTML(now);
            return '<td class="day-col feriiz-u-132 day-split-cell' + cls + '" data-date="' + date + '"' + now.attrs + '>' +
                CELL_CHECKBOX + '<div class="day-split">' + halves + '</div></td>';
        }
        return '<td class="day-col feriiz-u-132' + cls + '" data-date="' + date + '"' + now.attrs + title + '>' + CELL_CHECKBOX + now.content + '</td>';
    }

    function createDayCells(employee, dates) {
        return dates.map(function (date) { return dayCellHTML(employee, date); }).join('');
    }

    /* =============================================
       TRANSPORT (Arcon MoM 20-10-2026, built 28-10-2026)
       Every day someone worked pays the Transport / Day from their employee data,
       without anyone assigning it: a day with a log, or an imported Daily 1. Who gets
       transport is decided per person, not per day: someone who lives on the site has
       no Transport / Day (Arcon's note on the timeline, 28-10-2026), and the per-day
       skip in Batch Update was removed (Baldy, 30-10-2026). It is the first of the
       Client group's additional columns and counts in Total Additional; like every
       summary column it shows only the total.
       ============================================= */
    var TRANSPORT_COL = 'transport';

    function transportRateOf(employee) {
        return employee && window.FERIIZ_DATA && window.FERIIZ_DATA.transportOf ? window.FERIIZ_DATA.transportOf(employee) : 0;
    }

    // A day someone came in (Daily 1 or 0.5), by the same rule as Total Days.
    function workedCell(cell) {
        if (cell.classList.contains('weekend-off-cell')) return false;
        return Number(cell.dataset.daily) > 0;
    }

    // The Transport cell and Total Additional of one row, from its worked days.
    function paintTransport(row, rate, days) {
        var total = rate * days;
        var cell = row.querySelector('td.col-cli-add[data-template="' + TRANSPORT_COL + '"]');
        // Empty when there is nothing to pay, so print leaves it blank too.
        if (cell) cell.textContent = total ? formatIDR(total) : '';
        var sum = row.querySelector('td.col-cli-addtotal');
        if (sum) {
            var all = (Number(sum.dataset.requests) || 0) + total;
            sum.textContent = all ? formatIDR(all) : '';
        }
    }

    // Additional columns at the end of the Client group: Transport first (when anyone here has
    // a Transport / Day), then one column per request template given on the visible days,
    // shown only when someone here has it (whiteboard 20-10-2026). With two or more,
    // "Total Additional" adds them up (meeting 1:59, 2:01). They show only totals and
    // cannot be clicked: requests are opened and removed from the chips in the days
    // (Baldy, 29-10-2026: "di tabel ya total nya aja").
    var addColumns = [];

    function computeAddColumns(dates) {
        var templates = window.FeriizTemplates && projectContext
            ? window.FeriizTemplates.usedIn(projectContext.code, reportEmployees.map(function (e) { return e.code; }), dates) : [];
        var transport = reportEmployees.some(function (e) { return transportRateOf(e) > 0; });
        addColumns = (transport ? [{ id: TRANSPORT_COL, name: 'Transport' }] : []).concat(templates);
    }

    function hasAddTotal() { return addColumns.length > 1; }

    function addColumnCells(employeeCode, dates) {
        if (!addColumns.length) return '';
        var add = window.FeriizTemplates ? window.FeriizTemplates.additionalFor(employeeCode, projectContext.code, dates) : { total: 0, items: [] };
        var byId = {};
        add.items.forEach(function (it) { byId[it.templateId] = it; });
        var cells = addColumns.map(function (col) {
            var it = byId[col.id];
            var attrs = ' class="col-cli-add rate-cell" data-template="' + escapeHTML(col.id) + '"';
            // Transport is painted by updateVisibleTotals, from the days on screen.
            if (col.id === TRANSPORT_COL) return '<td' + attrs + '></td>';
            return '<td' + attrs + '>' + (it ? formatIDR(it.amount) : '') + '</td>';
        }).join('');
        // Total Additional = these requests + Transport, which updateVisibleTotals adds.
        if (hasAddTotal()) cells += '<td class="col-cli-addtotal rate-cell" data-requests="' + add.total + '">' + (add.total ? formatIDR(add.total) : '') + '</td>';
        return cells;
    }

    // Header cells for the template columns (and Total Additional), with a checkbox each in the column list.
    function renderAddColumnHeaders() {
        document.querySelectorAll('.report-table thead th.col-cli-add, .report-table thead th.col-cli-addtotal').forEach(function (th) { th.remove(); });
        var anchor = document.querySelector('.report-table thead th.col-cli-totalovertime');
        if (anchor) {
            anchor.insertAdjacentHTML('afterend', addColumns.map(function (col) {
                return '<th class="col-cli-add" data-template="' + escapeHTML(col.id) + '">' + escapeHTML(col.name) + '</th>';
            }).join('') + (hasAddTotal() ? '<th class="col-cli-addtotal">Total Additional</th>' : ''));
        }
        var list = document.getElementById('colClientAdditional');
        if (!list) return;
        var wasOn = {};
        list.querySelectorAll('input').forEach(function (cb) { wasOn[cb.id] = cb.checked; });
        Object.keys(colMap).forEach(function (id) { if (id.indexOf('colCliAdd') === 0) delete colMap[id]; });
        var slaves = masterGroups.colClient;
        for (var i = slaves.length - 1; i >= 0; i--) {
            if (slaves[i].indexOf('colCliAdd') === 0) slaves.splice(i, 1);
        }
        var items = addColumns.map(function (col) {
            return { id: 'colCliAdd-' + col.id, label: col.name, cols: ['.col-cli-add[data-template="' + col.id + '"]'], request: col.id !== TRANSPORT_COL };
        });
        if (hasAddTotal()) items.push({ id: 'colCliAddTotal', label: 'Total Additional', cols: ['.col-cli-addtotal'], request: true });
        // New columns start visible, so an assignment shows right away. Transport sits
        // above the "Requests" sub-heading: it is not a request.
        var headed = false;
        list.innerHTML = items.map(function (it) {
            colMap[it.id] = it.cols;
            slaves.push(it.id);
            var heading = it.request && !headed ? '<div class="col-picker-sub">Requests</div>' : '';
            if (it.request) headed = true;
            return heading + '<div class="feriiz-u-119">' +
                '<input type="checkbox" id="' + escapeHTML(it.id) + '" class="feriiz-u-120"' + (wasOn[it.id] === false ? '' : ' checked') + '>' +
                '<label for="' + escapeHTML(it.id) + '" class="feriiz-u-121">' + escapeHTML(it.label) + '</label>' +
            '</div>';
        }).join('');
        list.querySelectorAll('input').forEach(function (cb) {
            cb.addEventListener('change', function () {
                syncMasterState('colClient');
                updateFieldsVisibility();
            });
        });
        syncMasterState('colClient');
    }

    // After an Assign or a Remove: the request columns and the day chips both change.
    function refreshRequests() {
        showDays(currentVisibleDates.slice(), true);
        applyReportFilters();
    }

    // Did the person come in that day, as it stands now: a log, or an imported Daily above 0.
    // Assign Request gives Daily templates only on these days.
    function workedOn(code, date) {
        var s = dayState(code, date);
        return s.numbers ? s.numbers.daily > 0 : Boolean(s.inTime || s.outTime);
    }

    // Batch Update > Assign Request (Baldy, 04-11-2026: the toolbar button made the admin pick
    // people and days a second time). The ticked days get the template; the Report's own
    // filters and ticks already say who and when.
    function openTemplateAssign() {
        var cells = tickedDays();
        if (!cells) return;
        window.FeriizTemplates.openAssign({
            workedOn: workedOn,
            project: { code: projectContext.code, name: projectContext.name },
            cells: cells,
            onDone: afterRequests
        });
    }

    // Batch Update > Delete Request (Baldy, 04-11-2026): takes a request off the ticked days.
    // This is the only place a request is deleted; the chips in the table cannot be clicked.
    function openTemplateRemove() {
        var cells = tickedDays();
        if (!cells) return;
        window.FeriizTemplates.openRemove({
            project: { code: projectContext.code, name: projectContext.name },
            cells: cells,
            onDone: afterRequests
        });
    }

    // The ticked day cells as { code, name, date }, or null (with a warning) when none is ticked.
    function tickedDays() {
        if (!window.FeriizTemplates || !projectContext) return null;
        var cells = getSelectedCells().map(function (cell) {
            var row = cell.closest('tr');
            return { code: row.dataset.employeeCode, name: row.dataset.employeeName, date: cell.dataset.date };
        });
        if (!cells.length && window.FeriizNotify) FeriizNotify.warning('Select at least one report cell first.', 'No log selected');
        return cells.length ? cells : null;
    }

    function afterRequests() {
        deselectAllCells();
        refreshRequests();
    }

    function createEmployeeRow(employee, dates) {
        var rates = ratesFor(employee);
        var workTime = workTimeOf(employee.code);
        return '<tr data-employee-code="' + escapeHTML(employee.code) + '" data-employee-name="' + escapeHTML(employee.name) + '"' +
            ' data-daily-rate="' + rates.daily + '" data-client-daily-rate="' + rates.clientDaily + '"' +
            ' data-ot-rate="' + rates.ot + '" data-client-ot-rate="' + rates.clientOt + '"' +
            ' data-transport-rate="' + transportRateOf(employee) + '">' +
            '<td class="col-name sticky-col">' +
                '<div class="report-identity-content">' +
                    '<div class="emp-code-cell">' + escapeHTML(employee.code) + '</div>' +
                    '<div class="emp-name-cell">' + escapeHTML(employee.name) + '</div>' +
                    '<div class="emp-occupation-cell">' + escapeHTML(employee.occupation) + '</div>' +
                    '<div class="emp-pin-cell">Pin: ' + escapeHTML(employee.pin) + '</div>' +
                '</div>' +
            '</td>' +
            '<td class="col-inouthour">' + escapeHTML(workTime.start) + '</td>' +
            '<td class="col-inouthour">' + escapeHTML(workTime.end) + '</td>' +
            '<td class="col-activehour">' + formatHour(periodOf(employee.code)) + '</td>' +
            '<td class="col-totaldays">0d</td>' +
            '<td class="col-totalhour">0h</td>' +
            '<td class="col-totalovertime">0h</td>' +
            '<td class="col-emp-dailyrate rate-cell">' + formatIDR(rates.daily) + '</td>' +
            '<td class="col-emp-rateovertime rate-cell">' + formatIDR(rates.ot) + '</td>' +
            '<td class="col-emp-totalrate rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-emp-totalovertime rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-cli-dailyrate rate-cell">' + formatIDR(rates.clientDaily) + '</td>' +
            '<td class="col-cli-rateovertime rate-cell">' + formatIDR(rates.clientOt) + '</td>' +
            '<td class="col-cli-totalrate rate-cell">' + formatIDR(0) + '</td>' +
            '<td class="col-cli-totalovertime rate-cell">' + formatIDR(0) + '</td>' +
            addColumnCells(employee.code, dates) +
            createDayCells(employee, dates) +
        '</tr>';
    }

    // One month band per calendar month in the range, then one header per day.
    function renderDayHeaders(dates) {
        var table = document.querySelector('.report-table');
        if (!table) return;
        var groupRow = table.querySelector('thead tr:first-child');
        var dayRow = table.querySelector('thead tr:nth-child(2)');
        table.querySelectorAll('thead th.month-header, thead th.day-col').forEach(function (th) { th.remove(); });

        var months = [];
        dates.forEach(function (date) {
            var key = date.slice(0, 7);
            var last = months[months.length - 1];
            if (last && last.key === key) last.count++;
            else months.push({ key: key, count: 1 });
        });
        months.forEach(function (m) {
            var th = document.createElement('th');
            th.className = 'group-header month-header';
            th.colSpan = m.count;
            var d = fromISO(m.key + '-01');
            th.textContent = MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
            groupRow.appendChild(th);
        });

        // With Show history a changed day splits in two, told apart by colour alone (Baldy,
        // 04-11-2026: no labels). From a date's second change on (an import, Add Log or Delete
        // Log), a clock button right after the date opens its History: it belongs to the day,
        // and stays away from the column's checkbox (Baldy, 30-10-2026).
        dates.forEach(function (date) {
            var th = document.createElement('th');
            var split = splitDates[date];
            var label = DAY_NAMES[fromISO(date).getDay()] + ' ' + fromISO(date).getDate();
            var changes = showOriginal() ? versionsOn(date).length : 0;
            var history = changes > 1
                ? '<button type="button" class="import-history-btn" data-date="' + date + '" title="Changed ' + changes + ' times. Click for the history."' +
                    ' aria-label="History of ' + label + ', ' + changes + ' changes"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>' + changes + '</button>'
                : '';
            th.className = 'day-col feriiz-u-130' + (split ? ' day-split-col' : '');
            th.dataset.date = date;
            th.innerHTML = (history ? '<div class="day-split-top"><span>' + label + '</span>' + history + '</div>' : '<span>' + label + '</span>') +
                '<input type="checkbox" class="day-header-select" data-date="' + date + '" aria-label="Select every log on ' + date + '">';
            dayRow.appendChild(th);
        });
    }

    function renderTable(dates) {
        var tbody = document.getElementById('reportTableBody');
        if (!tbody) return;
        computeSplitDates(dates);
        requestDayIndex = window.FeriizTemplates && projectContext ? window.FeriizTemplates.dayIndex(projectContext.code, dates) : {};
        renderDayHeaders(dates);
        computeAddColumns(dates);
        renderAddColumnHeaders();
        tbody.innerHTML = reportEmployees.map(function (emp) {
            return createEmployeeRow(emp, dates);
        }).join('');
    }

    /* =============================================
       DAY COLUMNS
       ============================================= */
    var currentVisibleDates = [];

    // Re-render only when the set of days actually changes (or the data shown does,
    // force); selection is reset.
    function showDays(datesToShow, force) {
        var same = datesToShow.length === currentVisibleDates.length &&
            datesToShow.every(function (d, i) { return d === currentVisibleDates[i]; });
        currentVisibleDates = datesToShow.slice();
        if (force || !same || !document.querySelector('#reportTableBody tr')) {
            renderTable(currentVisibleDates);
            updateFieldsVisibility();
        }
        updateVisibleTotals(currentVisibleDates);
    }

    /* =============================================
       TOTALS
       ============================================= */
    function formatHour(h) {
        if (!Number.isFinite(h) || h <= 0) return '0h';
        return Number.isInteger(h) ? h + 'h' : h.toFixed(2).replace(/\.?0+$/, '') + 'h';
    }

    // Pay is per day (decided Oct 2026):
    //   Total Rate          = Daily Rate x days with a log
    //   Total Rate Overtime = Overtime Rate per hour x overtime hours
    // Client columns use the client rates the same way.
    function setText(row, selector, text) {
        var el = row.querySelector(selector);
        if (el) el.textContent = text;
    }

    // Total Days adds up each day's Daily (1, 0.5 or 0), what pay counts. Transport is paid on the
    // days someone came in.
    function updateVisibleTotals(datesToShow) {
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            var otRate = Number(row.dataset.otRate) || 0;
            var clientOtRate = Number(row.dataset.clientOtRate) || 0;
            var transportRate = Number(row.dataset.transportRate) || 0;
            var days = 0, totalWork = 0, totalOT = 0, paid = 0;
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (datesToShow.indexOf(cell.dataset.date) < 0 || cell.classList.contains('weekend-off-cell')) return;
                days += Number(cell.dataset.daily) || 0;
                if (transportRate && workedCell(cell)) paid++;
                totalWork += Number(cell.dataset.work) || 0;
                totalOT += Number(cell.dataset.otTotal) || 0;
            });
            paintTransport(row, transportRate, paid);
            var daily = Number(row.dataset.dailyRate) || 0;
            var clientDaily = Number(row.dataset.clientDailyRate) || 0;
            setText(row, '.col-totaldays', days + 'd');
            setText(row, '.col-totalhour', formatHour(totalWork));
            setText(row, '.col-totalovertime', formatHour(totalOT));
            setText(row, '.col-emp-totalrate', formatIDR(days * daily));
            setText(row, '.col-emp-totalovertime', formatIDR(Math.round(totalOT * otRate)));
            setText(row, '.col-cli-totalrate', formatIDR(days * clientDaily));
            setText(row, '.col-cli-totalovertime', formatIDR(Math.round(totalOT * clientOtRate)));
        });
    }

    /* =============================================
       FILTERS
       ============================================= */
    function getDraftMissingTypes() {
        return Array.from(document.querySelectorAll('.filter-missing:checked')).map(function (i) { return i.value; });
    }

    function getSelectedMissingTypes() {
        return appliedReportFilters.missingTypes.slice();
    }

    // The ticked boxes must equal exactly what the cell is missing:
    //   Log In only        -> cells missing only the log in
    //   Log Out only       -> cells missing only the log out
    //   Log In + Log Out   -> cells missing both (one-sided cells stay hidden)
    // Same rule as the live Feriiz report.
    function cellMatchesMissing(cellMissing, types) {
        var wantIn = types.indexOf('in') >= 0;
        var wantOut = types.indexOf('out') >= 0;
        if (cellMissing === 'both') return wantIn && wantOut;
        if (cellMissing === 'in') return wantIn && !wantOut;
        if (cellMissing === 'out') return wantOut && !wantIn;
        return false;
    }

    function rowHasMissingType(row, types) {
        if (types.length === 0) return true;
        var cells = row.querySelectorAll('td.day-col');
        for (var i = 0; i < cells.length; i++) {
            if (currentVisibleDates.indexOf(cells[i].dataset.date) >= 0 &&
                cellMatchesMissing(cells[i].dataset.missing || '', types)) {
                return true;
            }
        }
        return false;
    }

    function rowMatchesSearch(row) {
        var q = ((document.getElementById('reportSearch') || {}).value || '').trim().toLowerCase();
        if (!q) return true;
        return ((row.querySelector('.col-name') || {}).textContent || '').toLowerCase().indexOf(q) >= 0;
    }

    // Exact match: "Surveyor" must not also pick "Quantity Surveyor".
    function rowMatchesOccupation(row) {
        var sel = appliedReportFilters.occupations;
        if (sel.length === 0) return true;
        var occ = ((row.querySelector('.emp-occupation-cell') || {}).textContent || '').trim().toLowerCase();
        return sel.indexOf(occ) >= 0;
    }

    function applyReportFilters() {
        var types = getSelectedMissingTypes();
        var hasFilter = types.length > 0;

        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            var vis = rowMatchesSearch(row) && rowMatchesOccupation(row) && rowHasMissingType(row, types);
            row.hidden = !vis;
            if (!vis) {
                row.querySelectorAll('.day-cell-select:checked').forEach(function (cb) { cb.checked = false; });
            }

            // When filter active: only show cells that ARE missing the selected type
            // All other cells (normal + different missing type) get hidden
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (!hasFilter) {
                    cell.classList.remove('filtered-out-cell');
                    return;
                }
                var isMatch = cellMatchesMissing(cell.dataset.missing || '', types);
                cell.classList.toggle('filtered-out-cell', !isMatch);
            });
        });
        paginateRows();
        updateCellSelectionUI();
        updateFilterIndicator();
    }

    /* =============================================
       PAGES (Baldy, 04-11-2026): 20 people at a time, like Employees and Activity.
       The filters decide the rows (hidden); a page only takes the others off the screen
       (class page-off), so print still has every filtered row and Download Log every
       person. Ticks are not tied to a page (Baldy, 05-11-2026: "mau di pagination berapa… sampe
       pagination 7"): a date's checkbox ticks that date for everyone the filters show, on every
       page, ticks stay when the page changes, and Batch Update acts on all of them.
       ============================================= */
    var PAGE_SIZE = 20;
    var reportPage = 1;
    var pageFilterKey = '';

    // A row the filters show, on whichever page.
    function rowInFilter(row) { return !row.hidden; }

    function paginateRows() {
        // A new search or filter starts again on the first page.
        var key = JSON.stringify([((document.getElementById('reportSearch') || {}).value || '').trim(),
            appliedReportFilters.occupations, getSelectedMissingTypes()]);
        if (key !== pageFilterKey) {
            pageFilterKey = key;
            reportPage = 1;
        }
        var all = Array.prototype.slice.call(document.querySelectorAll('.report-table tbody tr'));
        var rows = all.filter(function (row) { return !row.hidden; });
        var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        reportPage = Math.min(reportPage, pages);
        var start = (reportPage - 1) * PAGE_SIZE;
        all.forEach(function (row) { row.classList.remove('page-off'); });
        rows.forEach(function (row, i) {
            if (i >= start && i < start + PAGE_SIZE) return;
            row.classList.add('page-off');
        });
        renderPager(rows.length, pages, start);
    }

    function goToPage(n) {
        reportPage = n;
        paginateRows();
        updateCellSelectionUI();
        var wrap = document.querySelector('.report-table-wrap');
        if (wrap) wrap.scrollTop = 0;
    }

    // "Showing 1 - 20 of 134 results" and the page buttons, as on Employees.
    function renderPager(total, pages, start) {
        var info = document.getElementById('reportPageInfo');
        var box = document.getElementById('reportPageButtons');
        if (!info || !box) return;
        info.textContent = total ? 'Showing ' + (start + 1) + ' - ' + Math.min(start + PAGE_SIZE, total) + ' of ' + total + ' results'
            : 'No employees match your filter';
        box.innerHTML = '';
        var prev = document.createElement('button');
        prev.type = 'button';
        prev.innerHTML = '&lt; <span class="pager-word">Previous</span>';
        prev.disabled = reportPage === 1;
        prev.addEventListener('click', function () { goToPage(reportPage - 1); });
        box.appendChild(prev);
        var shown = {};
        shown[1] = shown[pages] = true;
        for (var p = reportPage - 2; p <= reportPage + 2; p++) if (p > 1 && p < pages) shown[p] = true;
        var last = 0;
        Object.keys(shown).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
            if (last && n - last > 1) {
                var dots = document.createElement('span');
                dots.className = 'page-dots';
                dots.textContent = '...';
                box.appendChild(dots);
            }
            var link = document.createElement('a');
            link.href = '#';
            link.textContent = n;
            if (n === reportPage) {
                link.className = 'active';
                link.setAttribute('aria-current', 'page');
            }
            link.addEventListener('click', function (e) { e.preventDefault(); goToPage(n); });
            box.appendChild(link);
            last = n;
        });
        var next = document.createElement('a');
        next.href = '#';
        next.innerHTML = '<span class="pager-word">Next</span> &gt;';
        next.hidden = reportPage === pages;
        next.addEventListener('click', function (e) { e.preventDefault(); goToPage(reportPage + 1); });
        box.appendChild(next);
    }

    /* =============================================
       CELL SELECTION
       ============================================= */
    // Every ticked day the filters show, on every page.
    function getSelectedCells() {
        var cells = [];
        document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
            if (!rowInFilter(row)) return;
            row.querySelectorAll('td.day-col').forEach(function (cell) {
                if (currentVisibleDates.indexOf(cell.dataset.date) < 0) return;
                var cb = cell.querySelector('.day-cell-select');
                if (cb && cb.checked) cells.push(cell);
            });
        });
        return cells;
    }

    function getAffectedEmployeeCount() {
        var codes = new Set();
        getSelectedCells().forEach(function (cell) {
            var row = cell.closest('tr');
            if (row) codes.add(row.dataset.employeeCode);
        });
        return codes.size;
    }

    function updateCellSelectionUI() {
        var selected = getSelectedCells();
        var bulkBar = document.getElementById('reportBulkActions');
        var countText = document.getElementById('selectedCellCount');
        var toggle = document.getElementById('batchUpdateToggle');
        var deselectBtn = document.getElementById('deselectAll');

        if (bulkBar) bulkBar.hidden = selected.length === 0;
        if (countText) countText.textContent = selected.length + ' selected';
        if (toggle) toggle.disabled = selected.length === 0;
        if (deselectBtn) deselectBtn.style.display = selected.length > 0 ? '' : 'none';

        var hasLogs = selected.some(function (cell) {
            return (cell.dataset.inTime && cell.dataset.inTime.trim() !== '') ||
                   (cell.dataset.outTime && cell.dataset.outTime.trim() !== '');
        });

        // Imported days keep their logs, so Delete Log works on them too (Baldy, 04-11-2026:
        // "kenapa ga bisa delete log?").
        var deleteBtn = document.querySelector('#batchUpdateDropdown button[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.disabled = !hasLogs;
        }

        syncDayHeaderSelections();
    }

    function syncDayHeaderSelections() {
        document.querySelectorAll('.day-header-select').forEach(function (headerCb) {
            var date = headerCb.dataset.date;
            var checkboxes = [];

            document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
                if (!rowInFilter(row) || currentVisibleDates.indexOf(date) < 0) return;
                var cell = row.querySelector('td.day-col[data-date="' + date + '"]');
                if (!cell || cell.classList.contains('filtered-out-cell')) return;
                var cb = cell.querySelector('.day-cell-select');
                if (cb) checkboxes.push(cb);
            });

            var checkedCount = checkboxes.filter(function (cb) { return cb.checked; }).length;
            headerCb.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
            headerCb.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        });
    }

    function shortDate(iso) {
        var d = fromISO(iso);
        return String(d.getDate()).padStart(2, '0') + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
    }

    // Always shows the date range in use (as the live Feriiz does), then any other
    // filter with an x to remove it.
    function updateFilterIndicator() {
        var bar = document.getElementById('reportFilterIndicator');
        var chips = document.getElementById('filterIndicatorChips');
        if (!bar || !chips) return;

        var range = appliedRange();
        var html = '<span class="filter-indicator-chip filter-indicator-chip--range">Date Range: ' + shortDate(range.start) + ' - ' + shortDate(range.end) + '</span>';
        if (appliedReportFilters.occupations.length) {
            var occ = appliedReportFilters.occupationLabels.length ? appliedReportFilters.occupationLabels : appliedReportFilters.occupations;
            html += '<span class="filter-indicator-chip">Occupation: ' + escapeHTML(occ.join(', ')) +
                '<button class="filter-chip-close" data-filter-type="occupation" aria-label="Remove the occupation filter">&times;</button></span>';
        }
        var labels = { 'in': 'Log In', 'out': 'Log Out' };
        getSelectedMissingTypes().forEach(function (t) {
            html += '<span class="filter-indicator-chip">' + (labels[t] || t) +
                '<button class="filter-chip-close" data-filter-type="' + t + '" aria-label="Remove the ' + (labels[t] || t) + ' filter">&times;</button></span>';
        });
        if (appliedReportFilters.original) {
            html += '<span class="filter-indicator-chip">Show history' +
                '<button class="filter-chip-close" data-filter-type="original" aria-label="Show the default hours again">&times;</button></span>';
        }
        bar.style.display = '';
        chips.innerHTML = html;

        chips.querySelectorAll('.filter-chip-close').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var type = btn.dataset.filterType;
                if (type === 'original') {
                    appliedReportFilters.original = false;
                    var originalBox = document.getElementById('filterOriginal');
                    if (originalBox) originalBox.checked = false;
                    showDays(currentVisibleDates.slice(), true);
                } else if (type === 'occupation') {
                    if (window.FeriizFilters && window.FeriizFilters.resetOccupationFilter) window.FeriizFilters.resetOccupationFilter(document);
                    appliedReportFilters.occupations = [];
                    appliedReportFilters.occupationLabels = [];
                } else {
                    document.querySelectorAll('.filter-missing').forEach(function (cb) {
                        if (cb.value === type) cb.checked = false;
                    });
                    appliedReportFilters.missingTypes = appliedReportFilters.missingTypes.filter(function (item) {
                        return item !== type;
                    });
                }
                applyReportFilters();
            });
        });
    }

    function deselectAllCells() {
        document.querySelectorAll('.day-cell-select').forEach(function (cb) { cb.checked = false; });
        document.querySelectorAll('.day-header-select').forEach(function (cb) {
            cb.checked = false;
            cb.indeterminate = false;
        });
        document.querySelectorAll('.report-table td.day-col').forEach(function (cell) {
            cell.classList.remove('cell-selected');
        });
        var dropdown = document.getElementById('batchUpdateDropdown');
        if (dropdown) dropdown.classList.remove('show');
        updateCellSelectionUI();
    }

    /* =============================================
       BATCH UPDATE MODAL
       ============================================= */
    var activeAction = 'add';

    // Add Log asks for the log in and the log out at once (Baldy, 04-11-2026). A time sets that log:
    // a missing one is added, an existing one replaced (Baldy, 05-11-2026: a custom log, "dari jam
    // 07:00 ke jam 08:00", is done here; the original stays in the History). An empty time keeps
    // that log as it is. A time starts at the project's working hours (meeting 1:28) only when
    // every ticked day is missing that log, so a real log is never replaced by accident.
    function prefillAddLog(cells) {
        var inInput = document.getElementById('batchUpdateIn');
        var outInput = document.getElementById('batchUpdateOut');
        var start = ((projectContext && projectContext.workStart) || '08:00') + ':00';
        var end = ((projectContext && projectContext.workEnd) || '17:00') + ':00';
        var states = cells.map(function (cell) { return dayState(cell.closest('tr').dataset.employeeCode, cell.dataset.date); });
        if (inInput) inInput.value = states.every(function (s) { return !s.inTime; }) ? start : '';
        if (outInput) outInput.value = states.every(function (s) { return !s.outTime; }) ? end : '';
        var hint = document.getElementById('batchUpdateHint');
        if (hint) hint.textContent = 'A time you set replaces the log a day already has (the original stays in the History); an empty time keeps it. Working time: ' + start + ' - ' + end + '.';
    }

    // "08:00" from a time field reads as "08:00:00", like the machine's logs.
    function clockValue(v) { return /^\d{2}:\d{2}$/.test(v) ? v + ':00' : v; }

    function showBatchModal(action) {
        var selected = getSelectedCells();
        if (selected.length === 0) {
            if (window.FeriizNotify) FeriizNotify.warning('Select at least one report cell first.', 'No log selected');
            return;
        }
        activeAction = action;

        // Close dropdown
        var dd = document.getElementById('batchUpdateDropdown');
        if (dd) dd.classList.remove('show');

        // Delete actions go to confirmation modal
        if (action === 'delete') {
            var hasLogs = selected.some(function (cell) {
                return (cell.dataset.inTime && cell.dataset.inTime.trim() !== '') ||
                       (cell.dataset.outTime && cell.dataset.outTime.trim() !== '');
            });
            if (!hasLogs) {
                if (window.FeriizNotify) FeriizNotify.warning('The selected cells do not contain a log to delete.', 'No log found');
                return;
            }
            showDeleteConfirm(action, selected);
            return;
        }

        // Add Log modal
        var modal = document.getElementById('batchUpdateModal');
        var title = document.getElementById('batchUpdateTitle');
        var note = document.getElementById('batchUpdateNote');
        var cellSum = document.getElementById('batchSelectedSummary');
        var empSum = document.getElementById('batchEmployeeSummary');

        if (title) title.textContent = 'Add Log';
        prefillAddLog(selected);
        if (note) note.value = '';
        if (cellSum) cellSum.textContent = selected.length + ' log';
        if (empSum) empSum.textContent = getAffectedEmployeeCount() + ' employee';
        if (modal) modal.classList.add('show');
    }

    function showDeleteConfirm(action, selected) {
        var modal = document.getElementById('deleteConfirmModal');
        var title = document.getElementById('deleteConfirmTitle');
        var msg = document.getElementById('deleteConfirmMessage');
        var cellSum = document.getElementById('deleteSelectedSummary');
        var empSum = document.getElementById('deleteEmployeeSummary');

        if (title) title.textContent = 'Delete Log';
        if (msg) msg.textContent = 'Are you sure you want to delete the selected log? This action cannot be undone.';
        if (cellSum) cellSum.textContent = selected.length + ' log';
        if (empSum) empSum.textContent = getAffectedEmployeeCount() + ' employee';
        if (modal) modal.classList.add('show');
    }

    function closeDeleteConfirm() {
        var modal = document.getElementById('deleteConfirmModal');
        if (modal) modal.classList.remove('show');
    }

    function closeBatchModal() {
        var modal = document.getElementById('batchUpdateModal');
        if (modal) modal.classList.remove('show');
    }

    function formatLogNoteDate(value) {
        if (!value) return '-';
        var parts = value.split('-').map(Number);
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function openLogNote(cell, type) {
        if (!cell) return;
        var row = cell.closest('tr');
        var note = type === 'in' ? cell.dataset.inNote : cell.dataset.outNote;
        var clock = type === 'in' ? cell.dataset.inTime : cell.dataset.outTime;
        var modal = document.getElementById('logNoteModal');
        if (!modal || !note) return;

        document.getElementById('logNoteEmployee').textContent = row ? (row.dataset.employeeName || '-') : '-';
        document.getElementById('logNoteDate').textContent = formatLogNoteDate(cell.dataset.date);
        document.getElementById('logNoteType').textContent = type === 'in' ? 'Log In' : 'Log Out';
        document.getElementById('logNoteClock').textContent = clock || '-';
        document.getElementById('logNoteText').textContent = note;
        modal.classList.add('show');
    }

    function closeLogNote() {
        var modal = document.getElementById('logNoteModal');
        if (modal) modal.classList.remove('show');
    }

    function getBatchDateSummary(cells) {
        var dates = Array.from(new Set(cells.map(function (cell) { return cell.dataset.date; }).filter(Boolean)));
        if (dates.length !== 1) return dates.length + ' selected dates';

        var parts = dates[0].split('-').map(Number);
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    // Add Log and Delete Log are changes like an import (Baldy, 05-11-2026: "dia kaya mengubah
    // juga"): each Save is one version in the History of the ticked days, and the newest version
    // is what a day shows. The table is drawn again from the versions.
    function applyBatchUpdate() {
        var inInput = document.getElementById('batchUpdateIn');
        var outInput = document.getElementById('batchUpdateOut');
        var inValue = inInput ? clockValue(inInput.value) : '';
        var outValue = outInput ? clockValue(outInput.value) : '';
        var noteInput = document.getElementById('batchUpdateNote');
        var noteValue = noteInput ? noteInput.value.trim() : '';
        var selectedCells = getSelectedCells();
        var dateSummary = getBatchDateSummary(selectedCells);
        var isAdd = activeAction === 'add';
        var updated = 0;
        var addedIns = 0, addedOuts = 0, replaced = 0, kept = 0;
        var people = {};

        if (selectedCells.length === 0) {
            if (window.FeriizNotify) FeriizNotify.warning('Select at least one report cell first.', 'No log selected');
            return;
        }
        if (isAdd && !inValue && !outValue) {
            if (inInput) inInput.focus();
            if (window.FeriizNotify) FeriizNotify.warning('Set a log in or a log out time before saving.', 'Log not saved');
            return;
        }

        // Who changed the days and when, for their History.
        var account = currentAccount();
        var version = { id: (isAdd ? 'ADD-' : 'DEL-') + Date.now().toString(36).toUpperCase(), kind: isAdd ? 'add' : 'delete',
                        at: new Date().toISOString(), by: account.name, role: account.role, note: isAdd ? noteValue : '', cells: {} };

        selectedCells.forEach(function (cell) {
            var code = cell.closest('tr').dataset.employeeCode;
            var date = cell.dataset.date;
            var s = dayState(code, date);
            if (isAdd) {
                // Each time set adds that log or replaces it; the machine's original stays in the
                // History and in Show history (Arcon: machine times are never lost).
                var setIn = Boolean(inValue && inValue !== s.inTime);
                var setOut = Boolean(outValue && outValue !== s.outTime);
                if (!setIn && !setOut) {
                    kept++;
                    return;
                }
                var added = {};
                if (setIn) { added.inTime = inValue; addedIns++; if (s.inTime) replaced++; }
                if (setOut) { added.outTime = outValue; addedOuts++; if (s.outTime) replaced++; }
                version.cells[code + '|' + date] = added;
            } else {
                if (!s.inTime && !s.outTime) return;
                version.cells[code + '|' + date] = {};
            }
            people[code] = true;
            updated++;
        });

        closeBatchModal();
        deselectAllCells();
        if (updated) {
            projectImports().batches.push(version);
            saveImports();
            syncDataFilter();
            showDays(currentVisibleDates.slice(), true);
            applyReportFilters();
        }
        if (!window.FeriizNotify) return;
        if (isAdd && !updated) {
            FeriizNotify.info('The ticked days already have these times, so nothing was changed.', 'Nothing to change');
            return;
        }
        if (!updated) return;
        var count = Object.keys(people).length;
        var who = count + (count === 1 ? ' employee' : ' employees');
        if (isAdd) {
            var added = [addedIns ? addedIns + ' log in' : '', addedOuts ? addedOuts + ' log out' : ''].filter(Boolean).join(' and ');
            FeriizNotify.success(added + ' set for ' + who + ' on ' + dateSummary + '.' +
                (replaced === 1 ? ' 1 replaced a log the day had; the original stays in the History.'
                    : replaced ? ' ' + replaced + ' replaced logs the days had; the originals stay in the History.' : '') +
                (noteValue ? ' A note was attached to each new log.' : '') +
                (kept === 1 ? ' 1 day already had these times.' : kept ? ' ' + kept + ' days already had these times.' : '') +
                ' The changed days are blue.', 'Log added');
        } else {
            FeriizNotify.success('The logs of ' + updated + (updated === 1 ? ' day' : ' days') + ' (' + who + ') on ' + dateSummary + ' were deleted. The changed days are blue.', 'Log deleted');
        }
    }

    /* =============================================
       FIELDS TOGGLE
       ============================================= */
    var colMap = {
        colActiveHour: ['.col-activehour'],
        colInOutHour: ['.col-inouthour'],
        colEmpDailyRate: ['.col-emp-dailyrate'],
        colEmpRateOvertime: ['.col-emp-rateovertime'],
        colEmpTotalRate: ['.col-emp-totalrate'],
        colEmpTotalOvertime: ['.col-emp-totalovertime'],
        colClientDailyRate: ['.col-cli-dailyrate'],
        colClientRateOvertime: ['.col-cli-rateovertime'],
        colClientTotalRate: ['.col-cli-totalrate'],
        colClientTotalOvertime: ['.col-cli-totalovertime']
    };
    var masterGroups = {
        colEmployee: ['colEmpDailyRate', 'colEmpRateOvertime', 'colEmpTotalRate', 'colEmpTotalOvertime'],
        colClient: ['colClientDailyRate', 'colClientRateOvertime', 'colClientTotalRate', 'colClientTotalOvertime']
    };
    var groupHeaders = {
        grpTimePeriod: ['.col-inouthour', '.col-activehour'],
        grpEmployee: ['.col-emp-dailyrate', '.col-emp-rateovertime', '.col-emp-totalrate', '.col-emp-totalovertime'],
        grpClient: ['.col-cli-dailyrate', '.col-cli-rateovertime', '.col-cli-totalrate', '.col-cli-totalovertime', '.col-cli-add', '.col-cli-addtotal']
    };

    // Ticked, unticked or partly ticked, from the columns under it.
    function syncMasterState(mId) {
        var mCb = document.getElementById(mId);
        if (!mCb) return;
        var slaves = masterGroups[mId].map(function (id) { return document.getElementById(id); }).filter(Boolean);
        var on = slaves.filter(function (cb) { return cb.checked; }).length;
        mCb.checked = slaves.length > 0 && on === slaves.length;
        mCb.indeterminate = on > 0 && on < slaves.length;
    }

    function updateFieldsVisibility() {
        Object.keys(colMap).forEach(function (id) {
            var cb = document.getElementById(id);
            if (!cb) return;
            colMap[id].forEach(function (cls) {
                document.querySelectorAll(cls).forEach(function (el) {
                    el.classList.toggle('day-col-hidden', !cb.checked);
                });
            });
        });
        Object.keys(groupHeaders).forEach(function (hId) {
            var th = document.getElementById(hId);
            if (!th) return;
            var firstRow = document.querySelector('.report-table tbody tr');
            if (!firstRow) return;
            var count = 0;
            groupHeaders[hId].forEach(function (cls) {
                firstRow.querySelectorAll(cls).forEach(function (c) {
                    if (!c.classList.contains('day-col-hidden')) count++;
                });
            });
            if (count > 0) { th.colSpan = count; th.classList.remove('day-col-hidden'); }
            else { th.classList.add('day-col-hidden'); }
        });
    }

    /* =============================================
       PERIOD PRESETS
       ============================================= */
    function initPeriodPresets() {
        var ps = document.querySelector('.filter-period');
        var di = document.querySelectorAll('.filter-date');
        if (!ps || di.length < 2) return;
        ps.addEventListener('change', function () {
            var v = this.value, today = reportToday, s = '', e = '';
            var monthStart = today.slice(0, 8) + '01';
            if (v === 'today') { s = e = today; }
            else if (v === 'yesterday') { s = e = addDays(today, -1); }
            else if (v === 'this_week') { s = sundayOf(today); e = today; }
            else if (v === 'last_week') { s = addDays(sundayOf(today), -7); e = addDays(s, 6); }
            else if (v === 'this_month') { s = monthStart; e = today; }
            else if (v === 'last_month') { e = addDays(monthStart, -1); s = e.slice(0, 8) + '01'; }
            else if (v === 'this_year') { s = today.slice(0, 4) + '-01-01'; e = today; }
            else if (v === 'all_time') { s = dataStart || ''; e = today; }
            else return; // Custom: leave the dates as typed
            di[0].value = s; di[1].value = e;
        });
        // Typing a date by hand turns the period into Custom (as in the old Feriiz).
        di.forEach(function (input) {
            input.addEventListener('input', function () { ps.value = 'custom'; });
        });
    }

    // The date fields show the range in use, so "This Week" is visible as real dates.
    function resetDateDraft() {
        var range = defaultRange();
        var di = document.querySelectorAll('.filter-date');
        var ps = document.querySelector('.filter-period');
        if (di.length >= 2) { di[0].value = range.start; di[1].value = range.end; }
        if (ps) ps.value = 'this_week';
    }

    function datesFromDraft() {
        var di = document.querySelectorAll('.filter-date');
        var s = di[0] ? di[0].value : '';
        var e = di[1] ? di[1].value : '';
        if (!s && !e) return datesInRange();
        if (s && e && s > e) { var t = s; s = e; e = t; }
        var dates = datesInRange(s || e, e || s);
        if (dates.length === 0 && window.FeriizNotify) {
            FeriizNotify.info('There is no attendance for these days yet. Only days up to today are shown.', 'Nothing to show yet');
        }
        return dates;
    }

    /* =============================================
       INIT
       ============================================= */
    /* =============================================
       IMPORT XLSX
       One dialog with the two steps of the live Feriiz (Baldy, 05-11-2026: the button and the
       dialog of the first design, as dev still has them):
       - Download template: the period as an Excel to fill in, one row per person with
         Daily (1, 0.5 or 0) and Overtime (hours) under every date, then the rates.
       - Import file: that file back. Its numbers become the newest version of those days
         (Feriiz team, 27-10-2026); with Show history each changed day shows the import on
         the left and the original on the right (04-11-2026). What the file changes is shown
         before anything is replaced.
       The Excel library (SheetJS) loads the first time it is needed.
       ============================================= */
    var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    var IMPORT_TYPES = ['.xlsx', '.xls'];
    var IMPORT_MAX = 5 * 1024 * 1024;
    var IMPORT_LIST_MAX = 200;   // rows listed in the preview; the counts cover everything
    var xlsxLoading = null;
    var importModal = null;
    var importPlan = null;

    function loadXLSX() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        if (!xlsxLoading) {
            xlsxLoading = new Promise(function (resolve, reject) {
                var s = document.createElement('script');
                s.src = XLSX_URL;
                s.onload = function () { if (window.XLSX) resolve(window.XLSX); else reject(new Error('XLSX missing')); };
                s.onerror = function () { xlsxLoading = null; s.remove(); reject(new Error('XLSX failed to load')); };
                document.head.appendChild(s);
            });
        }
        return xlsxLoading;
    }

    function importSize(bytes) {
        return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

    // 2026-10-26 -> "26/10/2026", the date titles of the live Feriiz file.
    function slashDate(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

    // "261026_261027_MENARA-KUNINGAN-PHASE-2_FOR_IMPORT.xlsx", named like the live Feriiz file.
    function logFileName(dates) {
        function yymmdd(iso) { return iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10); }
        var name = String((projectContext && projectContext.name) || 'Report').toUpperCase().trim()
            .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
        return yymmdd(dates[0]) + '_' + yymmdd(dates[dates.length - 1]) + '_' + name + '_FOR_IMPORT.xlsx';
    }

    // One person's row of the template: the person, then Daily and Overtime of every day (what
    // the table shows now, imported days included), then the rates.
    function templateLine(p, i, dates) {
        var emp = p.emp;
        var row = p.row;
        // A person's own working hours (employee form), else the project's, and the Time
        // Period (the Default Hours, else the Working Time's length).
        var workTime = workTimeOf(row.dataset.employeeCode);
        var hours = periodOf(row.dataset.employeeCode);
        var line = [i + 1, row.dataset.employeeCode, emp.pin ? String(emp.pin) : null, p.first,
                    emp.occupation || null, workTime.start, workTime.end, round2(hours)];
        dates.forEach(function (d) {
            var cell = row.querySelector('td.day-col[data-date="' + d + '"]');
            var daily = cell && !cell.classList.contains('weekend-off-cell') ? Number(cell.dataset.daily) || 0 : 0;
            line.push(daily, round2(cell ? cell.dataset.otTotal : 0));
        });
        line.push(Number(row.dataset.dailyRate) || 0, Number(row.dataset.otRate) || 0,
                  Number(row.dataset.clientDailyRate) || 0, Number(row.dataset.clientOtRate) || 0);
        return line;
    }

    // Loading in the Import dialog, as on the live Feriiz (Baldy, 05-11-2026: every download from
    // the system shows its loading): "Fetching reports (100/134) - 75%" over a striped bar. It
    // stays at least a moment, so it never just flashes.
    var LOADING_MIN = 800;   // ms
    var downloading = false;

    function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function showProgress(label, done, total) {
        if (!importModal) return;
        var pct = total ? Math.round(done / total * 100) : 0;
        importModal.querySelector('#importProgress').hidden = false;
        importModal.querySelector('#importProgressLabel').textContent = label + ' (' + done + '/' + total + ') - ' + pct + '%';
        importModal.querySelector('#importProgressBar').style.width = pct + '%';
        importModal.querySelector('#importProgress .progress').setAttribute('aria-valuenow', pct);
        importModal.querySelector('#importTemplate').disabled = true;
    }

    function hideProgress() {
        if (!importModal) return;
        importModal.querySelector('#importProgress').hidden = true;
        importModal.querySelector('#importTemplate').disabled = false;
    }

    // The same file as the old Feriiz export (checked cell by cell against its
    // 261026_261029 file, 29-10-2026): one plain "Sheet1" with no widths or styles, every
    // person in the project (search and filters do not matter) sorted by first name,
    // empty cells left empty. The days hold what the table shows now (imported days
    // included), so the file imports back unchanged. It is built one person at a time, so the
    // dialog can show how far it is.
    function downloadLog() {
        var dates = currentVisibleDates.slice();
        var rows = Array.prototype.slice.call(document.querySelectorAll('.report-table tbody tr[data-employee-code]'));
        if (!dates.length || !rows.length) {
            if (window.FeriizNotify) FeriizNotify.warning('This project has nobody in the Report for these days.', 'Nothing to download');
            return;
        }
        if (downloading) return;
        downloading = true;
        var started = Date.now();
        showProgress('Fetching reports', 0, rows.length);
        loadXLSX().then(function (XLSX) {
            var byCode = {};
            reportEmployees.forEach(function (e) { byCode[e.code] = e; });
            var people = rows.map(function (row) {
                var emp = byCode[row.dataset.employeeCode] || {};
                var first = emp.firstName || String(emp.name || row.dataset.employeeName || '').trim().split(/\s+/)[0];
                return { row: row, emp: emp, first: first };
            }).sort(function (a, b) {
                return a.first.localeCompare(b.first, undefined, { sensitivity: 'base' }) ||
                    String(a.emp.name || '').localeCompare(String(b.emp.name || ''), undefined, { sensitivity: 'base' });
            });
            var head = ['No', 'Code', 'Pin', 'First Name', 'Occupation', 'Time Start', 'Time End', 'Period'];
            var sub = [null, null, null, null, null, null, null, null];
            dates.forEach(function (d) { head.push(slashDate(d), slashDate(d)); sub.push('Daily', 'Overtime'); });
            // Titles exactly as in the old Feriiz file ("Employe" included), so the two files match.
            head.push('Employee', 'Employe Overtime', 'Client', 'Client Overtime');
            sub.push('Rate Daily', 'Rate Overtime', 'Rate Daily', 'Rate Overtime');
            var aoa = [head, sub];
            var i = 0;
            return new Promise(function (resolve) {
                (function next() {
                    for (var end = Math.min(people.length, i + 5); i < end; i++) aoa.push(templateLine(people[i], i, dates));
                    showProgress('Fetching reports', i, people.length);
                    if (i < people.length) setTimeout(next, 16);
                    else wait(Math.max(0, LOADING_MIN - (Date.now() - started))).then(resolve);
                })();
            }).then(function () {
                var ws = XLSX.utils.aoa_to_sheet(aoa);
                var wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
                var name = logFileName(dates);
                XLSX.writeFile(wb, name);
                if (window.FeriizNotify) {
                    FeriizNotify.success('Fill in Daily (1, 0.5 or 0) and Overtime (hours) for each day, then bring it back with Import XLSX.', name + ' downloaded');
                }
            });
        }).catch(function () {
            if (window.FeriizNotify) FeriizNotify.error('The Excel tool could not be loaded. Check the internet connection and try again.', 'Download failed');
        }).then(function () {
            downloading = false;
            hideProgress();
        });
    }

    /* ---------- Reading an imported file ---------- */
    function headKey(v) { return String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, ''); }

    // A column title as a date: "26/10/2026", "2026-10-26", or an Excel date number.
    function headDate(v) {
        if (typeof v === 'number' && v > 20000 && v < 80000) {
            return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
        }
        var s = String(v == null ? '' : v).trim();
        var m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
        if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    }

    // null = left empty, NaN = not a number. "1,5" counts as 1.5.
    function cellNumber(v) {
        if (v === '' || v == null) return null;
        if (typeof v === 'number') return v;
        var s = String(v).trim().replace(/\s/g, '').replace(',', '.');
        if (!s) return null;
        var n = Number(s);
        return Number.isFinite(n) ? n : NaN;
    }

    // "08:00:00" from "8:00", "08:00:00", or an Excel time (a fraction of a day); '' otherwise.
    function clockText(v) {
        if (typeof v === 'number' && v >= 0 && v < 1) {
            var s = Math.round(v * 86400);
            return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
        }
        var m = String(v == null ? '' : v).trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/);
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] || 0) > 59) return '';
        return m[1].padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00');
    }

    // Rates may be typed as "150.000".
    function rateNumber(v) {
        if (typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(v.trim())) v = v.trim().replace(/\./g, '');
        return cellNumber(v);
    }

    // The Download Log layout: titles in row 1, "Daily" / "Overtime" under each date in row 2.
    function readLogSheet(aoa) {
        var head = aoa[0] || [], sub = aoa[1] || [];
        var col = { code: -1, pin: -1, name: -1, start: -1, end: -1, period: -1 }, days = [], rates = {};
        head.forEach(function (h, i) {
            var k = headKey(h), s = headKey(sub[i]), date = headDate(h);
            if (k === 'code') col.code = i;
            else if (k === 'pin') col.pin = i;
            else if (k === 'firstname' || k === 'name') col.name = i;
            else if (k === 'timestart') col.start = i;
            else if (k === 'timeend') col.end = i;
            else if (k === 'period') col.period = i;
            else if (date && (s === 'daily' || s === 'overtime')) {
                var day = days.filter(function (x) { return x.date === date; })[0];
                if (!day) days.push(day = { date: date, daily: -1, ot: -1 });
                if (s === 'daily') day.daily = i; else day.ot = i;
            }
            else if (k === 'employee') rates.daily = i;
            else if (k === 'employeovertime' || k === 'employeeovertime') rates.ot = i;
            else if (k === 'client') rates.clientDaily = i;
            else if (k === 'clientovertime') rates.clientOt = i;
        });
        return { col: col, days: days.filter(function (d) { return d.daily >= 0; }), rates: rates, rows: aoa.slice(2) };
    }

    // What the import would do, compared with what the Report uses now (an earlier import, else the system).
    function buildImportPlan(sheet, fileName) {
        var plan = { file: fileName, dates: [], people: 0, cells: [], rates: [], changed: [], rateChanges: [], same: 0, problems: [] };
        if (sheet.col.code < 0 || !sheet.days.length) { plan.fatal = true; return plan; }
        plan.dates = sheet.days.map(function (d) { return d.date; }).sort();
        var byCode = {}, byPin = {};
        reportEmployees.forEach(function (e) {
            byCode[String(e.code).toUpperCase()] = e;
            if (e.pin) byPin[String(e.pin)] = e;
        });
        sheet.rows.forEach(function (r, idx) {
            var line = idx + 3;   // the row number in Excel
            var code = String(r[sheet.col.code] == null ? '' : r[sheet.col.code]).trim();
            var pin = sheet.col.pin >= 0 ? String(r[sheet.col.pin] == null ? '' : r[sheet.col.pin]).trim() : '';
            if (!code && !pin) return;
            var who = (sheet.col.name >= 0 && r[sheet.col.name] ? String(r[sheet.col.name]) + ' · ' : '') + (code || 'Pin ' + pin);
            var emp = byCode[code.toUpperCase()] || (pin && byPin[pin]);
            if (!emp) { plan.problems.push({ line: line, who: who, why: 'Not in this report' }); return; }
            plan.people++;
            // The person's working day in the file: its Period is the hours of a Daily 1.
            var start = sheet.col.start >= 0 ? clockText(r[sheet.col.start]) : '';
            var end = sheet.col.end >= 0 ? clockText(r[sheet.col.end]) : '';
            var period = sheet.col.period >= 0 ? cellNumber(r[sheet.col.period]) : null;
            if (!(period > 0 && period <= 24)) period = null;
            sheet.days.forEach(function (d) {
                var daily = cellNumber(r[d.daily]);
                var ot = d.ot >= 0 ? cellNumber(r[d.ot]) : null;
                if (daily === null && ot === null) return;   // left empty: that day stays as it is
                var on = ' on ' + shortDate(d.date);
                // 0.5 = half a day: dev's Download Log writes it for a day with only one log (04-11-2026).
                if (daily !== 0 && daily !== 0.5 && daily !== 1) { plan.problems.push({ line: line, who: emp.name, why: 'Daily' + on + ' must be 1, 0.5 or 0' }); return; }
                if (ot === null) ot = 0;
                if (!(ot >= 0 && ot <= 24)) { plan.problems.push({ line: line, who: emp.name, why: 'Overtime' + on + ' must be hours between 0 and 24' }); return; }
                var key = emp.code + '|' + d.date;
                var now = stateCount(emp, d.date, dayState(emp.code, d.date));
                var next = { daily: daily, ot: round2(ot) };
                plan.cells.push({ key: key, daily: next.daily, ot: next.ot, start: start, end: end, period: period });
                if (differs(now, next)) plan.changed.push({ name: emp.name, date: d.date, now: now, next: next });
                else plan.same++;
            });
            var rate = {}, bad = false;
            Object.keys(sheet.rates).forEach(function (k) {
                var v = rateNumber(r[sheet.rates[k]]);
                if (v === null) return;
                if (!(v >= 0)) { bad = true; return; }
                rate[k] = Math.round(v);
            });
            if (bad) plan.problems.push({ line: line, who: emp.name, why: 'A rate is not a number, so the rates were left as they are' });
            else if (Object.keys(rate).length) {
                var was = ratesFor(emp);
                var diff = Object.keys(rate).filter(function (k) { return rate[k] !== was[k]; });
                plan.rates.push({ code: emp.code, rate: rate });
                diff.forEach(function (k) { plan.rateChanges.push({ name: emp.name, label: RATE_LABELS[k], from: was[k], to: rate[k] }); });
            }
        });
        return plan;
    }

    // An import is the newest version of its days; the earlier ones stay in the History.
    function commitImport(plan) {
        var stored = projectImports();
        var at = new Date().toISOString();
        var account = currentAccount();
        var batch = { id: 'IMP-' + Date.now().toString(36).toUpperCase(), kind: 'import', file: plan.file, at: at, by: account.name, role: account.role, cells: {} };
        plan.cells.forEach(function (c) {
            batch.cells[c.key] = { daily: c.daily, ot: c.ot, start: c.start, end: c.end, period: c.period };
        });
        stored.batches.push(batch);
        plan.rates.forEach(function (r) {
            var merged = stored.rates[r.code] || {};
            Object.keys(r.rate).forEach(function (k) { merged[k] = r.rate[k]; });
            merged.file = plan.file;
            merged.at = at;
            stored.rates[r.code] = merged;
        });
        saveImports();
        syncDataFilter();
        // The import next to the original logs, to check it (Baldy, 02-11-2026); removing
        // Show history goes back to the default.
        appliedReportFilters.original = true;
        var originalBox = document.getElementById('filterOriginal');
        if (originalBox) originalBox.checked = true;
        deselectAllCells();
        showDays(currentVisibleDates.slice(), true);
        applyReportFilters();
    }

    // Show history has something to show once a day has a change (an import, Add Log or Delete Log).
    function originalAvailable() { return hasImports(); }

    function syncDataFilter() {
        var block = document.getElementById('reportDataFilter');
        if (!block) return;
        block.hidden = !originalAvailable();
        if (window.bootstrap && window.bootstrap.Tooltip) {
            block.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) { window.bootstrap.Tooltip.getOrCreateInstance(el); });
        }
    }

    /* ---------- The Import attendance dialog (Baldy, 05-11-2026: the first design again, as on
       dev): choose the file, see what it changes, Import file. Download template gives this
       period's own file to fill in. ---------- */
    function importStep(step) {
        importModal.querySelector('#importStepLoading').hidden = step !== 'loading';
        importModal.querySelector('#importStepPreview').hidden = step !== 'preview';
        importModal.querySelector('#importSubmit').disabled = !(step === 'preview' && importPlan && importPlan.cells.length);
    }

    function importError(message) {
        var box = importModal.querySelector('#importError');
        box.textContent = message || '';
        box.hidden = !message;
    }

    function previewTable(heads, rows) {
        return '<div class="import-table-wrap"><table class="data-table import-table"><thead><tr>' +
            heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
            rows.slice(0, IMPORT_LIST_MAX).join('') + '</tbody></table></div>' +
            (rows.length > IMPORT_LIST_MAX ? '<p class="form-text">And ' + (rows.length - IMPORT_LIST_MAX) + ' more.</p>' : '');
    }

    function renderImportPreview(plan) {
        var first = plan.dates[0], last = plan.dates[plan.dates.length - 1];
        var html = '<p class="import-file-meta">' + shortDate(first) + (last !== first ? ' – ' + shortDate(last) : '') + ' · ' +
                plan.people + (plan.people === 1 ? ' person' : ' people') + '</p>' +
            '<div class="import-counts">' +
                '<span class="import-count' + (plan.changed.length ? ' is-changed' : '') + '"><strong>' + plan.changed.length + '</strong> changed</span>' +
                '<span class="import-count"><strong>' + plan.same + '</strong> same as now</span>' +
                (plan.rateChanges.length ? '<span class="import-count is-changed"><strong>' + plan.rateChanges.length + '</strong> rate ' +
                    (plan.rateChanges.length === 1 ? 'change' : 'changes') + '</span>' : '') +
                (plan.problems.length ? '<span class="import-count is-problem"><strong>' + plan.problems.length + '</strong> not imported</span>' : '') +
            '</div>';
        if (!plan.cells.length) {
            html += '<div class="import-empty">Nothing in this file can be imported. ' +
                (plan.problems.length ? 'See why below.' : 'Every Daily and Overtime cell is empty.') + '</div>';
        }
        if (plan.changed.length) {
            html += '<h3 class="import-section-title">Changes</h3>' + previewTable(['Name', 'Date', 'Now', 'After import'], plan.changed.map(function (c) {
                return '<tr><td>' + escapeHTML(c.name) + '</td><td class="tpl-nowrap">' + shortDate(c.date) + '</td>' +
                    '<td>' + escapeHTML(dayText(c.now)) + '</td><td class="import-new">' + escapeHTML(dayText(c.next)) + '</td></tr>';
            }));
        }
        if (plan.rateChanges.length) {
            html += '<h3 class="import-section-title">Rates</h3>' + previewTable(['Name', 'Rate', 'Now', 'After import'], plan.rateChanges.map(function (c) {
                return '<tr><td>' + escapeHTML(c.name) + '</td><td>' + c.label + '</td><td>' + formatIDR(c.from) + '</td><td class="import-new">' + formatIDR(c.to) + '</td></tr>';
            }));
        }
        if (plan.problems.length) {
            html += '<h3 class="import-section-title">Not imported</h3>' + previewTable(['Row', 'Who', 'Why'], plan.problems.map(function (p) {
                return '<tr><td>' + p.line + '</td><td>' + escapeHTML(p.who) + '</td><td>' + escapeHTML(p.why) + '</td></tr>';
            }));
        }
        if (plan.cells.length) {
            html += '<p class="import-keep"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
                'A day the file raises to Daily 1 takes the working time as its log in and log out; the other days keep their logs. Set other times with Add Log. A day the import changes turns blue.</p>';
        }
        importModal.querySelector('#importStepPreview').innerHTML = html;
    }

    var readToken = 0;

    function readImportFile(file) {
        var token = ++readToken;
        importError('');
        importPlan = null;
        if (!file) { importStep('choose'); return; }
        var ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (IMPORT_TYPES.indexOf(ext) < 0) {
            importStep('choose');
            importError(file.name + ' is not an Excel file. Choose the .xlsx from Download template.');
            return;
        }
        if (file.size > IMPORT_MAX) {
            importStep('choose');
            importError(file.name + ' is ' + importSize(file.size) + '. The limit is 5 MB.');
            return;
        }
        importModal.querySelector('#importLoadingName').textContent = file.name;
        importStep('loading');
        Promise.all([loadXLSX(), file.arrayBuffer(), wait(LOADING_MIN)]).then(function (res) {
            if (token !== readToken) return;
            var XLSX = res[0];
            var wb = XLSX.read(res[1], { type: 'array' });
            var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
            var plan = buildImportPlan(readLogSheet(aoa), file.name);
            if (plan.fatal) {
                importStep('choose');
                importError(file.name + ' does not look like a Feriiz file: it has no Code column or no Daily/Overtime dates. ' +
                    'Fill in the file from Download template and choose that one.');
                return;
            }
            importPlan = plan;
            renderImportPreview(plan);
            importStep('preview');
        }).catch(function () {
            if (token !== readToken) return;
            importStep('choose');
            importError(file.name + ' could not be read. Save it again as .xlsx, or check the internet connection (the Excel tool loads online).');
        });
    }

    function buildImportModal() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'importModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'importModalTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable import-dialog">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<h2 class="modal-title" id="importModalTitle">Import attendance</h2>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<p class="import-intro">Change Daily and Overtime for many employees at once from a spreadsheet. ' +
                            'Use the Feriiz template so every column is read correctly.</p>' +
                        '<div class="import-file-box">' +
                            '<label class="import-file-label" for="importInput">Choose attendance file</label>' +
                            '<span class="import-file-hint">.xlsx, up to 5 MB</span>' +
                            '<input type="file" class="form-control" id="importInput" accept="' + IMPORT_TYPES.join(',') + '">' +
                        '</div>' +
                        '<div class="import-error" id="importError" role="alert" hidden></div>' +
                        '<div class="import-progress" id="importStepLoading" role="status" hidden>' +
                            '<div class="import-progress-label">Reading <span id="importLoadingName"></span>…</div>' +
                            '<div class="progress"><div class="progress-bar progress-bar-striped progress-bar-animated w-100"></div></div>' +
                        '</div>' +
                        '<div id="importStepPreview" hidden></div>' +
                        '<button type="button" class="btn btn-outline-primary w-100 import-template-btn" id="importTemplate">' +
                            '<i class="fa-solid fa-download" aria-hidden="true"></i> Download template (.xlsx)</button>' +
                        '<div class="import-progress" id="importProgress" role="status" hidden>' +
                            '<div class="import-progress-label" id="importProgressLabel"></div>' +
                            '<div class="progress" role="progressbar" aria-label="Download template" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
                                '<div class="progress-bar progress-bar-striped progress-bar-animated" id="importProgressBar"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline" data-bs-dismiss="modal">Cancel</button>' +
                        '<button type="button" class="btn btn-primary" id="importSubmit" disabled>Import file</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);

        var input = el.querySelector('#importInput');
        input.addEventListener('change', function () { readImportFile(input.files[0]); });
        el.querySelector('#importTemplate').addEventListener('click', downloadLog);
        el.querySelector('#importSubmit').addEventListener('click', function () {
            var plan = importPlan;
            if (!plan || !plan.cells.length) return;
            window.bootstrap.Modal.getInstance(el).hide();
            commitImport(plan);
            if (window.FeriizNotify) {
                FeriizNotify.success(plan.cells.length + (plan.cells.length === 1 ? ' day' : ' days') + ' for ' + plan.people + (plan.people === 1 ? ' person' : ' people') +
                    ' imported (' + plan.changed.length + ' changed). The changed days are blue, and Show history puts each next to its original. ' +
                    'The totals count the import.', 'File imported');
            }
        });
        el.addEventListener('hidden.bs.modal', function () { input.value = ''; readImportFile(null); });
        return el;
    }

    function openImportLog() {
        if (!importModal) importModal = buildImportModal();
        readImportFile(null);
        window.bootstrap.Modal.getOrCreateInstance(importModal).show();
        loadXLSX().catch(function () { /* reported when the file is read */ });
    }

    function initImport() {
        var btn = document.getElementById('reportImportBtn');
        if (btn) btn.addEventListener('click', openImportLog);
    }

    function init() {
        initPeriodPresets();
        initImport();
        // The clock button after a date opens that day's History.
        var reportHead = document.querySelector('.report-table thead');
        if (reportHead) reportHead.addEventListener('click', function (e) {
            var historyBtn = e.target.closest('.import-history-btn');
            if (!historyBtn) return;
            e.preventDefault();
            e.stopPropagation();
            openImportHistory(historyBtn.dataset.date);
        });
        syncDataFilter();
        resetDateDraft();
        showDays(datesInRange());
        updateFilterIndicator();

        // Apply filter
        var applyBtn = document.querySelector('.filter-apply-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function () {
                var wasOriginal = appliedReportFilters.original;
                var originalBox = document.getElementById('filterOriginal');
                appliedReportFilters.missingTypes = getDraftMissingTypes();
                appliedReportFilters.occupations = (window.FeriizFilters && window.FeriizFilters.getOccupationValues)
                    ? window.FeriizFilters.getOccupationValues(document)
                    : [];
                appliedReportFilters.occupationLabels = selectedOccupationLabels();
                appliedReportFilters.range = draftRange();
                appliedReportFilters.original = Boolean(originalBox && originalBox.checked && originalAvailable());
                showDays(datesFromDraft(), wasOriginal !== appliedReportFilters.original);
                applyReportFilters();
            });
        }

        // Clear filter
        var clearBtn = document.querySelector('.filter-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                var wasOriginal = appliedReportFilters.original;
                var originalBox = document.getElementById('filterOriginal');
                resetDateDraft();
                document.querySelectorAll('.filter-missing').forEach(function (i) { i.checked = false; });
                if (originalBox) originalBox.checked = false;
                if (window.FeriizFilters && window.FeriizFilters.resetOccupationFilter) window.FeriizFilters.resetOccupationFilter(document);
                appliedReportFilters.missingTypes = [];
                appliedReportFilters.occupations = [];
                appliedReportFilters.occupationLabels = [];
                appliedReportFilters.range = null;
                appliedReportFilters.original = false;
                deselectAllCells();
                showDays(datesInRange(), wasOriginal);
                applyReportFilters();
            });
        }

        // Search
        var searchInput = document.getElementById('reportSearch');
        if (searchInput) searchInput.addEventListener('input', applyReportFilters);

        // Day header select-all checkboxes (headers are re-rendered, so delegate)
        var thead = document.querySelector('.report-table thead');
        if (thead) {
            thead.addEventListener('change', function (e) {
                var headerCb = e.target;
                if (!headerCb.classList.contains('day-header-select')) return;
                var date = headerCb.dataset.date;
                // The whole date: everyone the filters show, on every page.
                document.querySelectorAll('.report-table tbody tr').forEach(function (row) {
                    if (!rowInFilter(row)) return;
                    var cell = row.querySelector('td.day-col[data-date="' + date + '"]');
                    if (!cell || cell.classList.contains('filtered-out-cell')) return;
                    var cb = cell.querySelector('.day-cell-select');
                    if (cb) cb.checked = headerCb.checked;
                });
                updateCellSelectionUI();
            });
        }

        // Cell checkbox change (event delegation)
        var tbody = document.querySelector('.report-table tbody');
        if (tbody) {
            tbody.addEventListener('change', function (e) {
                if (e.target.classList.contains('day-cell-select')) {
                    updateCellSelectionUI();
                }
            });
            tbody.addEventListener('click', function (e) {
                var noteButton = e.target.closest('.report-log-note-btn');
                if (!noteButton) return;
                e.preventDefault();
                e.stopPropagation();
                // The left half of a split day carries the system's own notes.
                openLogNote(noteButton.closest('[data-in-note]'), noteButton.dataset.logType);
            });
        }

        // Batch Update toggle
        var batchToggle = document.getElementById('batchUpdateToggle');
        var batchDD = document.getElementById('batchUpdateDropdown');
        if (batchToggle) {
            batchToggle.addEventListener('click', function (e) {
                e.stopPropagation();
                if (batchDD) batchDD.classList.toggle('show');
            });
        }
        document.addEventListener('click', function (e) {
            if (!batchDD || !batchDD.classList.contains('show')) return;
            if (batchDD.contains(e.target) || (batchToggle && batchToggle.contains(e.target))) return;
            batchDD.classList.remove('show');
        });
        if (batchDD) {
            batchDD.querySelectorAll('[data-action]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (btn.dataset.action === 'assign' || btn.dataset.action === 'unassign') {
                        batchDD.classList.remove('show');
                        if (btn.dataset.action === 'assign') openTemplateAssign();
                        else openTemplateRemove();
                        return;
                    }
                    showBatchModal(btn.dataset.action);
                });
            });
        }

        // Add Log Modal
        var closeBtn = document.getElementById('batchUpdateClose');
        var cancelBtn = document.getElementById('batchUpdateCancel');
        var saveBtn = document.getElementById('batchUpdateSave');
        var modal = document.getElementById('batchUpdateModal');
        if (closeBtn) closeBtn.addEventListener('click', closeBatchModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeBatchModal);
        if (saveBtn) saveBtn.addEventListener('click', applyBatchUpdate);
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeBatchModal(); });

        // Log note detail
        var noteModal = document.getElementById('logNoteModal');
        var noteClose = document.getElementById('logNoteClose');
        var noteDone = document.getElementById('logNoteDone');
        if (noteClose) noteClose.addEventListener('click', closeLogNote);
        if (noteDone) noteDone.addEventListener('click', closeLogNote);
        if (noteModal) noteModal.addEventListener('click', function (e) {
            if (e.target === noteModal) closeLogNote();
        });

        // Delete Confirmation Modal
        var delConfirmModal = document.getElementById('deleteConfirmModal');
        var delCloseBtn = document.getElementById('deleteConfirmClose');
        var delCancelBtn = document.getElementById('deleteConfirmCancel');
        var delYesBtn = document.getElementById('deleteConfirmYes');
        if (delCloseBtn) delCloseBtn.addEventListener('click', closeDeleteConfirm);
        if (delCancelBtn) delCancelBtn.addEventListener('click', closeDeleteConfirm);
        if (delYesBtn) delYesBtn.addEventListener('click', function () {
            closeDeleteConfirm();
            applyBatchUpdate();
        });
        if (delConfirmModal) delConfirmModal.addEventListener('click', function (e) {
            if (e.target === delConfirmModal) closeDeleteConfirm();
        });

        // Fields toggle
        Object.keys(masterGroups).forEach(function (mId) {
            var mCb = document.getElementById(mId);
            if (!mCb) return;
            var slaves = masterGroups[mId];
            mCb.addEventListener('change', function () {
                slaves.forEach(function (id) { var cb = document.getElementById(id); if (cb) cb.checked = mCb.checked; });
                mCb.indeterminate = false;
                updateFieldsVisibility();
            });
            slaves.forEach(function (id) {
                var cb = document.getElementById(id);
                if (cb) cb.addEventListener('change', function () { syncMasterState(mId); });
            });
        });
        Object.keys(colMap).forEach(function (id) {
            var cb = document.getElementById(id);
            if (cb) cb.addEventListener('change', updateFieldsVisibility);
        });
        updateFieldsVisibility();
        applyReportFilters();

        // Download dropdown
        var dlBtn = document.getElementById('downloadToggleBtn');
        if (dlBtn) {
            dlBtn.addEventListener('click', function () {
                var dd = document.getElementById('downloadDropdown');
                if (dd) dd.classList.toggle('show');
            });
        }
        document.addEventListener('click', function (e) {
            var dd = document.getElementById('downloadDropdown');
            var btn = document.getElementById('downloadToggleBtn');
            if (dd && btn && !dd.contains(e.target) && !btn.contains(e.target)) dd.classList.remove('show');
        });
    }

    // Today, unless the dataset stops earlier: the bundled dummy data ends on
    // meta.periodEnd, so "today" is held there to keep the demo populated.
    // With the live API, periodEnd is today and this is simply the real date.
    function resolveToday(data) {
        var meta = data.meta || {};
        var first = meta.periodStart || '';
        var last = meta.periodEnd || '';
        if (!first || !last) {
            data.attendance.forEach(function (a) {
                if (!first || a.date < first) first = a.date;
                if (!last || a.date > last) last = a.date;
            });
        }
        dataStart = first;
        var today = toISO(new Date());
        reportToday = last && today > last ? last : today;
    }

    function loadProjectContext(data) {
        var url = new URL(location.href);
        var code = url.searchParams.get('project');
        var employeeCode = url.searchParams.get('employee');
        var employee = employeeCode ? data.findEmployeeByCode(employeeCode) : null;
        if (!code && employee && employee.projects && employee.projects.length) code = employee.projects[0];
        if (!code) {
            try { code = sessionStorage.getItem('feriiz_active_project'); } catch (e) {}
        }
        projectContext = code ? data.findProjectByCode(code) : data.projects[0];
        if (!projectContext) projectContext = data.projects[0];
        if (projectContext && projectContext.code) {
            try { sessionStorage.setItem('feriiz_active_project', projectContext.code); } catch (e) {}
        }
        resolveToday(data);

        reportEmployees = data.employees.filter(function (e) {
            return (e.projects || []).indexOf(projectContext.code) >= 0;
        });
        // Employee report: the same table, narrowed to one person.
        if (employeeCode) {
            reportEmployees = reportEmployees.filter(function (e) { return e.code === employeeCode; });
            var who = employee ? employee.name : employeeCode;
            document.querySelectorAll('[data-report-employee]').forEach(function (el) { el.textContent = who; });
            document.title = 'Feriiz - ' + who + ' - Report';
            if (!reportEmployees.length && window.FeriizNotify) {
                FeriizNotify.warning(who + ' is not assigned to ' + projectContext.name + '.', 'No report to show');
            }
        }
        if (window.FeriizFilters && window.FeriizFilters.setOccupationPeople) window.FeriizFilters.setOccupationPeople(reportEmployees);
        var reportHref = 'project_report.html?project=' + encodeURIComponent(projectContext.code);
        var reportLink = document.getElementById('reportBackLink');
        if (reportLink) reportLink.href = reportHref;
        // Back: return to wherever the person came from (Activity or the project
        // report); opened directly, fall back to the project report.
        var backBtn = document.getElementById('reportBackBtn');
        if (backBtn) {
            backBtn.href = reportHref;
            backBtn.addEventListener('click', function (e) {
                var fromHere = document.referrer && document.referrer.indexOf(location.origin + '/') === 0;
                if (fromHere && window.history.length > 1) {
                    e.preventDefault();
                    window.history.back();
                }
            });
        }
        // Build attendance index for just this project's dates
        attendanceIndex = {};
        var relevant = new Set(reportEmployees.map(function (e) { return e.code; }));
        for (var i = 0; i < data.attendance.length; i++) {
            var a = data.attendance[i];
            if (relevant.has(a.employeeCode) && a.projectCode === projectContext.code) {
                attendanceIndex[a.employeeCode + '|' + a.date] = a;
            }
        }
        migrateLogEdits();
        // A request covers the person, whichever project it was filed under.
        requestIndex = {};
        (data.generatedRequests || []).forEach(function (r) {
            if (r.status !== 'Accepted' || !relevant.has(r.employeeCode) || !r.dateStart) return;
            for (var d = r.dateStart; d <= (r.dateEnd || r.dateStart); d = addDays(d, 1)) {
                requestIndex[r.employeeCode + '|' + d] = r;
            }
        });
        var bc = document.querySelector('[data-project-name]');
        if (bc) {
            bc.textContent = projectContext.name;
            if (bc.tagName === 'A') {
                bc.href = 'project_employees.html?project=' + encodeURIComponent(projectContext.code);
            }
        }
        if (projectContext.name && !employeeCode) {
            document.title = 'Feriiz - ' + projectContext.name + ' - Report';
        }
    }

    function startWhenReady() {
        if (window.FERIIZ_DATA && window.FERIIZ_DATA.ready) {
            window.FERIIZ_DATA.ready.then(function (data) {
                loadProjectContext(data);
                init();
            });
        } else {
            init();
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWhenReady);
    else startWhenReady();
})();
