#!/bin/sh
# Dokploy Schedule: boşluksuz tek komut — sh -c quoting sorununu önler.
set -e
wget -qO- "http://127.0.0.1:${PORT:-3000}/api/nightly"
echo
