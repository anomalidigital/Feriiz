/* =============================================
   FERIIZ — Face Data (Employees page, 24-11-2026).
   The face photos the face recognition learns an employee from: a master data set per
   employee, more than one photo each (Raden for Mas Jamal: "master data foto foto mukanya…
   kaya dataset foto muka buat ai nya… ada banyak bisa lebih dari 1"). Not the attendance
   photos: those are Project > Activity's "Show Activity" column.

   One window per employee, laid out like Manage Occupations: photos in a grid with a tick
   each, "Add photos" (pick or drop JPG / PNG files), and Delete that shows only once photos
   are ticked, asking first. A change is kept at once, as in Manage Occupations.
   A photo clicked opens whole (the grid crops it square) in a viewer over the window, with
   the previous / next photo (Raden, 24-11-2026: "bisa diklik buat liat lengkap fotonya ya,
   dipakein dialog").

   Until the API has them, sample employees get placeholder silhouettes (no real faces), and
   added photos are made small (480 px) and kept in this browser (feriiz_face_data_v1).

   FeriizFaceData.count(employee)         -> how many photos
   FeriizFaceData.cellHTML(employee)      -> the Employees table cell (a button)
   FeriizFaceData.open(employee, onChange) -> the window; onChange() after each change
   ============================================= */
(function () {
    'use strict';

    var KEY = 'feriiz_face_data_v1';
    var MAX_SIDE = 720;                     // px, the longest side of a kept photo (big enough to view whole)
    var MAX_FILE = 10 * 1024 * 1024;        // 10 MB a file
    var store = load();
    var modal = null;
    var current = null;                     // the employee whose window is open
    var onChange = null;
    var picked = {};                        // photo id -> true
    var asking = false;
    var viewer = null;                      // the photo viewer, inside the window
    var viewList = [];
    var viewAt = 0;

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

    function entry(code) {
        if (!store[code]) store[code] = { added: [], removed: {} };
        return store[code];
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
            list.push({ id: 's' + i, src: silhouette(i % 3, (h >>> 3) + i), at: addDays(emp.joinedAt, i), sample: true });
        }
        return list;
    }

    function photos(emp) {
        var e = store[emp.code] || { added: [], removed: {} };
        return samples(emp).filter(function (p) { return !e.removed[p.id]; }).concat(e.added);
    }

    function longDate(iso) {
        var d = new Date(iso + 'T00:00:00');
        if (isNaN(d)) return '';
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
    }

    /* ---------- the table cell ---------- */
    function cellHTML(emp) {
        var list = photos(emp);
        var label = list.length ? plural(list.length, 'photo', 'photos') : 'No photos';
        var stack = list.slice(0, 3).map(function (p) { return '<img src="' + p.src + '" alt="">'; }).join('');
        return '<button type="button" class="facd-cell' + (list.length ? '' : ' is-empty') + '" data-face="' + esc(emp.code) + '"' +
            ' aria-label="Face Data of ' + esc(emp.name) + ': ' + label + '">' +
            (list.length ? '<span class="facd-stack" aria-hidden="true">' + stack + '</span>'
                         : '<i class="fa-solid fa-circle-plus" aria-hidden="true"></i>') +
            '<span>' + label + '</span></button>';
    }

    /* ---------- the window ---------- */
    function build() {
        var el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'faceDataModal';
        el.tabIndex = -1;
        el.setAttribute('aria-labelledby', 'faceDataTitle');
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable facd-dialog">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div>' +
                            '<h2 class="modal-title" id="faceDataTitle">Face Data</h2>' +
                            '<p class="tpl-subtitle" id="facdContext"></p>' +
                        '</div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body facd-body" id="facdBody">' +
                        '<p class="facd-intro">The face recognition learns this employee from these photos. Add a few, from different angles and light; one clear face in each. Click a photo to see it whole.</p>' +
                        '<input type="file" id="facdFile" accept="image/jpeg,image/png,image/webp" multiple hidden>' +
                        '<div class="facd-grid" id="facdGrid"></div>' +
                        '<div class="facd-drop" aria-hidden="true"><i class="fa-solid fa-cloud-arrow-up"></i> Drop the photos to add them</div>' +
                    '</div>' +
                    '<div class="modal-footer occm-foot facd-foot" id="facdFoot" aria-live="polite"></div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        el.querySelector('#facdFile').addEventListener('change', function (e) {
            addFiles(e.target.files);
            e.target.value = '';
        });
        el.querySelector('#facdGrid').addEventListener('click', function (e) {
            if (e.target.closest('[data-add]')) el.querySelector('#facdFile').click();
            var view = e.target.closest('[data-view]');
            if (view) openViewer(view.dataset.view);
        });
        el.querySelector('#facdGrid').addEventListener('change', onTick);
        el.querySelector('#facdFoot').addEventListener('click', onFootClick);
        // Dropping photos anywhere on the window adds them.
        var body = el.querySelector('#facdBody');
        var depth = 0;
        body.addEventListener('dragenter', function (e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth++;
            body.classList.add('is-dragging');
        });
        body.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
        body.addEventListener('dragleave', function () {
            depth = Math.max(0, depth - 1);
            if (!depth) body.classList.remove('is-dragging');
        });
        body.addEventListener('drop', function (e) {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            body.classList.remove('is-dragging');
            addFiles(e.dataTransfer.files);
        });
        el.addEventListener('hidden.bs.modal', function () {
            asking = false;
            picked = {};
            if (viewer) viewer.hidden = true;
        });
        return el;
    }

    /* ---------- the photo viewer ----------
       Inside the window's element, so Bootstrap's focus trap keeps the focus in it, and its
       Esc closes the viewer only (stopped before it reaches the window). */
    function buildViewer() {
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
                    '<p class="facd-viewer-meta" id="facdViewerMeta"></p>' +
                '</div>' +
                '<button type="button" class="facd-viewer-btn" data-close aria-label="Close the photo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
            '</div>' +
            '<div class="facd-viewer-stage" data-backdrop>' +
                '<button type="button" class="facd-viewer-btn is-nav" data-prev aria-label="Previous photo"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
                '<img class="facd-viewer-img" id="facdViewerImg" alt="">' +
                '<button type="button" class="facd-viewer-btn is-nav" data-next aria-label="Next photo"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>' +
            '</div>';
        modal.appendChild(el);
        el.addEventListener('click', function (e) {
            if (e.target.closest('[data-close]') || e.target.hasAttribute('data-backdrop')) closeViewer();
            else if (e.target.closest('[data-prev]')) stepViewer(-1);
            else if (e.target.closest('[data-next]')) stepViewer(1);
        });
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeViewer();
            } else if (e.key === 'ArrowLeft') {
                stepViewer(-1);
            } else if (e.key === 'ArrowRight') {
                stepViewer(1);
            } else if (e.key === 'Tab') {
                // Round its own buttons, not the window under it.
                var stops = Array.prototype.filter.call(el.querySelectorAll('button'), function (b) { return !b.hidden; });
                var i = stops.indexOf(document.activeElement);
                e.preventDefault();
                stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
            }
        });
        return el;
    }

    function showViewerPhoto() {
        var p = viewList[viewAt];
        var when = longDate(p.at);
        var img = viewer.querySelector('#facdViewerImg');
        img.src = p.src;
        img.alt = 'Face photo of ' + current.name + (when ? ', added ' + when : '');
        viewer.querySelector('#facdViewerTitle').textContent = current.name;
        viewer.querySelector('#facdViewerMeta').textContent = 'Photo ' + (viewAt + 1) + ' of ' + viewList.length + (when ? ' \u00b7 Added ' + when : '');
        var many = viewList.length > 1;
        viewer.querySelector('[data-prev]').hidden = !many;
        viewer.querySelector('[data-next]').hidden = !many;
    }

    function openViewer(id) {
        viewList = photos(current);
        viewAt = Math.max(0, viewList.map(function (p) { return p.id; }).indexOf(id));
        if (!viewList.length) return;
        if (!viewer) viewer = buildViewer();
        showViewerPhoto();
        viewer.hidden = false;
        viewer.querySelector('[data-close]').focus();
    }

    function stepViewer(by) {
        if (viewList.length < 2) return;
        viewAt = (viewAt + by + viewList.length) % viewList.length;
        showViewerPhoto();
    }

    // Back on the photo it ended on, in the grid.
    function closeViewer() {
        var id = viewList[viewAt] && viewList[viewAt].id;
        viewer.hidden = true;
        var back = id && modal.querySelector('[data-view="' + id + '"]');
        (back || modal.querySelector('[data-add]')).focus();
    }

    function hasFiles(e) {
        return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
    }

    function tileHTML(p) {
        var on = !!picked[p.id];
        var when = longDate(p.at);
        // The photo opens the viewer; the tick in its corner selects it for Delete.
        return '<div class="facd-tile' + (on ? ' is-picked' : '') + '">' +
            '<button type="button" class="facd-view" data-view="' + esc(p.id) + '" aria-label="See the photo' + (when ? ' added ' + when : '') + ' whole">' +
                '<img src="' + p.src + '" alt="">' +
                '<span class="facd-zoom" aria-hidden="true"><i class="fa-solid fa-expand"></i></span>' +
            '</button>' +
            '<label class="facd-tick"><input type="checkbox" class="form-check-input" data-pick="' + esc(p.id) + '"' + (on ? ' checked' : '') +
                ' aria-label="Tick the photo' + (when ? ' added ' + when : '') + '"></label>' +
            '<span class="facd-date">' + (when ? 'Added ' + when : 'Added') + '</span>' +
        '</div>';
    }

    function addTileHTML(empty) {
        return '<button type="button" class="facd-add' + (empty ? ' is-wide' : '') + '" data-add>' +
            '<i class="fa-solid fa-camera" aria-hidden="true"></i>' +
            '<span class="facd-add-title">Add photos</span>' +
            '<span class="facd-add-hint">JPG or PNG, or drop them here</span>' +
        '</button>';
    }

    function renderFoot() {
        var foot = modal.querySelector('#facdFoot');
        var all = photos(current);
        var list = all.filter(function (p) { return picked[p.id]; });
        foot.hidden = !all.length;              // nothing to tick: no footer
        if (!list.length) {
            asking = false;
            foot.innerHTML = '<span class="occm-hint">Tick photos to delete them.</span>';
            return;
        }
        if (asking) {
            var left = all.length - list.length;
            foot.innerHTML = '<span class="occm-ask">Delete ' + plural(list.length, 'photo', 'photos') + '?' +
                (left ? ' The face recognition stops using ' + (list.length === 1 ? 'it' : 'them') + '.'
                      : ' ' + esc(current.name) + ' will have no photos, so the face recognition cannot recognize them.') + '</span>' +
                '<button type="button" class="btn btn-outline" data-keep>Keep</button>' +
                '<button type="button" class="btn btn-danger" data-confirm>Yes, delete</button>';
            return;
        }
        foot.innerHTML = '<span class="occm-selected">Selected: <strong>' + list.length + '</strong></span>' +
            '<button type="button" class="btn btn-outline-danger" data-delete>' +
                '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> Delete</button>';
    }

    function render() {
        var list = photos(current);
        modal.querySelector('#facdContext').textContent = current.name + ' · ' + current.code + ' · ' +
            (list.length ? plural(list.length, 'photo', 'photos') : 'no photos yet');
        modal.querySelector('#facdGrid').innerHTML = list.length
            ? addTileHTML(false) + list.map(tileHTML).join('')
            : addTileHTML(true) + '<p class="facd-empty">No photos yet. The face recognition cannot recognize ' + esc(current.name) + ' until one is added.</p>';
        renderFoot();
    }

    function changed() { if (onChange) onChange(); }

    function onTick(e) {
        var box = e.target.closest('input[data-pick]');
        if (!box) return;
        if (box.checked) picked[box.dataset.pick] = true;
        else delete picked[box.dataset.pick];
        box.closest('.facd-tile').classList.toggle('is-picked', box.checked);
        asking = false;
        renderFoot();
    }

    function onFootClick(e) {
        if (e.target.closest('[data-delete]')) {
            asking = true;
            renderFoot();
            var keep = modal.querySelector('#facdFoot [data-keep]');
            if (keep) keep.focus();
        } else if (e.target.closest('[data-keep]')) {
            asking = false;
            renderFoot();
            var del = modal.querySelector('#facdFoot [data-delete]');
            if (del) del.focus();
        } else if (e.target.closest('[data-confirm]')) {
            var e2 = entry(current.code);
            var ids = Object.keys(picked);
            ids.forEach(function (id) {
                if (id.charAt(0) === 's') e2.removed[id] = true;
                else e2.added = e2.added.filter(function (p) { return p.id !== id; });
            });
            save();
            picked = {};
            asking = false;
            render();
            changed();
            notify('success', plural(ids.length, 'photo was', 'photos were') + ' deleted from ' + current.name + '’s face data.', 'Photos deleted');
            modal.querySelector('[data-add]').focus();
        }
    }

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

    function addFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length || !current) return;
        var emp = current;
        var good = files.filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= MAX_FILE; });
        var bad = files.length - good.length;
        if (bad) {
            notify('warning', plural(bad, 'file was', 'files were') + ' left out: add JPG or PNG photos of 10 MB or less.', 'Not a photo');
        }
        if (!good.length) return;
        Promise.all(good.map(function (f) { return shrink(f).catch(function () { return null; }); })).then(function (srcs) {
            var today = isoDate(new Date());
            var e = entry(emp.code);
            var added = 0;
            srcs.forEach(function (src, i) {
                if (!src) return;
                e.added.push({ id: 'p' + Date.now().toString(36) + i, src: src, at: today });
                added++;
            });
            var kept = save();
            if (current === emp) render();
            changed();
            if (added) {
                notify('success', plural(added, 'photo was', 'photos were') + ' added to ' + emp.name + '’s face data.' +
                    (kept ? '' : ' This browser has no room left to keep them, so they stay until the page is closed.'), 'Photos added');
            }
            if (added < good.length) notify('warning', plural(good.length - added, 'photo', 'photos') + ' could not be read.', 'Not added');
        });
    }

    window.FeriizFaceData = {
        count: function (emp) { return photos(emp).length; },
        cellHTML: cellHTML,
        open: function (emp, callback) {
            if (!emp || !window.bootstrap) return;
            current = emp;
            onChange = callback || null;
            picked = {};
            asking = false;
            if (!modal) modal = build();
            render();
            window.bootstrap.Modal.getOrCreateInstance(modal).show();
        }
    };
})();
