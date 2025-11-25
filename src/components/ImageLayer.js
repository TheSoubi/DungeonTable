export default class ImageLayer {
    constructor(name) {
        this.name = name;
        this.images = [];
        this.selectedImageId = null;
        this.resizeCorner = null;
        this.gmFlagImg = null;
        if (this.name === "GM") {
            this.gmFlagImg = new Image();
            this.gmFlagImg.src = '/images/GM_layer_flag.svg';
        }
        this.serverUrl = "http://localhost/api/";
    }

    getJson() {
        return this.images.map(img => ({
            src: img.img.src,
            x: img.x,
            y: img.y,
            width: img.width,
            height: img.height,
            layer: img.layer
        }));
    }

    loadJson(json) {
        this.images = [];
        this.selectedImageId = null;
        this.resizeCorner = null;
        for (let image of json) {
            if (image.layer === this.name) {
                const img = new Image();
                img.src = image.src;
                this.images.push({
                    img: img,
                    x: image.x,
                    y: image.y,
                    width: image.width,
                    height: image.height,
                    layer: image.layer
                });
            }
        }
    }
    /*
    Load an imageLayer's image list from a .dtable (json) save file.
    */
    async loadJsonWithFiles(json, ziparchive) {
        this.images = [];
        this.selectedImageId = null;
        this.resizeCorner = null;
        for (const image_obj of json) {
            const imageFile = ziparchive.file(image_obj.src);
            if (!imageFile) {
                console.error(`The following file could not be loaded : ${image_obj.src}`);
                continue;
            }
            const imageData = await imageFile.async('uint8array');
            const blob = new Blob([imageData], {type: 'image/png'});
            await this.addImage(blob, image_obj.x, image_obj.y, image_obj.width, image_obj.height);
        }
    }

    loadImage(imageFile, x = null, y = null, width = null, height = null) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let imageObject = {
                        img: img,
                        x: x === null ? 100 : x,
                        y: y === null ? 100 : y,
                        width: width === null ? img.width : width,
                        height: height === null ? img.height : height,
                        layer: this.name
                    };
                    resolve(imageObject);
                };

                img.onerror = reject;
                img.src = e.target.result;
            };

            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });
    }

    async addImage(imageFile, x = null, y = null, width = null, height = null, maxWidth = null, maxHeight = null) {
        const imageObject = await this.loadImage(imageFile, x, y, width, height, maxWidth, maxHeight);
        this.images.push(imageObject);
    }

    selectImageByID(imageID) {
        this.selectedImageId = imageID;
    }

    selectLastImage(){
        this.selectedImageId = this.images.length - 1;
    }

    getSelectedImage() {
        if (this.selectedImageId !== null) {
            return {"id": this.selectedImageId, "image": this.images[this.selectedImageId]};
        } else {
            return null;
        }
    }

    resetImageSelection() {
        this.selectedImageId = null;
    }

    removeSelectedImage() {
        let is_deleted = false;
        console.log("selected image", this.selectedImageId);
        if (this.selectedImageId !== null) {
            this.images.splice(this.selectedImageId, 1);
            this.selectedImageId = null;
            is_deleted = true;
        }
        return is_deleted;
    }

    selectHandle(cornerName) {
        this.resizeCorner = cornerName;
    }

    resetHandleSelection() {
        this.resizeCorner = null;
    }

    /**
     * Return the index of the image at the given position.
     */
    getImageAtPosition(clickPosition) {
        if (this.images.length > 0) {
            for (let i = this.images.length - 1; i >= 0; i--) {
                if (this.isClickInImage(clickPosition, this.images[i])) {
                    return {"id": i, "image": this.images[i]};
                }
            }
        }
        return null;
    }

    /**
     * Return a boolean indicating if the given click position is inside the given image.
     */
    isClickInImage(clickPosition, img) {
        return clickPosition.x >= img.x &&
            clickPosition.x <= img.x + img.width &&
            clickPosition.y >= img.y &&
            clickPosition.y <= img.y + img.height
    }

    resizeSelectedImage(start_position, start_size, click_position) {
        const img = this.images[this.selectedImageId];
        const aspect_ratio = img.width / img.height;
        const minSize = 20;
        // Corner resizing - preserve aspect ratio
        if (this.resizeCorner === 'bottom-right') {
            const newWidth = Math.max(minSize, click_position.x - img.x);
            const newHeight = newWidth / aspect_ratio;
            img.width = newWidth;
            img.height = newHeight;
        } else if (this.resizeCorner === 'bottom-left') {
            const newWidth = Math.max(minSize, start_position.x + start_size.width - click_position.x);
            const newHeight = newWidth / aspect_ratio;
            img.x = start_position.x + start_size.width - newWidth;
            img.width = newWidth;
            img.height = newHeight;
        } else if (this.resizeCorner === 'top-right') {
            const newWidth = Math.max(minSize, click_position.x - img.x);
            const newHeight = newWidth / aspect_ratio;
            img.y = start_position.y + start_size.height - newHeight;
            img.width = newWidth;
            img.height = newHeight;
        } else if (this.resizeCorner === 'top-left') {
            const newWidth = Math.max(minSize, start_position.x + start_size.width - click_position.x);
            const newHeight = newWidth / aspect_ratio;
            img.x = start_position.x + start_size.width - newWidth;
            img.y = start_position.y + start_size.height - newHeight;
            img.width = newWidth;
            img.height = newHeight;
        }
        // Edge resizing - do NOT preserve aspect ratio
        else if (this.resizeCorner === 'top') {
            const newHeight = Math.max(minSize, start_position.y + start_size.height - click_position.y);
            img.y = start_position.y + start_size.height - newHeight;
            img.height = newHeight;
        } else if (this.resizeCorner === 'right') {
            const newWidth = Math.max(minSize, click_position.x - img.x);
            img.width = newWidth;
        } else if (this.resizeCorner === 'bottom') {
            const newHeight = Math.max(minSize, click_position.y - img.y);
            img.height = newHeight;
        } else if (this.resizeCorner === 'left') {
            const newWidth = Math.max(minSize, start_position.x + start_size.width - click_position.x);
            img.x = start_position.x + start_size.width - newWidth;
            img.width = newWidth;
        }
    }

    /**
     * Return the name of the closest handle and the image at the given coordinate.
     */
    getClosestResizeHandle(mouse_position, zoomLevel) {
        if (this.selectedImageId !== null) {
            const handleSize = 8 / zoomLevel;
            const threshold = Math.min(this.images[this.selectedImageId].width, this.images[this.selectedImageId].height) * 0.1;
            // Check corners
            if (Math.abs(mouse_position.x - this.images[this.selectedImageId].x) < threshold && Math.abs(mouse_position.y - this.images[this.selectedImageId].y) < threshold) {
                return {"handle_name": 'top-left', "image": this.images[this.selectedImageId]};
            }
            if (Math.abs(mouse_position.x - (this.images[this.selectedImageId].x + this.images[this.selectedImageId].width)) < threshold && Math.abs(mouse_position.y - this.images[this.selectedImageId].y) < threshold) {
                return {"handle_name": 'top-right', "image": this.images[this.selectedImageId]};
            }
            if (Math.abs(mouse_position.x - this.images[this.selectedImageId].x) < threshold && Math.abs(mouse_position.y - (this.images[this.selectedImageId].y + this.images[this.selectedImageId].height)) < threshold) {
                return {"handle_name": 'bottom-left', "image": this.images[this.selectedImageId]};
            }
            if (Math.abs(mouse_position.x - (this.images[this.selectedImageId].x + this.images[this.selectedImageId].width)) < threshold && Math.abs(mouse_position.y - (this.images[this.selectedImageId].y + this.images[this.selectedImageId].height)) < threshold) {
                return {"handle_name": 'bottom-right', "image": this.images[this.selectedImageId]};
            }
            // Check edges
            if (Math.abs(mouse_position.x - (this.images[this.selectedImageId].x + this.images[this.selectedImageId].width / 2)) < threshold && Math.abs(mouse_position.y - this.images[this.selectedImageId].y) < threshold) {
                return {"handle_name": 'top', "image": this.images[this.selectedImageId]};
            }
            if (Math.abs(mouse_position.x - (this.images[this.selectedImageId].x + this.images[this.selectedImageId].width)) < threshold && Math.abs(mouse_position.y - (this.images[this.selectedImageId].y + this.images[this.selectedImageId].height / 2)) < threshold) {
                return {"handle_name": 'right', "image": this.images[this.selectedImageId]};
            }
            if (Math.abs(mouse_position.x - (this.images[this.selectedImageId].x + this.images[this.selectedImageId].width / 2)) < threshold && Math.abs(mouse_position.y - (this.images[this.selectedImageId].y + this.images[this.selectedImageId].height)) < threshold) {
                return {"handle_name": 'bottom', "image": this.images[this.selectedImageId]};
            }
            if (Math.abs(mouse_position.x - this.images[this.selectedImageId].x) < threshold && Math.abs(mouse_position.y - (this.images[this.selectedImageId].y + this.images[this.selectedImageId].height / 2)) < threshold) {
                return {"handle_name": 'left', "image": this.images[this.selectedImageId]};
            } else {
                return null;
            }
        }
        return null;
    }

    /**
     * Draw the layer on the given canvas.
     */
    drawOnCanvas(canvas, zoomLevel) {
        const ctx = canvas.getContext('2d');
        // console.log("Drawing on screen for ", this.name, this.images.length);
        for (let image_index = 0; image_index < this.images.length; image_index++) {
            let imageObj = this.images[image_index]
            ctx.drawImage(
                imageObj.img,
                imageObj.x,
                imageObj.y,
                imageObj.width,
                imageObj.height
            );
            if (this.name === "GM") {
                ctx.drawImage(this.gmFlagImg, imageObj.x - 10, imageObj.y - 10, 25, 25);
            }
            if (this.selectedImageId === image_index) {
                ctx.strokeStyle = '#00a100';
                ctx.lineWidth = 2 / zoomLevel;
                ctx.strokeRect(imageObj.x, imageObj.y, imageObj.width, imageObj.height);
                ctx.fillStyle = '#00a10022';
                ctx.fillRect(imageObj.x, imageObj.y, imageObj.width, imageObj.height);

                // Draw resize handles at corners and edges
                const handleSize = 8 / zoomLevel;
                ctx.fillStyle = '#00a100ff';

                // Corner handles
                ctx.fillRect(imageObj.x - handleSize / 2, imageObj.y - handleSize / 2, handleSize, handleSize);
                ctx.fillRect(imageObj.x + imageObj.width - handleSize / 2, imageObj.y - handleSize / 2, handleSize, handleSize);
                ctx.fillRect(imageObj.x - handleSize / 2, imageObj.y + imageObj.height - handleSize / 2, handleSize, handleSize);
                ctx.fillRect(imageObj.x + imageObj.width - handleSize / 2, imageObj.y + imageObj.height - handleSize / 2, handleSize, handleSize);

                // Edge handles
                const edgeHandleSize = 6 / zoomLevel;
                ctx.fillStyle = '#0088ff';
                ctx.fillRect(imageObj.x + imageObj.width / 2 - edgeHandleSize / 2, imageObj.y - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                ctx.fillRect(imageObj.x + imageObj.width - edgeHandleSize / 2, imageObj.y + imageObj.height / 2 - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                ctx.fillRect(imageObj.x + imageObj.width / 2 - edgeHandleSize / 2, imageObj.y + imageObj.height - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                ctx.fillRect(imageObj.x - edgeHandleSize / 2, imageObj.y + imageObj.height / 2 - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
            }
        }
    }

    async sendImageToServer(base64Image) {
        try {
            console.log("call to", this.serverUrl + 'detect_grid_size');
            const response = await fetch(this.serverUrl + 'detect_grid_size', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({image: base64Image}),
            });
            return await response.json();
        } catch (error) {
            throw new Error(`An error was caught during API call : ${error}`);
            return null;
        }
    }

    async processSelectedImage(grid_cell_size) {
        if (this.selectedImageId !== null) {
            let image = this.images[this.selectedImageId];
            let base64_img = image.img.src;
            await this.sendImageToServer(base64_img)
                .then(processedImage => {
                    if (processedImage != null) {
                        const img = new Image();
                        const x_ratio = grid_cell_size / processedImage.x_grid_size;
                        const y_ratio = grid_cell_size / processedImage.y_grid_size;
                        // console.log("Current grid size", grid_cell_size, "server answer", processedImage);
                        this.images[this.selectedImageId].width = x_ratio * processedImage.width;
                        this.images[this.selectedImageId].height = y_ratio * processedImage.height;
                    }
                })
                .catch(error => {
                    console.error('Error: ', error);
                });
        }
    }

}