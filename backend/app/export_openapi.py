"""Write the OpenAPI spec for the frontend client: uv run python -m app.export_openapi ../frontend/openapi.json"""

import json
import os
import sys

os.environ.setdefault("ENCRYPTION_KEYS", "ZmFrZS1rZXktZm9yLW9wZW5hcGktZXhwb3J0LW9ubHk=")

from app.main import app

target = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
with open(target, "w") as fh:
    json.dump(app.openapi(), fh, indent=2)
print(f"wrote {target}")
