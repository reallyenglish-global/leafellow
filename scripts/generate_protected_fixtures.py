#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Regenerate original blank encrypted-PDF fixtures, not user documents.

uv run --with pypdf==6.21.4 python scripts/generate_protected_fixtures.py
The dependency version in the command must be checked against the environment
when regenerating; fixture bytes themselves are checked into tests.
"""
import base64
import io
import json
from pathlib import Path
from pypdf import PdfWriter

fixtures = {}
for label, password in [('password_required', 'leafellow-fixture-only'), ('owner_only', '')]:
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.encrypt(password, owner_password='leafellow-owner-fixture-only', algorithm='RC4-128')
    stream = io.BytesIO()
    writer.write(stream)
    fixtures[label] = base64.b64encode(stream.getvalue()).decode('ascii')
path = Path(__file__).resolve().parents[1] / 'tests' / 'protected-pdf.json'
path.write_text(json.dumps(fixtures, indent=2) + '\n')
print('Generated original blank encrypted-PDF fixtures:', path.name)
