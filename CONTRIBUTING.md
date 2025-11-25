# CONTRIBUTING

## Dev mode

In dev mode, the backend python server is not started. Electron is giving you the command (and the right port !) when it is started with `npm run electron:dev`.

Just do `python src/backend/backend_server.py [PORT]` with the correct port selected by electron.

## Logs

Electron logs are located in :
- `%APPDATA%\dungeontable\logs\main.log` (Windows)
- `~/.config/dungeontable/logs/main.log` (Linux)
