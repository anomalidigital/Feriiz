/* ============================================================
   FERIIZ — Employee form. One form for every place an employee is added
   or edited: Employees, Project > Activity (edit), Manage Employees (add)
   and Employee Detail. It keeps the original Project > Activity design
   (grey section bars, two columns, day checkboxes); what changed is the
   content: every field has its name, the missing fields were added,
   rates are in Rupiah, and the password is reset by link.

   FeriizEmployeeForm.open({ employee, project, prefillName, onSave })
       Shows the form in the overlay. employee = null means "add".
   FeriizEmployeeForm.mount(container, { employee, project, onSave })
       Renders the same form inline (Employee Detail page).

   onSave(values, isNew). This prototype keeps changes in memory only.

   Pay is per day (decided Oct 2026):
       Employee pay = Daily rate x days worked + Overtime rate x overtime hours
       Client bill  = Client daily rate x days worked + Client overtime rate x overtime hours
   ============================================================ */
(function () {
    'use strict';

    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var uid = 0;

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

    function rupiah(v) {
        var d = digits(v);
        return d ? Number(d).toLocaleString('id-ID') : '';
    }

    // Names saved before the form had parts: "Adam Setiawan Simanjuntak" ->
    // first Adam, middle Setiawan, last Simanjuntak.
    function splitName(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        var first = parts.shift() || '';
        var last = parts.pop() || '';
        return { first: first, middle: parts.join(' '), last: last };
    }

    function occupationOptions() {
        var data = window.FERIIZ_DATA;
        return ((data && data.occupations) || []).map(function (o) { return '<option value="' + esc(o) + '">'; }).join('');
    }

    // One labelled field in the original input style.
    function field(p, name, label, input) {
        return '<div class="emp-field"><label class="emp-field-label" for="' + p + name + '">' + label + '</label>' + input + '</div>';
    }

    function text(p, name, extra) {
        return '<input type="text" id="' + p + name + '" name="' + name + '" class="feriiz-u-259" autocomplete="off"' + (extra || '') + '>';
    }

    function rate(p, name, label) {
        return field(p, name, label,
            '<div class="rate-input"><span class="rate-icon">Rp</span>' +
            '<input type="text" inputmode="numeric" id="' + p + name + '" name="' + name + '" class="feriiz-u-264 js-rupiah" placeholder="0"></div>');
    }

    function formHTML(p, isNew) {
        var days = DAYS.map(function (d) {
            var weekend = d === 'Sat' || d === 'Sun';
            return '<label class="' + (weekend ? 'feriiz-u-051' : 'feriiz-u-049') + '">' +
                '<input type="checkbox" class="feriiz-u-050" name="workingDays" value="' + d + '"> ' + d + '</label>';
        }).join('');

        return '' +
        '<div class="feriiz-u-257">' +
            '<div>' +
                '<div class="feriiz-u-039"><span class="feriiz-u-040">Personal Information</span></div>' +
                '<div class="feriiz-u-258">' +
                    field(p, 'firstName', 'First Name <span class="emp-req">*</span>', text(p, 'firstName')) +
                    field(p, 'middleName', 'Middle Name', text(p, 'middleName', ' placeholder="(Optional)"')) +
                    field(p, 'lastName', 'Last Name', text(p, 'lastName')) +
                '</div>' +
                '<div class="feriiz-u-258">' +
                    field(p, 'code', 'Code', text(p, 'code', ' readonly placeholder="' + (isNew ? 'Created on save' : '') + '"')) +
                    field(p, 'occupation', 'Occupation', text(p, 'occupation', ' list="' + p + 'occupations"') +
                        '<datalist id="' + p + 'occupations">' + occupationOptions() + '</datalist>') +
                    field(p, 'pin', 'Pin', text(p, 'pin', ' inputmode="numeric" maxlength="6"')) +
                '</div>' +
                '<div class="feriiz-u-258">' +
                    field(p, 'phone', 'Mobile', '<input type="tel" id="' + p + 'phone" name="phone" class="feriiz-u-259" autocomplete="off">') +
                    field(p, 'birthDate', 'Date of Birth', '<input type="date" id="' + p + 'birthDate" name="birthDate" class="feriiz-u-259">') +
                    field(p, 'gender', 'Gender', '<select id="' + p + 'gender" name="gender" class="feriiz-u-260">' +
                        '<option value="">-</option><option>Male</option><option>Female</option></select>') +
                '</div>' +
                '<div class="feriiz-u-258">' +
                    field(p, 'status', 'Status', '<select id="' + p + 'status" name="status" class="feriiz-u-260">' +
                        '<option>Active</option><option>Inactive</option></select>') +
                '</div>' +
                '<div class="feriiz-u-224">' +
                    field(p, 'note', 'Note', '<textarea id="' + p + 'note" name="note" class="feriiz-u-261"></textarea>') +
                '</div>' +
                '<div class="feriiz-u-039"><span class="feriiz-u-040">Working Time</span></div>' +
                '<div class="feriiz-u-262">' +
                    field(p, 'startHour', 'Start Hour', '<input type="time" id="' + p + 'startHour" name="startHour" class="feriiz-u-259">') +
                    field(p, 'endHour', 'End Hour', '<input type="time" id="' + p + 'endHour" name="endHour" class="feriiz-u-259">') +
                    field(p, 'cutOff', 'Cut Off Hour', '<input type="time" id="' + p + 'cutOff" name="cutOff" class="feriiz-u-259">') +
                '</div>' +
                '<div class="feriiz-u-048" role="group" aria-label="Working days">' + days + '</div>' +
            '</div>' +
            '<div>' +
                '<div class="feriiz-u-039"><span class="feriiz-u-040">Account Configuration</span></div>' +
                field(p, 'role', 'Role', '<select id="' + p + 'role" name="role" class="feriiz-u-263">' +
                    '<option>Employee</option><option>Admin</option></select>') +
                field(p, 'email', 'Email', '<input type="email" id="' + p + 'email" name="email" class="feriiz-u-264" autocomplete="off">') +
                '<div class="emp-field emp-password"><span class="emp-field-label js-password-label">Password</span>' +
                    (isNew
                        ? '<p class="emp-hint">A link to set the password is emailed after saving.</p>'
                        // After sending, the link takes the button's place so the form keeps its height.
                        : '<button type="button" class="emp-reset-btn js-reset-link"><i class="fa-solid fa-key" aria-hidden="true"></i> Send reset link</button>' +
                          '<div class="emp-reset-row js-reset-box" hidden>' +
                              '<input type="text" class="feriiz-u-259" readonly aria-label="Reset link">' +
                              '<button type="button" class="emp-copy-btn js-copy-link" aria-label="Copy link"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>' +
                          '</div>') +
                '</div>' +
                '<div class="feriiz-u-039"><span class="feriiz-u-040">Payment Rate</span></div>' +
                rate(p, 'dailyRate', 'Daily Rate') +
                rate(p, 'overtimeRate', 'Overtime Rate / Hour') +
                rate(p, 'clientDailyRate', 'Client Daily Rate') +
                rate(p, 'clientOvertimeRate', 'Client Overtime Rate / Hour') +
            '</div>' +
        '</div>';
    }

    function setVal(form, name, value) {
        var el = form.querySelector('[name="' + name + '"]');
        if (el) el.value = value == null ? '' : value;
    }

    function fill(form, employee, project, prefillName) {
        var e = employee || {};
        var n = e.firstName != null
            ? { first: e.firstName, middle: e.middleName || '', last: e.lastName || '' }
            : splitName(e.name || prefillName || '');
        setVal(form, 'firstName', n.first);
        setVal(form, 'middleName', n.middle);
        setVal(form, 'lastName', n.last);
        setVal(form, 'code', e.code || '');
        setVal(form, 'occupation', e.occupation || '');
        setVal(form, 'pin', e.pin || '');
        setVal(form, 'phone', e.phone || '');
        setVal(form, 'birthDate', e.birthDate || '');
        setVal(form, 'gender', e.gender || '');
        setVal(form, 'status', e.status || 'Active');
        setVal(form, 'note', e.note || '');
        setVal(form, 'startHour', e.workStart || (project && project.workStart) || '08:00');
        setVal(form, 'endHour', e.workEnd || (project && project.workEnd) || '17:00');
        setVal(form, 'cutOff', e.cutOff || (project && project.cutOff) || '');
        var days = e.workingDays || (project && project.workingDays) || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        form.querySelectorAll('[name="workingDays"]').forEach(function (cb) { cb.checked = days.indexOf(cb.value) >= 0; });
        setVal(form, 'role', e.role || 'Employee');
        setVal(form, 'email', e.email || '');
        setVal(form, 'dailyRate', rupiah(e.dailyRate));
        setVal(form, 'overtimeRate', rupiah(e.overtimeRate != null ? e.overtimeRate : (project && project.overtimeRate)));
        setVal(form, 'clientDailyRate', rupiah(e.clientDailyRate));
        setVal(form, 'clientOvertimeRate', rupiah(e.clientOvertimeRate != null ? e.clientOvertimeRate : (project && project.clientOvertimeRate)));
        form.querySelectorAll('.emp-invalid').forEach(function (el) { el.classList.remove('emp-invalid'); });
        var box = form.querySelector('.js-reset-box');
        if (box) {
            box.hidden = true;
            form.querySelector('.js-reset-link').hidden = false;
            form.querySelector('.js-password-label').textContent = 'Password';
        }
    }

    function read(form) {
        var v = {};
        ['firstName', 'middleName', 'lastName', 'code', 'occupation', 'pin', 'phone', 'birthDate', 'gender', 'status', 'note',
         'startHour', 'endHour', 'cutOff', 'role', 'email'].forEach(function (k) {
            var el = form.querySelector('[name="' + k + '"]');
            v[k] = el ? el.value.trim() : '';
        });
        ['dailyRate', 'overtimeRate', 'clientDailyRate', 'clientOvertimeRate'].forEach(function (k) {
            v[k] = Number(digits(form.querySelector('[name="' + k + '"]').value)) || 0;
        });
        v.workingDays = Array.prototype.filter.call(form.querySelectorAll('[name="workingDays"]'), function (cb) { return cb.checked; })
            .map(function (cb) { return cb.value; });
        v.name = [v.firstName, v.middleName, v.lastName].filter(Boolean).join(' ');
        return v;
    }

    // Marks wrong fields in red and says what to fix.
    function validate(form, v) {
        var problems = [];
        function check(name, isBad, message) {
            var el = form.querySelector('[name="' + name + '"]');
            el.classList.toggle('emp-invalid', isBad);
            if (isBad) problems.push({ el: el, message: message });
        }
        check('firstName', !v.firstName, 'Enter the first name.');
        check('pin', !!v.pin && !/^\d{4,6}$/.test(v.pin), 'Pin is 4 to 6 digits.');
        check('email', !!v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email), 'Enter a valid email address.');
        check('endHour', !!(v.startHour && v.endHour && v.endHour <= v.startHour), 'End hour is before the start hour.');
        if (problems.length) {
            problems[0].el.focus();
            if (window.FeriizNotify) {
                window.FeriizNotify.warning(problems.map(function (x) { return x.message; }).join(' '), 'Employee not saved');
            }
        }
        return problems.length === 0;
    }

    function bindInputs(form) {
        form.addEventListener('input', function (e) {
            if (e.target.classList.contains('js-rupiah')) {
                var fromEnd = e.target.value.length - e.target.selectionStart;
                e.target.value = rupiah(e.target.value);
                var at = Math.max(0, e.target.value.length - fromEnd);
                e.target.setSelectionRange(at, at);
            }
            if (e.target.name === 'pin') e.target.value = digits(e.target.value).slice(0, 6);
            e.target.classList.remove('emp-invalid');
        });
    }

    function bindReset(form, getEmployee) {
        var resetBtn = form.querySelector('.js-reset-link');
        if (!resetBtn) return;
        resetBtn.addEventListener('click', function () {
            var emailEl = form.querySelector('[name="email"]');
            var email = emailEl.value.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                emailEl.classList.add('emp-invalid');
                emailEl.focus();
                if (window.FeriizNotify) window.FeriizNotify.warning('Add a valid email first; the link is sent there.', 'No email for this employee');
                return;
            }
            // The server will create and email the real link; this shows the same flow.
            var token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
            var base = location.href.replace(/[^/]*([?#].*)?$/, '');
            var box = form.querySelector('.js-reset-box');
            box.querySelector('input').value = base + 'forgot_password.html?token=' + token + '&email=' + encodeURIComponent(email);
            form.querySelector('.js-password-label').textContent = 'Reset link (works for 24 hours)';
            resetBtn.hidden = true;
            box.hidden = false;
            var who = (getEmployee() && getEmployee().name) || 'the employee';
            if (window.FeriizNotify) window.FeriizNotify.success('A password reset link was emailed to ' + email + '. It works for 24 hours.', 'Reset link sent to ' + who);
        });
        form.querySelector('.js-copy-link').addEventListener('click', function () {
            var input = form.querySelector('.js-reset-box input');
            var done = function () { if (window.FeriizNotify) window.FeriizNotify.success('The reset link is on your clipboard.', 'Link copied'); };
            if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, function () { input.select(); });
            else { input.select(); document.execCommand('copy'); done(); }
        });
    }

    /* ---------- overlay (same look as the original Activity form) ---------- */
    var overlay = null;
    var state = { employee: null, project: null, onSave: null, isNew: true };

    function close() {
        overlay.classList.remove('show');
        document.body.style.overflow = state.restoreOverflow || '';
        if (state.returnFocus && state.returnFocus.focus) state.returnFocus.focus();
    }

    function buildOverlay() {
        var el = document.createElement('div');
        el.className = 'modal-overlay emp-form-overlay';
        el.id = 'employeeFormOverlay';
        el.innerHTML =
            '<div class="modal-card feriiz-u-252" role="dialog" aria-modal="true" aria-labelledby="employeeFormTitle">' +
                '<div class="modal-header feriiz-u-253">' +
                    '<h2 id="employeeFormTitle" class="feriiz-u-254">Employee Detail</h2>' +
                    '<button type="button" class="feriiz-u-255 js-close" aria-label="Close">&times;</button>' +
                '</div>' +
                '<form class="feriiz-u-256 emp-form" id="employeeForm" novalidate></form>' +
                '<div class="feriiz-u-266">' +
                    '<button type="submit" form="employeeForm" class="btn btn-primary feriiz-u-056" id="employeeFormSave">Save Changes</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('.js-close').addEventListener('click', close);
        el.addEventListener('click', function (e) { if (e.target === el) close(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && el.classList.contains('show')) close();
        });
        bindInputs(el.querySelector('#employeeForm'));
        el.querySelector('#employeeForm').addEventListener('submit', function (e) {
            e.preventDefault();
            var v = read(e.target);
            if (!validate(e.target, v)) return;
            var isNew = state.isNew;
            if (state.onSave) state.onSave(v, isNew);
            close();
            if (window.FeriizNotify) {
                window.FeriizNotify.success(v.name + (isNew ? ' was added.' : ' was updated.'), isNew ? 'Employee added' : 'Employee updated');
            }
        });
        return el;
    }

    window.FeriizEmployeeForm = {
        open: function (opts) {
            opts = opts || {};
            if (!overlay) overlay = buildOverlay();
            state.employee = opts.employee || null;
            state.project = opts.project || null;
            state.onSave = opts.onSave || null;
            state.isNew = !state.employee;
            var form = overlay.querySelector('#employeeForm');
            form.innerHTML = formHTML('ef' + (++uid) + '-', state.isNew);
            bindReset(form, function () { return state.employee; });
            fill(form, state.employee, state.project, opts.prefillName);
            overlay.querySelector('#employeeFormTitle').textContent = state.isNew ? 'Add Employee' : 'Employee Detail';
            // Opened from another overlay (Manage Employees) the page stays locked after closing.
            if (!overlay.classList.contains('show')) {
                state.restoreOverflow = document.body.style.overflow;
                state.returnFocus = document.activeElement;
            }
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
            var first = form.querySelector('[name="firstName"]');
            if (first) first.focus();
        },
        mount: function (container, opts) {
            opts = opts || {};
            var p = 'efi' + (++uid) + '-';
            container.innerHTML = '<form class="emp-form emp-form-inline" novalidate>' + formHTML(p, !opts.employee) +
                '<div class="emp-form-actions"><button type="submit" class="btn btn-primary feriiz-u-056">Save Changes</button></div></form>';
            var form = container.querySelector('form');
            bindInputs(form);
            bindReset(form, function () { return opts.employee; });
            fill(form, opts.employee, opts.project);
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var v = read(form);
                if (!validate(form, v)) return;
                if (opts.onSave) opts.onSave(v, !opts.employee);
                if (window.FeriizNotify) window.FeriizNotify.success(v.name + ' was updated.', 'Employee updated');
            });
            return form;
        }
    };
})();
