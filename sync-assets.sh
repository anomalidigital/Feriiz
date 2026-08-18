#!/bin/sh
# Copies the shared assets into the Blazor wwwroot.
#
# The stylesheet, images and dataset are still owned by the static site at the
# repo root - that is the one copy git tracks. Blazor's static-web-assets
# pipeline only picks up files physically inside the project's wwwroot, so they
# are mirrored in here (gitignored) instead of being linked from the csproj.
#
# Re-run after editing assets/css/style.css or feriiz-data.json.
set -e
root=$(dirname "$0")
dest="$root/src/Feriiz.Web/wwwroot"

rm -rf "$dest/assets"
cp -r "$root/assets" "$dest/assets"
cp "$root/feriiz-data.json" "$dest/feriiz-data.json"

echo "synced -> $dest/assets, $dest/feriiz-data.json"
