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

    var DATA_URL = 'feriiz-data.json';

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
    var ANOMALI_REQUESTS = [
        req('REQ-0001', 'SAN79P3WFFK4MQM', 'ANM001', 'Sick Leave',   '2026-05-04', 'Accepted'),
        req('REQ-0002', 'STEPRQTY99',      'ANM001', 'Annual Leave', '2026-05-05', 'Accepted'),
        req('REQ-0003', 'RADVBYR5171FSC6', 'ANM001', 'Sick Leave',   '2026-05-05', 'Accepted'),
        req('REQ-0004', 'YENX6LH3X9',      'ANM001', 'Remote Work',  '2026-05-06', 'Accepted'),
        req('REQ-0005', 'ADA27B1B2E650H0X','ANM001', 'Sick Leave',   '2026-05-06', 'Accepted'),
        req('REQ-0006', 'ADA27B1B2E650H0X','DCG015', 'Remote Work',  '2026-05-07', 'Accepted'),
        req('REQ-0007', 'MAUNZ1TL5H0Q7GG', 'DCG015', 'Annual Leave', '2026-05-11', 'Accepted'),
        req('REQ-0008', 'IFAT8WJ2DM',      'ANM001', 'Annual Leave', '2026-05-12', 'Accepted'),
        req('REQ-0009', 'RADVBYR5171FSC6', 'ANM001', 'Sick Leave',   '2026-05-04', 'Accepted'),
        req('REQ-0010', 'IFAT8WJ2DM',      'ANM001', 'Remote Work',  '2026-05-13', 'Pending'),
        req('REQ-0011', 'MAUNZ1TL5H0Q7GG', 'DCG015', 'Sick Leave',   '2026-05-13', 'Pending'),
        req('REQ-0012', 'MAUNZ1TL5H0Q7GG', 'ANM001', 'Annual Leave', '2026-05-08', 'Accepted'),
        req('REQ-0013', 'VER2FWV8L80S5SX', 'ANM001', 'Annual Leave', '2026-05-15', 'Accepted'),
        req('REQ-0014', 'STEPRQTY99',      'DGH105', 'Remote Work',  '2026-05-06', 'Accepted'),
        req('REQ-0015', 'ZICOJMQN8SQ5RDT', 'ANM001', 'Remote Work',  '2026-05-07', 'Accepted'),
        req('REQ-0016', 'BILFBY9N8YJ1YDN', 'DCG015', 'Remote Work',  '2026-05-13', 'Accepted'),
        req('REQ-0017', 'IND693283053999', 'ANM001', 'Remote Work',  '2026-05-13', 'Accepted'),
        req('REQ-0018', 'APR8940K8VB44L8', 'DGH105', 'Sick Leave',   '2026-05-13', 'Accepted')
    ];
    var ANOMALI_HOLIDAYS = [
        { name: 'Hari Buruh Internasional', date: '2026-05-01', type: 'national' },
        { name: 'Kenaikan Isa Al Masih',    date: '2026-05-14', type: 'national' },
        { name: 'Idul Adha (Lebaran Haji)', date: '2026-05-27', type: 'national' },
        { name: 'Idul Adha (Lebaran Haji)', date: '2026-05-28', type: 'national' },
        { name: 'Hari Raya Waisak',         date: '2026-05-31', type: 'national' }
    ];

    var API = {
        meta: null,
        occupations: [],
        projects: [],
        employees: [],
        attendance: [],
        requests: [],
        holidays: [],
        _empByCode: {},
        _projByCode: {},
        findEmployeeByCode: function (code) { return this._empByCode[code] || null; },
        findProjectByCode: function (code) { return this._projByCode[code] || null; },
        initialsAvatar: function (name) { return buildInitialsAvatar(name); },
        avatarSrc: function (employee) {
            // Real full filename (Anomali team) first, then kebab photo, then initials.
            if (employee && employee.photoFile) {
                return 'assets/images/employees/' + encodeURIComponent(employee.photoFile);
            }
            if (employee && employee.photo) {
                return 'assets/images/employees/' + employee.photo + '.jpg';
            }
            return buildInitialsAvatar(employee ? employee.name : '');
        }
    };

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
            API.employees.forEach(function (e) { API._empByCode[e.code] = e; });
            API.projects.forEach(function (p) { API._projByCode[p.code] = p; });

            // Requests & Calendar use the curated Anomali-12 demo, not the
            // large generated request set. Register the 12 employees so
            // findEmployeeByCode() resolves them (name + photo).
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
