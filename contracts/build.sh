#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p build

echo "=== Building Morpheus Contracts ==="
for d in MorpheusOracle OracleCallbackConsumer; do
  if [ -f "$d/$d.csproj" ]; then
    echo "Building $d..."
    dotnet build "$d/$d.csproj" -c Release
    if [ -x ~/.dotnet/tools/nccs ]; then
      ~/.dotnet/tools/nccs "$d/$d.csproj" --generate-artifacts All --output ./build/ || echo "nccs skipped for $d"
    else
      echo "nccs not found; skipped artifact generation for $d"
    fi
  fi
done

echo "=== Build Complete ==="
