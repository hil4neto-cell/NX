#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output_dir="$repo_root/dist-site"

rm -rf "$output_dir"
mkdir -p "$output_dir"

for file in index.html cliente.html corporativo.html links.html style.css gateway.css script.js; do
  cp "$repo_root/$file" "$output_dir/$file"
done

cp -R "$repo_root/assets" "$output_dir/assets"
cp -R "$repo_root/public" "$output_dir/public"

npm run build --prefix "$repo_root/apps/nxgeo"

test -f "$output_dir/index.html"
test -f "$output_dir/nxgeo/index.html"
test ! -e "$output_dir/docs_e_config"
test ! -e "$output_dir/Plano_Vendas_NX.doc"
test ! -e "$output_dir/server.ps1"
