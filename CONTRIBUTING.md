# CONTRIBUTING

## Dev mode

In dev mode, the backend python server is not started. Electron is giving you the command (and the right port !) when it is started with `npm run electron:dev`.

```sh
npm run electron:dev
```

If you want to run the backend server in dev mode, create a python virtual environment and pip install the `requirements.txt` :

```bash
python -m virtualenv .venv
# Activate you venv now
pip install -r requirements.txt
```
Then do `python src/backend/backend_server.py [PORT]` with the correct port displayed by electron to start the backend server.

## Build backend and app to electron package

```sh
npm run electron:build
```

Python's backend server will be packaged to an executable using this command.

## Logs

Electron's logs are located in :
- `%APPDATA%\dungeontable\logs\main.log` (Windows)
- `~/.config/dungeontable/logs/main.log` (Linux)
