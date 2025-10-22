#!/usr/bin/env python
# encoding: utf-8
import binascii
import json
import base64
import numpy as np
import cv2
from flask_cors import CORS
from flask import Flask, jsonify, request

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/get_data')
def index():
    return jsonify({'name': 'alice',
                    'email': 'alice@outlook.com'})

@app.route('/api/detect_grid_size', methods=['POST'])
def detect_grid_size():
    try:
        print("Processing new image !")
        data = json.loads(request.data)
        if ";base64," in data["image"]:
            data["image"] = data["image"].split(";base64,")[1]
        base64_image = base64.b64decode(data["image"])
        nparr = np.frombuffer(base64_image, dtype=np.uint8)
        image_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        h, w = image_np.shape[:2]
        image_np = np.flipud(image_np)
        cv2.imwrite("last_processed_image.png", image_np)
        _, buffer_img = cv2.imencode('.png', image_np)
        image_base64 = "data:image/png;base64," + base64.b64encode(buffer_img).decode("utf-8")
    except binascii.Error:
        raise Exception("Could not decode base64 image. Incorrect format.")
    except KeyError:
        raise Exception("No 'image' field provided.")
    print("Image saved in last_processed_image.png", image_base64[:100])
    return jsonify({'image': image_base64, "width": w, "height": h, "x_grid_size": 45, "y_grid_size": 45})

if __name__ == "__main__":
    app.run()