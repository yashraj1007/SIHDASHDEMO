# ThermoTwin - complete Vercel project

This repository contains the original Wellbore Sentry static site, its Intelligence & Trust layer, the separate React prototype, and a FastAPI simulation API. All values and outputs are synthetic; this project is not connected to field equipment or measured data.

## Vercel project settings

1. Extract the complete project ZIP and push the extracted folder contents to the repository root. The root must contain `vercel.json` and the `site`, `frontend`, and `backend` folders.
2. In Vercel, import that repository and set **Root Directory** to `./` (the folder containing `vercel.json`).
3. In **Settings -> Build & Deployment**, set the project framework preset to **Services**. This is required for Vercel's multi-service `services` configuration.
4. Deploy. The per-service roots and routes are already defined in `vercel.json`; do not set one shared build command or output directory.

## Deployed paths

- `/` - original Wellbore Sentry site and 3D model, including Intelligence & Trust.
- `/api/...` - FastAPI simulation endpoints.
- `/docs` and `/openapi.json` - API documentation and schema.
- `/react/` - the separate React prototype, configured to call `/api` on the same deployment.

The React frontend also works locally with Vite's `/api` proxy when the FastAPI server is running at `127.0.0.1:8000`. The static site can be previewed with `python site/serve.py` at `http://127.0.0.1:8765/`.

## Limitations

Data is illustrative and synthetic. Browser audit/history from the static site remains in that browser's local storage; it is not synced to Vercel or other visitors. The API and React prototype do not provide persistent field telemetry, a calibrated model, or live equipment controls.
