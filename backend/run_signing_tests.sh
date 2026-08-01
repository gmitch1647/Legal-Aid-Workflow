#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 -m unittest tests.test_signing_pdf_normalization tests.test_esign_in_app_sessions
