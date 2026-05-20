#!/usr/bin/env bash
# mirror-openfreemap.sh — mirror an OpenFreeMap style and all its referenced
# assets (sprites, font glyphs, Natural Earth hillshade rasters) to a local
# directory tree suitable for serving from an airgapped nginx host.
#
# Usage:
#   ./mirror-openfreemap.sh [STYLE] [OUTDIR]
#
#   STYLE  : liberty | positron | bright | fiord   (default: liberty)
#   OUTDIR : output directory                       (default: ./out)
#
# Run this on a machine with internet access. Ship the resulting OUTDIR
# across the airgap into the tile server's data/ directory.
#
# Requires: bash 4+, curl, jq.
# Output size: ~380 MB regardless of style. Hillshade rasters dominate
# (~340 MB), fonts add ~40 MB, sprites and style JSON are negligible.

set -euo pipefail

STYLE="${1:-liberty}"
OUT="${2:-./out}"
BASE="https://tiles.openfreemap.org"
PARALLEL="${PARALLEL:-8}"  # concurrent downloads (override with PARALLEL=N)

case "$STYLE" in
  liberty|positron|bright|fiord) ;;
  *) echo "error: STYLE must be one of liberty, positron, bright, fiord (got: $STYLE)" >&2
     exit 1 ;;
esac

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "error: '$tool' is required but not installed" >&2
    exit 1
  }
done

mkdir -p "$OUT/styles" "$OUT/fonts" "$OUT/sprites/ofm_f384" "$OUT/natural_earth/ne2sr"

# 1. Style JSON ---------------------------------------------------------------
echo "==> Downloading style: $STYLE"
curl -fsSL "$BASE/styles/$STYLE" -o "$OUT/styles/$STYLE.json"

# 2. Sprites (4 small files) --------------------------------------------------
echo "==> Downloading sprites"
for f in ofm.json ofm.png ofm@2x.json ofm@2x.png; do
  curl -fsSL "$BASE/sprites/ofm_f384/$f" -o "$OUT/sprites/ofm_f384/$f"
done

# 3. Font glyph atlases ------------------------------------------------------
# Each font stack referenced by the style needs 256 range files
# (0-255, 256-511, ..., 65280-65535). Some ranges are sparse and return 404 —
# that's expected and harmless.
echo "==> Discovering font stacks referenced by $STYLE"
# Portable array load (bash 3.2 on macOS lacks mapfile).
STACKS=()
while IFS= read -r line; do
  STACKS+=("$line")
done < <(jq -r '
  [.layers[]?.layout."text-font"? // empty | .[]] | unique | .[]
' "$OUT/styles/$STYLE.json")

echo "    Found ${#STACKS[@]} font stack(s): ${STACKS[*]}"

for stack in "${STACKS[@]}"; do
  enc=$(jq -rn --arg s "$stack" '$s | @uri')
  mkdir -p "$OUT/fonts/$stack"
  echo "==> Downloading font stack: $stack (256 range files, $PARALLEL parallel)"
  # Generate the 256 range strings, pipe to xargs for parallel curl.
  # || true: sparse ranges legitimately 404 — don't fail the whole mirror.
  for start in $(seq 0 256 65280); do
    end=$((start + 255))
    printf '%s-%s\n' "$start" "$end"
  done | xargs -n 1 -P "$PARALLEL" -I {} sh -c \
    "curl -fsSL '$BASE/fonts/$enc/{}.pbf' -o '$OUT/fonts/$stack/{}.pbf' 2>/dev/null || true"
done

# 4. Natural Earth hillshade --------------------------------------------------
# All four OpenFreeMap styles reference the same ne2_shaded raster source at
# z0-z6, so we mirror these unconditionally. ~5,500 tiles, ~80 MB.
echo "==> Downloading Natural Earth hillshade rasters (z0-z6, ~5,500 tiles, ~80 MB, $PARALLEL parallel)"
# Emit "z x y" triples to stdout, then xargs -P parallelizes curl.
for z in 0 1 2 3 4 5 6; do
  max=$(( (1 << z) - 1 ))
  for x in $(seq 0 "$max"); do
    mkdir -p "$OUT/natural_earth/ne2sr/$z/$x"
    for y in $(seq 0 "$max"); do
      printf '%s %s %s\n' "$z" "$x" "$y"
    done
  done
done | xargs -n 3 -P "$PARALLEL" sh -c \
  'z=$1; x=$2; y=$3
   curl -fsSL "'"$BASE"'/natural_earth/ne2sr/$z/$x/$y.png" \
     -o "'"$OUT"'/natural_earth/ne2sr/$z/$x/$y.png" 2>/dev/null || true' _

# 5. Rewrite style URLs to point at the airgapped server ---------------------
# Produces $STYLE.airgapped.json alongside the original. The airgapped variant
# is the one you point Maps+ at via the MapLibre Style URL formatter field.
INTERNAL="${INTERNAL_BASE_URL:-https://tiles.corp.internal}"
echo "==> Rewriting style URLs to point at $INTERNAL"
echo "    (override by setting INTERNAL_BASE_URL before running this script)"

jq --arg base "$INTERNAL" '
  .glyphs = ($base + "/fonts/{fontstack}/{range}.pbf")
  | .sprite = ($base + "/sprites/ofm_f384/ofm")
  | (.sources.ne2_shaded.tiles?) |= (
      if . then map(sub("https://tiles\\.openfreemap\\.org"; $base)) else . end
    )
  | (.sources.openmaptiles.url?) |= (
      if . then sub("https://tiles\\.openfreemap\\.org/planet"; $base + "/data/v3.json") else . end
    )
' "$OUT/styles/$STYLE.json" > "$OUT/styles/$STYLE.airgapped.json"

echo ""
echo "Done. Total mirrored size:"
du -sh "$OUT"
echo ""
echo "Next steps:"
echo "  1. Ship $OUT/ across the airgap into your tile server's data/ directory."
echo "  2. Point Maps+ at: $INTERNAL/styles/$STYLE.airgapped.json"
echo "     (or override INTERNAL_BASE_URL and re-run if the hostname is different)"
