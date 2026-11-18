/* ============================================================
   FERIIZ — Data loader.
   Fetches feriiz-data.json (generated dataset) and exposes
   window.FERIIZ_DATA to every page.

   Requests & Calendar are a small curated demo for the original
   Anomali team (12 named employees). Those two pages use the
   ANOMALI_* sets below instead of the large generated dataset.

   Usage from pages:
       FERIIZ_DATA.ready.then(function (data) {
           // render using data.employees, data.projects, etc.
       });
   ============================================================ */
(function (global) {
    'use strict';

    // Fetched with force-cache, so change the query whenever the file changes
    // (2026-11-02: projects got defaultHours; 2026-11-10: taken out again, Default Hours are
    // per occupation on each project's Settings page; 2026-11-17: the demo runs 9 Oct - Sat 14 Nov,
    // a Saturday added and the dates moved two weeks, so This Week is Sunday to Saturday: Arcon
    // asked where Saturday was, the demo's "today" had been a Friday).
    var DATA_URL = 'feriiz-data.json?v=2026-11-17';

    // Transport per employee (Transport / Day, 28-10 to 12-11-2026) is gone: transport is a request
    // template given in the Report. What a browser kept of it is dropped.
    try { localStorage.removeItem('feriiz_employee_transport_v2'); } catch (e) { /* nothing kept */ }

    // A project's Working Time (Project Detail) and its Default Hours per occupation
    // (Settings), as last saved, so the Report on another page uses them. Kept in this
    // browser until the API exists.
    var PROJECT_KEY = 'feriiz_project_settings_v1';
    var projectEdits = {};
    try { projectEdits = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}') || {}; } catch (e) { projectEdits = {}; }

    // The Default Hours of an occupation never saved on its project's Settings page: 8/2 every
    // day (Baldy, 10-11-2026); since 18-11-2026 the project's Working Day (projectWorkingDay),
    // which is 8/2 for 08:00-17:00 and an Overtime never set. These are its fallbacks.
    var NEW_OCCUPATION_DAY = { work: 8, ot: 2 };

    // "08:00" -> minutes, or null.
    function clockMinutes(text) {
        var m = /^(\d{1,2})[:.](\d{2})$/.exec(String(text || '').trim());
        if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
        return Number(m[1]) * 60 + Number(m[2]);
    }

    // The occupations as Employees > Manage Occupations left them (Baldy, 12-11-2026): { list:
    // the names, steps: ['delete', [names]] in the order they were done }. The steps are done
    // again on the employees when the data loads, so each keeps what the page showed (a name
    // deleted and added again stays off the people it was taken from). A ['rename', from, to]
    // step can be there from the morning of 12-11, before rename was taken out; it is still done
    // again, so those employees keep the name they were given. Kept in this browser until the
    // API exists.
    var OCC_KEY = 'feriiz_occupations_v1';
    var occEdits = {};
    try { occEdits = JSON.parse(localStorage.getItem(OCC_KEY) || '{}') || {}; } catch (e) { occEdits = {}; }
    if (!Array.isArray(occEdits.steps)) occEdits = { list: occEdits.list, steps: [] };

    function lower(s) { return String(s || '').trim().toLowerCase(); }

    function byName(a, b) { return a.localeCompare(b); }

    // The occupation on the list with this name, whatever its capitals; '' when there is none.
    function onList(name) {
        var found = '';
        API.occupations.forEach(function (o) { if (lower(o) === lower(name)) found = o; });
        return found;
    }

    // Request quotas: Projects > Activity > an employee > Assigned Requests, the old Feriiz
    // "List Assigned Request" (Baldy, 03-11-2026). The admin gives each person how much of a
    // request type they may use, e.g. Remote Work 20 days a year; employees ask for it in the
    // mobile app and the project's Requests page approves it. type = the group shown in the
    // list, unit = 'day' or 'idr', period = how often the quota starts again. Prototype list
    // until the API gives the real one.
    var REQUEST_TYPES = [
        { name: 'Annual Leave',       type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Sick Leave',         type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Permission',         type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Time in lieu',       type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Public Holiday',     type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'National Leave',     type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Long Service Leave', type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Marriage Leave',     type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Unpaid Leave',       type: 'Leave',  unit: 'day', period: 'Yearly' },
        { name: 'Remote Work',        type: 'Remote', unit: 'day', period: 'Yearly' },
        { name: 'Meal',               type: 'Claim',  unit: 'idr', period: 'Monthly' },
        { name: 'Transport',          type: 'Claim',  unit: 'idr', period: 'Monthly' },
        { name: 'Medical Claim',      type: 'Claim',  unit: 'idr', period: 'Yearly' },
        { name: 'Others',             type: 'Other',  unit: 'day', period: 'Yearly' }
    ];
    // Demo: until something is assigned to a person in a project, they start with these.
    var DEFAULT_ASSIGNED = [
        { type: 'Annual Leave', amount: 12 },
        { type: 'Sick Leave', amount: 12 },
        { type: 'Remote Work', amount: 20 }
    ];
    var ASSIGNED_KEY = 'feriiz_assigned_requests_v1';
    var assignedEdits = {};
    try { assignedEdits = JSON.parse(localStorage.getItem(ASSIGNED_KEY) || '{}') || {}; } catch (e) { assignedEdits = {}; }

    /* ---- Original Anomali team (12 people) — for Requests & Calendar ---- */
    var ANOMALI_EMPLOYEES = [
        { code: 'ADA27B1B2E650H0X', name: 'Adam Ferial',         occupation: 'Graphic Design',   pin: '3131', photoFile: 'adam-ferial_1689213258972QWGCYFQ_1770362381449KFDCLNS.jpg' },
        { code: 'APR8940K8VB44L8',  name: 'Apriyanto Apriyanto', occupation: 'Teknisi',          pin: '2714', photoFile: 'apriyanto-apriyanto_1621850525850PHJHHMX_1770362419047ZJYLSJN.jpg' },
        { code: 'BILFBY9N8YJ1YDN',  name: 'Baldyas Satrio',      occupation: 'Graphic Design',   pin: '2218', photoFile: 'baldyas-satrio_1719889375870VXHPKRR_1770005188161PFGYCTG.jpg' },
        { code: 'IFAT8WJ2DM',       name: 'Ifan Faizal Adnan',   occupation: 'Sr.Programmer',    pin: '1840', photoFile: 'ifan-faizal-adnan_1620206785015MBCPYVL_1773047618343SVWDDHF.jpg' },
        { code: 'IND693283053999',  name: 'Indra Naftali',       occupation: 'Manager',          pin: '5190', photoFile: 'indra-naftali_1620292947975SJGDKRW_1770362519575KZRDYJQ.jpg' },
        { code: 'MAUNZ1TL5H0Q7GG',  name: 'Mauli Hidayat',       occupation: 'Marketing',        pin: '7402', photoFile: 'mauli-hidayat_1702870246840CSGXRBZ_1770362636360NSDZCPZ.jpg' },
        { code: 'RADVBYR5171FSC6',  name: 'Raden Maulana',       occupation: 'Frontend',         pin: '6629', photoFile: 'raden-maulana_1620291488566YRBPCKR_1770359737806BBDBVNN.jpg' },
        { code: 'STEPRQTY99',       name: 'Steven Febrianto',    occupation: 'Backend',          pin: '8027', photoFile: 'steven-febrianto_1620206785015NDMGHJW_1770362804080TMPZQVJ.jpg' },
        { code: 'VER2FWV8L80S5SX',  name: 'Veronica Nathalia',   occupation: 'Graphic Design',   pin: '4075', photoFile: 'veronica-nathalia_1672729358803HTZMQXL_1770362780009DWBDQYQ.jpg' },
        { code: 'YENX6LH3X9',       name: 'Yenni Tedjakoesoemo', occupation: 'HR Administrator', pin: '9064', photoFile: 'yenni-tedjokoesoemo_1621590860902KTBPYXR_1770362740255MYSGRLH.jpg' },
        { code: 'ZICOJMQN8SQ5RDT',  name: 'Zicky Affan',         occupation: '3D Artist',        pin: '5861', photoFile: 'zicky-affan_1684726717948GTJWVGM_1770362757807BGLXFRL.jpg' },
        { code: 'SAN79P3WFFK4MQM',  name: 'Sandy Santuy',        occupation: 'Graphic Design',   pin: '7903', photoFile: 'Sandy Santuy.jfif' }
    ];

    function req(id, code, project, type, date, status) {
        return {
            id: id, employeeCode: code, projectCode: project, type: type,
            dateStart: date, dateEnd: date, status: status, pic: 'Judith Anastalio',
            submittedAt: date + 'T08:00:00+07:00', reason: ''
        };
    }
    // Sample attachments (assets/attachments/, marked "CONTOH"). With the API,
    // each request carries its own list: [{ name, url, type, size }].
    function file(name, size) {
        return { name: name, url: 'assets/attachments/' + name, type: 'image/svg+xml', size: size };
    }
    var ATTACHMENTS = {
        'REQ-0001': [file('surat-sakit-sandy-santuy.svg', 1793)],
        'REQ-0003': [file('surat-sakit-raden-maulana.svg', 1795)],
        'REQ-0005': [file('surat-sakit-adam-ferial.svg', 1809), file('resep-obat-adam-ferial.svg', 1175)],
        'REQ-0011': [file('surat-sakit-mauli-hidayat.svg', 1810)]
    };

    var ANOMALI_REQUESTS = [
        req('REQ-0001', 'SAN79P3WFFK4MQM', 'ANM001', 'Sick Leave',   '2026-10-12', 'Accepted'),
        req('REQ-0002', 'STEPRQTY99',      'ANM001', 'Annual Leave', '2026-10-13', 'Accepted'),
        req('REQ-0003', 'RADVBYR5171FSC6', 'ANM001', 'Sick Leave',   '2026-10-13', 'Accepted'),
        req('REQ-0004', 'YENX6LH3X9',      'ANM001', 'Remote Work',  '2026-10-14', 'Accepted'),
        req('REQ-0005', 'ADA27B1B2E650H0X','ANM001', 'Sick Leave',   '2026-10-14', 'Accepted'),
        req('REQ-0006', 'ADA27B1B2E650H0X','DCG015', 'Remote Work',  '2026-10-15', 'Accepted'),
        req('REQ-0007', 'MAUNZ1TL5H0Q7GG', 'DCG015', 'Annual Leave', '2026-10-19', 'Accepted'),
        req('REQ-0008', 'IFAT8WJ2DM',      'ANM001', 'Annual Leave', '2026-10-20', 'Accepted'),
        req('REQ-0009', 'RADVBYR5171FSC6', 'ANM001', 'Sick Leave',   '2026-10-12', 'Accepted'),
        req('REQ-0010', 'IFAT8WJ2DM',      'ANM001', 'Remote Work',  '2026-10-21', 'Pending'),
        req('REQ-0011', 'MAUNZ1TL5H0Q7GG', 'DCG015', 'Sick Leave',   '2026-10-21', 'Pending'),
        req('REQ-0012', 'MAUNZ1TL5H0Q7GG', 'ANM001', 'Annual Leave', '2026-10-16', 'Accepted'),
        req('REQ-0013', 'VER2FWV8L80S5SX', 'ANM001', 'Annual Leave', '2026-10-23', 'Accepted'),
        req('REQ-0014', 'STEPRQTY99',      'DGH105', 'Remote Work',  '2026-10-14', 'Accepted'),
        req('REQ-0015', 'ZICOJMQN8SQ5RDT', 'ANM001', 'Remote Work',  '2026-10-15', 'Accepted'),
        req('REQ-0016', 'BILFBY9N8YJ1YDN', 'DCG015', 'Remote Work',  '2026-10-21', 'Accepted'),
        req('REQ-0017', 'IND693283053999', 'ANM001', 'Remote Work',  '2026-10-21', 'Accepted'),
        req('REQ-0018', 'APR8940K8VB44L8', 'DGH105', 'Sick Leave',   '2026-10-21', 'Accepted')
    ];
    ANOMALI_REQUESTS.forEach(function (r) { r.attachments = ATTACHMENTS[r.id] || []; });
    var ANOMALI_HOLIDAYS = [
        { name: 'Hari Buruh Internasional', date: '2026-05-01', type: 'national' },
        { name: 'Kenaikan Isa Al Masih',    date: '2026-05-14', type: 'national' },
        { name: 'Idul Adha (Lebaran Haji)', date: '2026-05-27', type: 'national' },
        { name: 'Idul Adha (Lebaran Haji)', date: '2026-05-28', type: 'national' },
        { name: 'Hari Raya Waisak',         date: '2026-05-31', type: 'national' }
    ];

    // Sample closings: the same rows dev.feriiz.com shows for a project (Oct 2026).
    // With the API each closing lists its own people; here the next few
    // employees of the project stand in for them. What "Others" means is still
    // being confirmed; on dev they are extra people in the details with no status.
    var SAMPLE_CLOSINGS = [
        { id: 'CLS-0006', closedAt: '2026-10-01T15:55:00+07:00', employees: 0, others: 1, note: '' },
        { id: 'CLS-0005', closedAt: '2026-10-01T15:55:00+07:00', employees: 0, others: 1, note: '' },
        { id: 'CLS-0004', closedAt: '2026-08-27T14:00:00+07:00', employees: 2, others: 1, note: 'Percobaan' },
        { id: 'CLS-0003', closedAt: '2026-08-27T13:53:00+07:00', employees: 3, others: 1, note: 'Tambahan' },
        { id: 'CLS-0002', closedAt: '2026-08-27T13:49:00+07:00', employees: 3, others: 1, note: 'Tambahan hari ini' },
        { id: 'CLS-0001', closedAt: '2026-08-27T13:49:00+07:00', employees: 5, others: 1, note: '' }
    ];

    var API = {
        meta: null,
        occupations: [],
        projects: [],
        employees: [],
        attendance: [],
        requests: [],
        generatedRequests: [],
        holidays: [],
        // The dataset's own holidays: the days its attendance marks 'holiday'
        // (the Calendar keeps the curated Anomali list in `holidays`).
        datasetHolidays: [],
        _empByCode: {},
        _projByCode: {},
        findEmployeeByCode: function (code) { return this._empByCode[code] || null; },
        findProjectByCode: function (code) { return this._projByCode[code] || null; },
        // Newest first: [{ id, projectCode, closedAt, note, employees: [person], others: [person] }],
        // person = { name, code, occupation, status, clockIn, clockOut }.
        closingsForProject: function (projectCode) {
            var team = this.employees.filter(function (e) { return (e.projects || []).indexOf(projectCode) >= 0; });
            var next = 0;
            function person(e, status) {
                return { name: e.name, code: e.code, occupation: e.occupation || '', status: status, clockIn: '', clockOut: '' };
            }
            return SAMPLE_CLOSINGS.map(function (c, i) {
                var people = team.slice(next, next + c.employees);
                next += c.employees;
                var others = [];
                for (var k = 0; k < c.others; k++) others.push(ANOMALI_EMPLOYEES[(3 + i + k) % ANOMALI_EMPLOYEES.length]);
                return {
                    id: c.id, projectCode: projectCode, closedAt: c.closedAt, note: c.note,
                    employees: people.map(function (e) { return person(e, 'manual'); }),
                    others: others.map(function (e) { return person(e, ''); })
                };
            });
        },
        requestTypes: REQUEST_TYPES,
        findRequestType: function (name) {
            var key = String(name || '').trim().toLowerCase();
            return REQUEST_TYPES.filter(function (t) { return t.name.toLowerCase() === key; })[0] || null;
        },
        // [{ id, type, amount, notes, at, by }] given to one person in one project (copies).
        assignedRequestsOf: function (projectCode, employeeCode) {
            var key = projectCode + '|' + employeeCode;
            if (Object.prototype.hasOwnProperty.call(assignedEdits, key)) {
                return assignedEdits[key].map(function (a) { return Object.assign({}, a); });
            }
            return DEFAULT_ASSIGNED.map(function (a, i) { return { id: 'AR-DEMO-' + i, type: a.type, amount: a.amount, notes: '', at: '', by: '' }; });
        },
        saveAssignedRequests: function (projectCode, employeeCode, list) {
            assignedEdits[projectCode + '|' + employeeCode] = list;
            try { localStorage.setItem(ASSIGNED_KEY, JSON.stringify(assignedEdits)); } catch (e) { /* kept for this page only */ }
        },
        // settings = { workStart, workEnd, cutOff, defaultOvertime } from Project Detail, or { defaultHours } from
        // Settings: { occupations: [{ occupation, custom, daily: { work, ot },
        // days: { Sun: { work, ot }, ... } }] } in hours, or { occupations: [names] } from its
        // Manage Occupations.
        saveProjectSettings: function (code, settings) {
            if (!code || !settings) return;
            var edit = projectEdits[code] || (projectEdits[code] = {});
            Object.keys(settings).forEach(function (k) { if (settings[k] != null) edit[k] = settings[k]; });
            var project = this._projByCode[code];
            if (project) Object.keys(edit).forEach(function (k) { project[k] = edit[k]; });
            try { localStorage.setItem(PROJECT_KEY, JSON.stringify(projectEdits)); } catch (e) { /* kept for this page only */ }
        },
        // The working hours of a day from Start to End ("08:00", "17:00"), less the hour of break
        // when there is room for one: 8 of 08:00-17:00, as the Report counts a full working day
        // (Baldy, 13-11-2026). An End before the Start is the next day. 0 when either is not a time.
        workingHours: function (start, end) {
            var a = clockMinutes(start);
            var b = clockMinutes(end);
            if (a == null || b == null) return 0;
            var span = (b > a ? b - a : b + 24 * 60 - a) / 60;
            return Math.round((span > 1 ? span - 1 : span) * 100) / 100;
        },
        // A project's Working Day, { work, ot } in hours (Project Detail, Baldy, 18-11-2026: "di
        // project detail tambahin colom lagi namanya working day, jadi ini tuh buat default nya
        // project itu, cuma cukup 2 coloms aja working hour yang sehari dan overtime nya"). The
        // working hour comes from its Working Time and cannot be typed ("working hour nya itu dia
        // bakal otomatis keisi ketika working time nya di isi... tidak bisa di ganti"); the
        // overtime is set there (defaultOvertime), 2 until it is. A new occupation on the project's
        // Settings page starts at it every day ("ketika ada occupation baru di sana dia waktu nya
        // lansung mengikuti working day dari project nya").
        projectWorkingDay: function (project) {
            var work = API.workingHours((project && project.workStart) || '08:00', (project && project.workEnd) || '17:00');
            var ot = project && project.defaultOvertime != null && project.defaultOvertime !== '' ? Number(project.defaultOvertime) : NEW_OCCUPATION_DAY.ot;
            return { work: work || NEW_OCCUPATION_DAY.work, ot: Math.max(0, ot || 0) };
        },
        // The Default Hours of an occupation in a project on one weekday ('Mon'): its row on the
        // project's Settings page, { work, ot } in hours. One never saved there has the project's
        // Working Day every day; a day saved as 0 hours has none, so its real logs count (null).
        // The Report, its print, Attendance and Settings itself all read it here.
        defaultHoursOf: function (project, occupation, dayName) {
            var rows = (project && project.defaultHours && project.defaultHours.occupations) || [];
            var row = null;
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].occupation === occupation) { row = rows[i]; break; }
            }
            var day = row ? (row.days || {})[dayName] || row.daily : API.projectWorkingDay(project);
            var work = Math.max(0, Number(day && day.work) || 0);
            return work > 0 ? { work: work, ot: Math.max(0, Number(day.ot) || 0) } : null;
        },
        // A project's occupations, A to Z: the ones saved on its Settings page (Manage Occupations,
        // Baldy, 17-11-2026: "di project setting tambahin manage occupation, jadi bisa add
        // occupation"), and always those of the employees assigned to it: one its employees have
        // cannot be taken off ("menurutku ga bisa di remove ya, paling take off dulu employee nya,
        // baru occupation nya"). Until it is saved there, only the employees' ones.
        projectOccupations: function (project) {
            if (!project) return [];
            var seen = {};
            var names = [];
            function add(name) {
                var clean = String(name || '').trim();
                if (clean && !seen[lower(clean)]) { seen[lower(clean)] = true; names.push(clean); }
            }
            (Array.isArray(project.occupations) ? project.occupations : []).forEach(add);
            API.employees.forEach(function (e) { if ((e.projects || []).indexOf(project.code) >= 0) add(e.occupation); });
            return names.sort(byName);
        },
        // Settings > Manage Occupations: the project's occupations as ticked there.
        saveProjectOccupations: function (code, names) {
            this.saveProjectSettings(code, { occupations: names.slice().sort(byName) });
        },
        // An employee assigned to a project brings their occupation when the project does not
        // have it yet (Baldy, 17-11-2026: "kalau misal sebuah employee ketika di tambahin di manage
        // employee dan dia itu occupations nya ... tidak ada occupations di project itu, maka nanti
        // di project settings nya bertambah ya occupation baru"). Its Default Hours start at the
        // project's Working Day.
        // The names that were new to the project.
        addProjectOccupations: function (code, names) {
            var project = this._projByCode[code];
            if (!project) return [];
            var list = this.projectOccupations(project);
            var have = {};
            list.forEach(function (n) { have[lower(n)] = true; });
            var added = [];
            (names || []).forEach(function (name) {
                var clean = String(name || '').trim();
                if (!clean || have[lower(clean)]) return;
                have[lower(clean)] = true;
                added.push(clean);
            });
            if (added.length) this.saveProjectOccupations(code, list.concat(added));
            return added;
        },
        // Occupations, A to Z, each with how many employees have it (Employees > Manage
        // Occupations, Baldy, 12-11-2026: "tambahin tombol buat tambah occupation… ada checlist nya
        // terus bisa delete juga"; no rename: "ini edit occupation harusnya tidak ada deh").
        occupationList: function () {
            var count = {};
            API.employees.forEach(function (e) { if (e.occupation) count[lower(e.occupation)] = (count[lower(e.occupation)] || 0) + 1; });
            return API.occupations.slice().sort(byName).map(function (name) { return { name: name, employees: count[lower(name)] || 0 }; });
        },
        // '' when added, else what is wrong.
        addOccupation: function (name) {
            var clean = String(name || '').trim().replace(/\s+/g, ' ');
            if (!clean) return 'Type the occupation\'s name.';
            var same = onList(clean);
            if (same) return same + ' is already on the list.';
            API.occupations.push(clean);
            API.occupations.sort(byName);
            saveOccupations();
            return '';
        },
        // Takes these occupations off the list and off their employees; how many employees lost one.
        deleteOccupations: function (names) {
            var gone = {};
            names.forEach(function (n) { gone[lower(n)] = true; });
            var step = ['delete', API.occupations.filter(function (o) { return gone[lower(o)]; })];
            API.occupations = API.occupations.filter(function (o) { return !gone[lower(o)]; });
            occEdits.steps.push(step);
            var cleared = occupationStep(API.employees, step);
            dropDefaultHours(gone);
            dropProjectOccupations(gone);
            saveOccupations();
            return cleared;
        },
        initialsAvatar: function (name) { return buildInitialsAvatar(name); },
        avatarSrc: function (employee) {
            // Only the Anomali team has photo files (photoFile). The generated employees'
            // `photo` slugs have no file behind them, so they get initials instead of a
            // request that fails (25 404s per list page, backlog A4).
            if (employee && employee.photoFile) {
                return 'assets/images/employees/' + encodeURIComponent(employee.photoFile);
            }
            return buildInitialsAvatar(employee ? employee.name : '');
        }
    };

    function saveOccupations() {
        occEdits.list = API.occupations.slice();
        try { localStorage.setItem(OCC_KEY, JSON.stringify(occEdits)); } catch (e) { /* kept for this page only */ }
    }

    // One step on these people: a deleted occupation leaves them without (an old rename step
    // gives them its new name). How many people it changed.
    function occupationStep(people, step) {
        var n = 0;
        var from = {};
        if (step[0] === 'rename') from[lower(step[1])] = step[2];
        else if (step[0] === 'delete') (step[1] || []).forEach(function (name) { from[lower(name)] = ''; });
        people.forEach(function (e) {
            var k = lower(e.occupation);
            if (!k || !Object.prototype.hasOwnProperty.call(from, k)) return;
            e.occupation = from[k];
            n++;
        });
        return n;
    }

    // At load: the list as it was left, and every step again on the employees, in order.
    function applyOccupationEdits() {
        if (Array.isArray(occEdits.list)) API.occupations = occEdits.list.slice();
        occEdits.steps.forEach(function (step) { occupationStep(API.employees, step); });
    }

    // Each project's Default Hours lose the rows of the deleted occupations (gone: lower-case
    // name -> true).
    function dropDefaultHours(gone) {
        API.projects.forEach(function (p) {
            var rows = p.defaultHours && p.defaultHours.occupations;
            if (!rows || !rows.length) return;
            var next = rows.filter(function (r) { return !gone[lower(r.occupation)]; });
            if (next.length < rows.length) API.saveProjectSettings(p.code, { defaultHours: Object.assign({}, p.defaultHours, { occupations: next }) });
        });
    }

    // ... and the deleted occupations leave each project's own list (Settings > Manage Occupations).
    function dropProjectOccupations(gone) {
        API.projects.forEach(function (p) {
            if (!Array.isArray(p.occupations)) return;
            var next = p.occupations.filter(function (o) { return !gone[lower(o)]; });
            if (next.length < p.occupations.length) API.saveProjectSettings(p.code, { occupations: next });
        });
    }

    function buildInitialsAvatar(name) {
        var parts = (name || '?').trim().split(/\s+/);
        var initials = ((parts[0] || '')[0] || '?') + ((parts[1] || '')[0] || '');
        initials = initials.toUpperCase();
        // Colour derived from name — stable per person
        var hash = 0;
        for (var i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
        var hue = Math.abs(hash) % 360;
        var bg = 'hsl(' + hue + ', 55%, 50%)';
        var svg =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
                '<rect width="48" height="48" fill="' + bg + '"/>' +
                '<text x="24" y="30" font-family="Poppins,sans-serif" font-size="18" font-weight="700" ' +
                    'fill="#fff" text-anchor="middle">' + initials + '</text>' +
            '</svg>';
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    API.ready = fetch(DATA_URL, { cache: 'force-cache' })
        .then(function (r) {
            if (!r.ok) throw new Error('feriiz-data.json ' + r.status);
            return r.json();
        })
        .then(function (data) {
            API.meta = data.meta || null;
            API.occupations = data.occupations || [];
            API.projects = data.projects || [];
            API.employees = data.employees || [];
            API.attendance = data.attendance || [];
            // A lone tap is the log in: the attendance system has no day with a log out and no log
            // in, it cuts the day off and takes the tap as the log in, even at 16:59 on an
            // 08:00–17:00 project (Baldy, 13-11-2026, from the backend). The generated dataset has
            // 1,460 such days (taps from 16:00 to 19:59); they become a log in without its log out.
            API.attendance.forEach(function (r) {
                if (!r.inTime && r.outTime) {
                    r.inTime = r.outTime;
                    r.outTime = '';
                }
            });
            API.employees.forEach(function (e) { API._empByCode[e.code] = e; });
            applyOccupationEdits();
            API.projects.forEach(function (p) {
                var edit = projectEdits[p.code];
                if (edit) Object.keys(edit).forEach(function (k) { p[k] = edit[k]; });
                API._projByCode[p.code] = p;
            });

            // Requests & Calendar use the curated Anomali-12 demo, not the
            // large generated request set. Register the 12 employees so
            // findEmployeeByCode() resolves them (name + photo).
            // The generated set (220 requests, matching the sick/leave/remote
            // days in attendance) stays available for one person's Request page.
            API.generatedRequests = data.requests || [];
            API.datasetHolidays = data.holidays || [];
            API.requests = ANOMALI_REQUESTS;
            API.holidays = ANOMALI_HOLIDAYS;
            ANOMALI_EMPLOYEES.forEach(function (e) {
                if (!API._empByCode[e.code]) API._empByCode[e.code] = e;
            });

            return API;
        })
        .catch(function (err) {
            console.error('[FERIIZ_DATA] failed to load dataset:', err);
            window.setTimeout(function () {
                if (window.FeriizNotify) {
                    window.FeriizNotify.error('The application data could not be loaded. Refresh the page or try again later.', 'Data unavailable');
                }
            }, 0);
            // Even on failure, keep Requests/Calendar working with the demo.
            API.requests = ANOMALI_REQUESTS;
            API.holidays = ANOMALI_HOLIDAYS;
            ANOMALI_EMPLOYEES.forEach(function (e) {
                if (!API._empByCode[e.code]) API._empByCode[e.code] = e;
            });
            return API;
        });

    global.FERIIZ_DATA = API;

})(typeof window !== 'undefined' ? window : this);
