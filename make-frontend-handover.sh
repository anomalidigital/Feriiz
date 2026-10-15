#!/bin/sh
# Menyusun ulang folder frontend-handover/ dari isi repo.
#
# Foldernya sengaja berisi salinan, bukan tautan, supaya bisa langsung
# di-zip dan dikirim. Repo tetap sumber kebenarannya - jalankan ulang skrip
# ini kalau kodenya berubah.
set -e
root=$(cd "$(dirname "$0")" && pwd)
out="$root/frontend-handover"

# Dokumen ditulis tangan, jangan ikut terhapus.
tmp=$(mktemp -d)
[ -d "$out/docs" ] && cp -r "$out/docs" "$tmp/docs"
[ -f "$out/README.md" ] && cp "$out/README.md" "$tmp/README.md"

rm -rf "$out/html" "$out/blazor" "$out/data"
mkdir -p "$out/html" "$out/blazor"

# 1. Situs HTML yang sekarang jalan di produksi.
cp -r "$root/legacy-html/." "$out/html/"
cp -r "$root/assets" "$out/html/assets"

# 2. Port Blazor.
mkdir -p "$out/blazor/Feriiz.Web"
cd "$root/src/Feriiz.Web"
find . -type f \
    -not -path './bin/*' -not -path './obj/*' \
    -not -path './wwwroot/assets/*' -not -name 'feriiz-data.json' \
    -exec cp --parents {} "$out/blazor/Feriiz.Web/" \;
cd "$root"

# 3. Dataset dummy. Ditaruh di dalam html/ karena di situlah data.js
#    mencarinya - di sebelah folder assets/. Blazor menyalin dari sini juga,
#    jadi tidak perlu salinan kedua: berkasnya 20 MB.
cp "$root/feriiz-data.json" "$out/html/feriiz-data.json"

echo "frontend-handover siap:"
du -sh "$out"/* 2>/dev/null | sed 's/^/  /'
