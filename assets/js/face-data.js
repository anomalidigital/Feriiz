/* =============================================
   FERIIZ — Face Data (24-11-2026).
   The face photos the face recognition learns an employee from: a master data set per
   employee, more than one photo each (Raden for Mas Jamal: "master data foto foto mukanya…
   kaya dataset foto muka buat ai nya… ada banyak bisa lebih dari 1"). Not the attendance
   photos: those are Project > Activity's "Show Activity" column.

   Where: a "Face Data" section of the employee form, under Working Time (Baldy, 24-11-2026:
   "taro sini aja kali ya, di bawah nya kosong nih"; it was a window of its own, v3.7.144).
   Like every field of that form, what is added or removed is kept with Save Changes and
   dropped when the form is closed without it. Only there: no Face Data column on the Employees
   table (Baldy, 24-11-2026: "gausah adain fild list face data ya… kalau mau lihat ya di employee
   detail nya"; the column was not asked for).
   A photo clicked opens whole (the grid crops it square) in a viewer, with the previous /
   next photo (Raden, 24-11-2026: "bisa diklik buat liat lengkap fotonya ya, dipakein dialog").

   Until the API has them, sample employees get placeholder silhouettes (no real faces), and
   added photos are made small (720 px) and kept in this browser (feriiz_face_data_v1).

   FeriizFaceData.photos(employee)            -> [{ id, src, at }]
   FeriizFaceData.editor(box, employee, opts) -> the form section in box; .list(), .focus()
       opts.host: the element the viewer goes in (the form's overlay); opts.name(): the name
   FeriizFaceData.setPhotos(employee, list)   -> keeps the list as the employee's photos
   ============================================= */
(function () {
    'use strict';

    var KEY = 'feriiz_face_data_v1';
    var MAX_SIDE = 720;                     // px, the longest side of a kept photo (big enough to view whole)
    var MAX_FILE = 10 * 1024 * 1024;        // 10 MB a file
    var store = load();

    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function plural(n, one, many) { return n.toLocaleString('id-ID') + ' ' + (n === 1 ? one : many); }

    function notify(kind, text, title) { if (window.FeriizNotify) window.FeriizNotify[kind](text, title); }

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }

    // False when the browser has no room left: the photos then stay for this page only.
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch (e) { return false; }
    }

    /* ---------- sample photos (placeholders, never real faces) ---------- */
    function hash(text) {
        var h = 0;
        for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
        return h;
    }

    // Front, turned left, turned right; four light grounds, as photos taken in different places.
    function silhouette(pose, tone) {
        var grounds = ['#E6EDF4', '#ECEFE6', '#F2ECE6', '#E9E7F1'];
        var dx = pose === 1 ? -7 : pose === 2 ? 7 : 0;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 120 120">' +
            '<rect width="120" height="120" fill="' + grounds[tone % grounds.length] + '"/>' +
            '<path d="M16 120c4-27 21-39 44-39s40 12 44 39z" fill="#B9C4CF"/>' +
            '<ellipse cx="' + (60 + dx) + '" cy="52" rx="20" ry="25" fill="#9DABBA"/></svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // A date as YYYY-MM-DD in local time (toISOString would give the day before, east of UTC).
    function isoDate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function addDays(iso, n) {
        var d = new Date((iso || '2026-10-09') + 'T00:00:00');
        if (isNaN(d)) d = new Date('2026-10-09T00:00:00');
        d.setDate(d.getDate() + n);
        return isoDate(d);
    }

    // 0 to 4 sample photos an employee, the same every time; about one in six has none.
    function samples(emp) {
        var h = hash(emp.code || emp.name || '');
        var n = [0, 1, 2, 3, 3, 4][h % 6];
        var list = [];
        for (var i = 0; i < n; i++) {
            list.push({ id: 's' + i, src: silhouette(i % 3, (h >>> 3) + i), at: addDays(emp.joinedAt, i) });
        }
        return list;
    }

    function photos(emp) {
        if (!emp) return [];
        var e = store[emp.code] || { added: [], removed: {} };
        return samples(emp).filter(function (p) { return !e.removed[p.id]; }).concat(e.added);
    }

    // The list (from the form) as the employee's photos: samples not in it are removed.
    function setPhotos(emp, list) {
        var keep = {};
        list.forEach(function (p) { keep[p.id] = true; });
        var removed = {};
        samples(emp).forEach(function (p) { if (!keep[p.id]) removed[p.id] = true; });
        store[emp.code] = {
            added: list.filter(function (p) { return p.id.charAt(0) !== 's'; }),
            removed: removed
        };
        var kept = save();
        if (!kept) notify('warning', 'This browser has no room left to keep the photos, so they stay until the page is closed.', 'Photos not kept');
        return kept;
    }

    function longDate(iso) {
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d)) return '';
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    }

    /* ---------- the photo viewer ----------
       One per host (the form's overlay). Its Esc closes the viewer only: stopped before it
       reaches the form, which closes on Esc. */
    function viewerOf(host) {
        if (host._facdViewer) return host._facdViewer;
        var el = document.createElement('div');
        el.className = 'facd-viewer';
        el.hidden = true;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'facdViewerTitle');
        el.innerHTML =
            '<div class="facd-viewer-bar">' +
                '<div class="facd-viewer-text">' +
                    '<p class="facd-viewer-title" id="facdViewerTitle"></p>' +
                    '<p class="facd-viewer-meta"></p>' +
                '</div>' +
                '<button type="button" class="facd-viewer-btn" data-close aria-label="Close the photo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
            '</div>' +
            '<div class="facd-viewer-stage" data-backdrop>' +
                '<button type="button" class="facd-viewer-btn is-nav" data-prev aria-label="Previous photo"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
                '<img class="facd-viewer-img" alt="">' +
                '<button type="button" class="facd-viewer-btn is-nav" data-next aria-label="Next photo"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>' +
            '</div>';
        host.appendChild(el);
        var v = { el: el, list: [], at: 0, name: '', onClose: null };
        function show() {
            var p = v.list[v.at];
            var when = longDate(p.at);
            var img = el.querySelector('.facd-viewer-img');
            img.src = p.src;
            img.alt = 'Face photo of ' + v.name + (when ? ', added ' + when : '');
            el.querySelector('.facd-viewer-title').textContent = v.name;
            el.querySelector('.facd-viewer-meta').textContent = 'Photo ' + (v.at + 1) + ' of ' + v.list.length + (when ? ' · Added ' + when : '');
            var many = v.list.length > 1;
            el.querySelector('[data-prev]').hidden = !many;
            el.querySelector('[data-next]').hidden = !many;
        }
        function step(by) {
            if (v.list.length < 2) return;
            v.at = (v.at + by + v.list.length) % v.list.length;
            show();
        }
        function close() {
            el.hidden = true;
            if (v.onClose) v.onClose(v.list[v.at] && v.list[v.at].id);
        }
        el.addEventListener('click', function (e) {
            if (e.target.closest('[data-close]') || e.target.hasAttribute('data-backdrop')) close();
            else if (e.target.closest('[data-prev]')) step(-1);
            else if (e.target.closest('[data-next]')) step(1);
        });
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
            } else if (e.key === 'ArrowLeft') {
                step(-1);
            } else if (e.key === 'ArrowRight') {
                step(1);
            } else if (e.key === 'Tab') {
                // Round its own buttons, not the form under it.
                var stops = Array.prototype.filter.call(el.querySelectorAll('button'), function (b) { return !b.hidden; });
                var i = stops.indexOf(document.activeElement);
                e.preventDefault();
                stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
            }
        });
        v.open = function (list, id, name, onClose) {
            v.list = list;
            v.at = Math.max(0, list.map(function (p) { return p.id; }).indexOf(id));
            v.name = name;
            v.onClose = onClose;
            show();
            el.hidden = false;
            el.querySelector('[data-close]').focus();
        };
        v.hide = function () { el.hidden = true; };
        host._facdViewer = v;
        return v;
    }

    /* ---------- adding photos ---------- */
    // A photo made small enough to keep: the longest side MAX_SIDE, as a JPEG.
    function shrink(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = reject;
            reader.onload = function () {
                var img = new Image();
                img.onerror = reject;
                img.onload = function () {
                    var k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * k);
                    canvas.height = Math.round(img.height * k);
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';            // a see-through PNG on white, not black
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // The photos from these files ([] when none is a photo), with a message for the others.
    function readFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        var good = files.filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= MAX_FILE; });
        var bad = files.length - good.length;
        if (bad) notify('warning', plural(bad, 'file was', 'files were') + ' left out: add JPG or PNG photos of 10 MB or less.', 'Not a photo');
        return Promise.all(good.map(function (f) { return shrink(f).catch(function () { return null; }); })).then(function (srcs) {
            var today = isoDate(new Date());
            var stamp = Date.now().toString(36);
            var list = [];
            srcs.forEach(function (src, i) { if (src) list.push({ id: 'p' + stamp + i, src: src, at: today }); });
            if (list.length < good.length) notify('warning', plural(good.length - list.length, 'photo', 'photos') + ' could not be read.', 'Not added');
            return list;
        });
    }

    function hasFiles(e) {
        return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
    }

    /* ---------- the form section ---------- */
    function editor(box, emp, opts) {
        opts = opts || {};
        var draft = photos(emp);
        var savedIds = draft.map(function (p) { return p.id; }).join('|');
        var host = opts.host || document.body;
        var nameOf = function () { return (opts.name && opts.name()) || (emp && emp.name) || 'this employee'; };

        box.classList.add('facd-editor');
        box.innerHTML =
            '<div class="feriiz-u-039 facd-head"><span class="feriiz-u-040">Face Data</span><span class="facd-count"></span></div>' +
            '<p class="facd-intro">The face recognition learns this employee from these photos. Add a few, from different angles and light; click a photo to see it whole.</p>' +
            '<input type="file" class="facd-file" accept="image/jpeg,image/png,image/webp" multiple hidden>' +
            '<div class="facd-grid"></div>' +
            '<p class="facd-pending" hidden><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Photo changes are kept when you press Save Changes.</p>' +
            '<div class="facd-drop" aria-hidden="true"><i class="fa-solid fa-cloud-arrow-up"></i> Drop the photos to add them</div>';
        var grid = box.querySelector('.facd-grid');
        var file = box.querySelector('.facd-file');

        function tileHTML(p) {
            var when = longDate(p.at);
            var what = 'the photo' + (when ? ' added ' + when : '');
            return '<div class="facd-tile">' +
                '<button type="button" class="facd-view" data-view="' + esc(p.id) + '" aria-label="See ' + what + ' whole" title="' + (when ? 'Added ' + when : '') + '">' +
                    '<img src="' + p.src + '" alt="">' +
                    '<span class="facd-zoom" aria-hidden="true"><i class="fa-solid fa-expand"></i></span>' +
                '</button>' +
                '<button type="button" class="facd-remove" data-remove="' + esc(p.id) + '" aria-label="Remove ' + what + '" title="Remove">' +
                    '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
            '</div>';
        }

        function render() {
            box.querySelector('.facd-count').textContent = draft.length ? plural(draft.length, 'photo', 'photos') : 'No photos';
            box.querySelector('.facd-count').classList.toggle('is-empty', !draft.length);
            grid.innerHTML =
                '<button type="button" class="facd-add" data-add>' +
                    '<i class="fa-solid fa-camera" aria-hidden="true"></i><span class="facd-add-title">Add photos</span>' +
                '</button>' +
                (draft.length ? draft.map(tileHTML).join('')
                              : '<p class="facd-empty">No photos yet. The face recognition cannot recognize this employee until one is added.</p>');
            box.querySelector('.facd-pending').hidden = draft.map(function (p) { return p.id; }).join('|') === savedIds;
        }

        function add(fileList) {
            readFiles(fileList).then(function (list) {
                if (!list.length) return;
                draft = draft.concat(list);
                render();
                notify('success', plural(list.length, 'photo was', 'photos were') + ' added. Press Save Changes to keep ' + (list.length === 1 ? 'it' : 'them') + '.', 'Photos added');
            });
        }

        function focusOn(id) {
            var el = id && grid.querySelector('[data-view="' + id + '"]');
            (el || grid.querySelector('[data-add]')).focus();
        }

        grid.addEventListener('click', function (e) {
            if (e.target.closest('[data-add]')) { file.click(); return; }
            var rm = e.target.closest('[data-remove]');
            if (rm) {
                var at = draft.map(function (p) { return p.id; }).indexOf(rm.dataset.remove);
                draft = draft.filter(function (p) { return p.id !== rm.dataset.remove; });
                render();
                // The focus goes to the photo that took its place, else the one before, else Add.
                var next = draft[Math.min(at, draft.length - 1)];
                var target = next && grid.querySelector('[data-remove="' + next.id + '"]');
                (target || grid.querySelector('[data-add]')).focus();
                return;
            }
            var view = e.target.closest('[data-view]');
            if (view) viewerOf(host).open(draft.slice(), view.dataset.view, nameOf(), focusOn);
        });
        file.addEventListener('change', function () {
            add(file.files);
            file.value = '';
        });
        // Photos dropped on the section are added.
        var depth = 0;
        box.addEventListener('dragenter', function (e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth++;
            box.classList.add('is-dragging');
        });
        box.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
        box.addEventListener('dragleave', function () {
            depth = Math.max(0, depth - 1);
            if (!depth) box.classList.remove('is-dragging');
        });
        box.addEventListener('drop', function (e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            box.classList.remove('is-dragging');
            add(e.dataTransfer.files);
        });

        if (host._facdViewer) host._facdViewer.hide();
        render();
        return {
            list: function () { return draft.slice(); },
            changed: function () { return draft.map(function (p) { return p.id; }).join('|') !== savedIds; },
            focus: function () {
                box.scrollIntoView({ block: 'center' });
                grid.querySelector('[data-add]').focus({ preventScroll: true });
            }
        };
    }

    window.FeriizFaceData = {
        photos: photos,
        count: function (emp) { return photos(emp).length; },
        editor: editor,
        setPhotos: setPhotos
    };
})();
