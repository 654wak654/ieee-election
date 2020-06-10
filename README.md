# ieee-election

## Setup

1) Install poetry: https://python-poetry.org/docs/#installation
2) Run `poetry install` in root folder
3) Install node (with npm): https://nodejs.org/en/download/
4) Run `npm install` in `/frontend`

## Development


Run this in root folder
```
poetry run uvicorn app.main:app --reload
```

Then run this in `/fontend`:
```
npm run dev
```

## Deployment

