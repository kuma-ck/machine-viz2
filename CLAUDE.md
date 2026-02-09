# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mona (machine-viz2) is a machine data visualization web application built with FastAPI + Jinja2 + ECharts. It displays machine history, defect trends, patrol results, and provides AI-powered factor analysis using LightGBM.

## Commands

```bash
# Install dependencies
uv sync

# Start development server
uv run uvicorn app.main:app --reload

# Create user account
uv run python scripts/create_user.py <username> <password>

# Seed database with test data (requires USE_DUMMY_DATA=False in .env)
uv run python scripts/seed_data.py --count 50 --clear

# Generate large dataset for AI analysis demo
uv run python generate_large_dataset.py
```

## Architecture

```
app/
├── main.py           # FastAPI app, router registration, auth middleware
├── config.py         # Settings from environment variables
├── database.py       # Async SQLAlchemy setup (aiosqlite)
├── models/           # SQLAlchemy models
│   ├── machine.py       # Machine attributes
│   ├── event.py         # Events (defects, maintenance, etc.)
│   ├── characteristic.py # Time-series characteristic values
│   ├── patrol.py        # Patrol monitoring results
│   └── user.py          # Authentication
├── routers/          # API endpoints (each has HTML page + /api/* endpoints)
│   ├── history.py       # Machine history with characteristics charts
│   ├── defect_trend.py  # Defect occurrence trend analysis
│   ├── patrol_result.py # Patrol monitoring result list
│   ├── search.py        # Machine search by defect or attributes
│   ├── cross_section.py # Cross-sectional analysis
│   ├── analysis.py      # AI factor analysis (LightGBM + SHAP)
│   └── auth.py          # Login/logout, JWT tokens
├── services/
│   ├── crud.py          # Database queries
│   ├── dummy_data.py    # In-memory dummy data generation
│   ├── analysis_logic.py # LightGBM model training and SHAP
│   └── dataset_builder.py
├── templates/        # Jinja2 HTML templates
└── static/
    ├── css/style.css
    └── js/           # Per-page JavaScript (ECharts visualization)
```

## Key Configuration

The `USE_DUMMY_DATA` env variable controls data source:
- `True`: Returns randomly generated in-memory data (no DB required)
- `False`: Uses SQLite database (run `scripts/seed_data.py` first)

## Patterns

- Each feature has a router file with both HTML page endpoint (`GET /feature`) and API endpoints (`GET /feature/api/*`)
- Frontend JS files in `static/js/` correspond to templates (e.g., `history.js` for `history.html`)
- All routes except `/login` require authentication via `get_current_user` dependency
- Routers use both `crud.py` (DB mode) and `dummy_data.py` (dummy mode) based on settings

## Language

The codebase and comments are primarily in Japanese. Variable names and code structure follow English conventions.
