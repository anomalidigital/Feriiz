/* ============================================================
   FERIIZ — Single source of truth for demo data.
   Loaded BEFORE app.js / report.js on every page that needs it.
   ============================================================ */
(function (global) {
    'use strict';

    var FERIIZ_OCCUPATIONS = [
        'Graphic Design',
        'Sr.Programmer',
        'Teknisi',
        'Manager',
        'Marketing',
        'Frontend',
        'Backend',
        'HR Administrator',
        '3D Artist',
        'Tukang Kayu',
        'Tukang Keramik',
        'Tukang Las',
        'Mandor Lapangan',
        'Surveyor'
    ];

    var FERIIZ_EMPLOYEES = [
        { code: 'ADA27B1B2E650H0X', name: 'Adam Ferial',         occupation: 'Graphic Design',   pin: '3131', photo: 'adam-ferial' },
        { code: 'APR8940K8VB44L8',  name: 'Apriyanto Apriyanto', occupation: 'Teknisi',          pin: '2714', photo: 'apriyanto-apriyanto' },
        { code: 'BILFBY9N8YJ1YDN',  name: 'Baldyas Satrio',      occupation: 'Graphic Design',   pin: '2218', photo: 'baldyas-satrio' },
        { code: 'IFAT8WJ2DM',       name: 'Ifan Faizal Adnan',   occupation: 'Sr.Programmer',    pin: '1840', photo: 'ifan-faizal-adnan' },
        { code: 'IND693283053999',  name: 'Indra Naftali',       occupation: 'Manager',          pin: '5190', photo: 'indra-naftali' },
        { code: 'MAUNZ1TL5H0Q7GG',  name: 'Mauli Hidayat',       occupation: 'Marketing',        pin: '7402', photo: 'mauli-hidayat' },
        { code: 'RADVBYR5171FSC6',  name: 'Raden Maulana',       occupation: 'Frontend',         pin: '6629', photo: 'raden-maulana' },
        { code: 'STEPRQTY99',       name: 'Steven Febrianto',    occupation: 'Backend',          pin: '8027', photo: 'steven-febrianto' },
        { code: 'VER2FWV8L80S5SX',  name: 'Veronica Nathalia',   occupation: 'Graphic Design',   pin: '4075', photo: 'veronica-nathalia' },
        { code: 'YENX6LH3X9',       name: 'Yenni Tedjakoesoemo', occupation: 'HR Administrator', pin: '9064', photo: 'yenni-tedjakoesoemo' },
        { code: 'ZICOJMQN8SQ5RDT',  name: 'Zicky Affan',         occupation: '3D Artist',        pin: '5861', photo: 'zicky-affan' },
        { code: 'SAN79P3WFFK4MQM',  name: 'Sandy Santuy',        occupation: 'Graphic Design',   pin: '7903', photo: 'sandy-santuy' }
    ];

    var FERIIZ_PROJECTS = [
        { code: 'ANM001', name: 'Anomali',                      id: 'anomali',  type: 'Attendance', location: 'BSD Residence' },
        { code: 'DCG015', name: 'Diamond Crystal Golf No. 15',  id: 'dcg015',   type: 'Attendance' },
        { code: 'DGH105', name: 'Diamond Golf H3 No. 105',      id: 'dgh105',   type: 'Attendance' },
        { code: 'MGS053', name: 'Mangunsarkoro No. 53',         id: 'mgs053',   type: 'Attendance' }
    ];

    global.FERIIZ_DATA = {
        employees: FERIIZ_EMPLOYEES,
        projects: FERIIZ_PROJECTS,
        occupations: FERIIZ_OCCUPATIONS,
        findEmployeeByCode: function (code) {
            for (var i = 0; i < FERIIZ_EMPLOYEES.length; i++) {
                if (FERIIZ_EMPLOYEES[i].code === code) return FERIIZ_EMPLOYEES[i];
            }
            return null;
        },
        findProjectByCode: function (code) {
            for (var i = 0; i < FERIIZ_PROJECTS.length; i++) {
                if (FERIIZ_PROJECTS[i].code === code) return FERIIZ_PROJECTS[i];
            }
            return null;
        }
    };

})(typeof window !== 'undefined' ? window : this);
