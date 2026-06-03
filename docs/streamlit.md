# Streamlit Runtime

## Overview

`land-map2` includes a Streamlit UI in `main.py` that shares the same Python service layer as the Flask app.

Primary files:

- `main.py`
- `components/sidebar.py`
- `components/map_viewer.py`
- `utils/st_utils.py`
- `utils/lion.py`

The Streamlit runtime is a separate UI, not a thin wrapper around the browser frontend.

## Shared Backend Services with Flask

Streamlit and Flask are two different runtime surfaces over the same backend logic.

What is shared:

- `services/landmark_service.py`
- `services/location_service.py`
- `services/llm_service.py`
- `services/image_service.py`
- `components/cache_manager.py`
- `utils/config_utils.py`
- `utils/coord_utils.py`
- `utils/prompt_utils.py`
- `utils/lion.py` for the Python-side i18n layer

What is different:

- Flask exposes those capabilities through HTTP endpoints in `components/endpoints.py`
- Streamlit calls the same Python services directly from `main.py` and sidebar actions
- Streamlit has its own UI state in `st.session_state`, while Flask serves the browser app shell and APIs

This means the two runtimes usually share:

- the same config defaults from `public/config.json`
- the same test-mode behavior
- the same cache files under `cache/`
- the same prompt templates from `public/prompts.toml`
- the same environment variables for Google/OpenAI/Gemini-backed services

In practice, a bug or behavior change in `LandmarkService`, `LocationService`, or `LLMService` often affects both Flask and Streamlit, even if the visible UI is different.

## Start Commands

Direct Streamlit:

```bash
streamlit run main.py
streamlit run main.py -- --debug
streamlit run main.py -- --test-mode
```

Through the unified launcher:

```bash
python run.py --streamlit
python run.py --streamlit --debug
python run.py --streamlit --test
python run.py --streamlit --port 5100
```

## Current Behavior

Streamlit state is stored in `st.session_state`.

Important session keys include:

- `map_center`
- `zoom_level`
- `cur_center`
- `cur_zoom`
- `search_radius`
- `landmarks`
- `update_landmarks`
- `test_mode`
- `primary_locale`
- `second_locale`
- `user_locale`

On startup, Streamlit:

1. initializes locale/session defaults
2. builds the Python i18n object through `init_i18n()`
3. loads config from `public/config.json`
4. restores map state from URL parameters when present
5. renders sidebar and map

## Locale Behavior

The Streamlit runtime uses the Python i18n layer in `utils/lion.py`.

Current defaults:

- primary locale: `en`
- secondary locale: `zh-HK`

The locale button in the sidebar toggles `user_locale` between those two values.

Localized strings are loaded from:

- `public/locales/en.json`
- `cache/local-tm.json` when generated TM exists

## Landmark Flow

When the user requests landmarks:

1. Streamlit reads the current map center and zoom
2. calculates a search radius from zoom level
3. calls `LandmarkService.get_landmark_data(...)` directly
4. renders returned landmarks on the Folium map and in sidebar UI

This is the main difference from Flask:

- Flask path: browser -> `/api/landmark/*` -> route handler -> shared service
- Streamlit path: Streamlit widget -> shared service directly

The landmark discovery logic itself is still shared.

## Shared Cache and Test Mode

Because Streamlit uses the same backend layer as Flask, both runtimes reuse the same backend-side cache artifacts:

- `cache/landmarks_cache.json`
- `cache/landmark_info_cache.json`
- `cache/images/`
- `cache/local-tm.json`

They also share the same test-mode helpers from `utils/config_utils.py`.

That means:

- enabling test mode changes backend behavior for both runtimes
- cached landmark/image data generated in one runtime can be reused by the other
- prompt/config changes under `public/` affect both runtimes unless a runtime has its own UI-only override

In test mode, the runtime uses `public/config.json` fixtures instead of live API calls.

## Map Rendering

The Streamlit map uses:

- `folium`
- `streamlit-folium`

`components/map_viewer.py` handles:

- base map creation
- landmark markers
- popup content
- radius overlay
- returning updated center/zoom state

## URL State

`utils/st_utils.py` handles Streamlit query-string state.

Current URL support includes:

- `lat`
- `lon`
- `zoom`
- `center=lat,lon`
- Google-style `@lat,lon,zoomz`

## Troubleshooting

If landmarks are empty:

- check `GOOGLE_MAPS_API_KEY` and `OPENAI_API_KEY`
- verify test mode is not masking expected live behavior
- inspect Python logs with `--debug`

If the map does not update:

- confirm `st.session_state.update_landmarks` is being set by sidebar actions
- confirm map center and zoom are being returned from `render_map(...)`

If translations are missing:

- verify `public/locales/en.json` exists
- inspect `cache/local-tm.json`
- confirm the locale key exists under the current Streamlit strings

If startup behavior changes after dependency updates:

- re-run `uv sync --frozen`
- verify `streamlit` and `streamlit-folium` are installed in the active environment
