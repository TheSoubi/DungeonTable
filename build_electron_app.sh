#!/bin/bash

# Checks if venv exists. If not, creates it for the user.
if [ ! -d ".venv" ]; then
    echo "No python virtualenv detected."
    read -p "Do you want to create the required virtualenv to build the app ? (Y/n) " choice
    if [[ "$choice" =~ ^([yY][eE][sS]|[yY]|"")$ ]]; then
        echo "Creating python's virtual environment..."
        python -m virtualenv .venv
        if [ $? -ne 0 ]; then
            echo "Error: cannot create virtual environment."
            exit 1
        fi
        echo "Successfully created virtual environment !"
    else
        echo "Cannot build app if no virtual environment is present."
        exit 1
    fi
fi
printf "\n#####\nPreparing python virtualenv to build backend\n#####\n"
source .venv/bin/activate
python -m pip install -r requirements.txt
printf "\n#####\nBuild python backend\n#####\n"
pyinstaller ./src/backend/backend_server.py -y -F --windowed --distpath ./dist_backend
#exit 1
printf "\n#####\nBuild electron app\n#####\n"
npm run build && electron-builder