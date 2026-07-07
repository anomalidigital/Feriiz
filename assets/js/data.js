/* ============================================================
   FERIIZ — Data loader.
   Fetches feriiz-data.json (generated dataset) and exposes
   window.FERIIZ_DATA to every page.

   Usage from pages:
       FERIIZ_DATA.ready.then(function (data) {
           // render using data.employees, data.projects, etc.
       });

   Fields available after .ready resolves:
       meta, occupations, projects, employees, attendance,
       requests, holidays,
       findEmployeeByCode(code), findProjectByCode(code),
       initialsAvatar(name) — data URI for placeholder avatar.
   ============================================================ */
(function (global) {
    'use strict';

    var DATA_URL = 'feriiz-data.json';

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
            // Try real photo path first; render will fall back to initials on error.
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
            API.requests = data.requests || [];
            API.holidays = data.holidays || [];
            API.employees.forEach(function (e) { API._empByCode[e.code] = e; });
            API.projects.forEach(function (p) { API._projByCode[p.code] = p; });
            return API;
        })
        .catch(function (err) {
            console.error('[FERIIZ_DATA] failed to load dataset:', err);
            return API; // still resolve so pages don't hang
        });

    global.FERIIZ_DATA = API;

})(typeof window !== 'undefined' ? window : this);
