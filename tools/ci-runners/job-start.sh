#!/usr/bin/env bash
set -euo pipefail
python3 /opt/vantare-hooks/job-guard.py
python3 /opt/vantare-hooks/cleanup.py
