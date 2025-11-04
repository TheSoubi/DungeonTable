import JSZip from "jszip";
import {saveAs} from 'file-saver';
import FogLayer from "./Fog";
import GridLayer from "./Grid";
import debounce from 'lodash.debounce';

export default {
    data() {
        return {
            game: null,
            canvas: null,
            ctx: null,
            editable_layers: ['Map', 'Grid', 'Token', 'Fog', 'GM'],
            selectedLayer: 'Map',
            layerImages: {
                Map: [],
                Token: [],
                GM: []
            },
            hasClicked: false,
            selectedImageId: null,
            isDragging: false,
            isMoving: false,
            draggedImage: null,
            dragOffset: {x: 0, y: 0},
            isResizing: false,
            resizeCorner: null,
            resizeStartSize: {width: 0, height: 0},
            resizeStartPos: {x: 0, y: 0},
            resizeAspectRatio: 1,
            canvasWidth: 0,
            canvasHeight: 0,
            toolboxMinimized: false,
            zoomLevel: 1,
            canvasOffsetX: 0,
            canvasOffsetY: 0,
            isPanning: false,
            panStart: {x: 0, y: 0},
            isPlayerView: false,
            broadcastChannel: null,
            playerViewportX: 100,
            playerViewportY: 100,
            playerViewportWidth: 600,
            playerViewportHeight: 600,
            isDraggingViewport: false,
            isResizingViewport: false,
            viewportDragOffset: {x: 0, y: 0},
            viewportResizeCorner: null,
            isPlayerViewportEnabled: false,
            mapName: '',
            isShowingOpenMapDialog: false,
            isShowingSaveMapDialog: false,
            savedMaps: [],
            isLoading: false,
            fogLayer: null,
            gmFlagImg: null,
            isMagnetEnabled: false
        };
    },
    created() {
        this.createGame()
        window.addEventListener('resize', debounce(this.handleResize, 100));

        // Check if this is player view
        const urlParams = new URLSearchParams(window.location.search);
        this.isPlayerView = urlParams.get('mode') === 'player';

        // Set up BroadcastChannel for synchronization
        this.broadcastChannel = new BroadcastChannel('game-sync');
        this.broadcastChannel.onmessage = (event) => {
            this.handleBroadcastMessage(event.data);
        };

        this.fogLayer = new FogLayer(this.isPlayerView);
        this.fogLayer.setUpdateCallback(() => {
            this.broadcastFogUpdate()
        });

        this.gridLayer = new GridLayer();

        this.gmFlagImg = new Image();
        this.gmFlagImg.src = '/images/GM_layer_flag.svg';
    },
    beforeUnmount() {
        window.removeEventListener('resize', debounce(this.handleResize, 200));
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
        }
    },
    methods: {
        createGame() {
            this.game = {
                name: 'New Game',
                created: new Date()
            };

            this.$nextTick(() => {
                this.initCanvas();
            });
        },

        initCanvas() {
            this.canvas = this.$refs.canvas;
            this.ctx = this.canvas.getContext('2d');
            this.handleResize();
            this.renderCanvas();
        },

        selectLayer(layer) {
            this.selectedLayer = layer;
        },

        handleResize() {
            if (!this.canvas) return;
            this.canvasWidth = window.innerWidth;
            this.canvasHeight = window.innerHeight;
            this.canvas.width = this.canvasWidth;
            this.canvas.height = this.canvasHeight;
            this.renderCanvas();
            if (this.isPlayerView) {
                this.broadcastPlayerViewResize();
            }
        },

        screenToWorld(screenX, screenY) {
            return {
                x: Math.round((screenX - this.canvasOffsetX) / this.zoomLevel),
                y: Math.round((screenY - this.canvasOffsetY) / this.zoomLevel)
            };
        },

        worldToScreen(worldX, worldY) {
            return {
                x: Math.round(worldX * this.zoomLevel + this.canvasOffsetX),
                y: Math.round(worldY * this.zoomLevel + this.canvasOffsetY)
            };
        },

        handleImageUpload(event) {
            const file = event.target.files[0];
            if (!file || this.selectedLayer === 'Grid') return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    const maxWidth = this.canvasWidth * 0.8;
                    const maxHeight = this.canvasHeight * 0.8;

                    if (width > maxWidth || height > maxHeight) {
                        const widthRatio = maxWidth / width;
                        const heightRatio = maxHeight / height;
                        const ratio = Math.min(widthRatio, heightRatio);

                        width = width * ratio;
                        height = height * ratio;
                    }

                    const imageObject = {
                        img: img,
                        x: 100,
                        y: 100,
                        width: width,
                        height: height,
                        layer: this.selectedLayer
                    };

                    this.layerImages[this.selectedLayer].push(imageObject);
                    this.selectedImageId = this.layerImages[this.selectedLayer].length - 1
                    this.renderCanvas();
                    this.broadcastImageUpdate();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        },

        renderCanvas() {
            if (!this.ctx) return;

            this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

            // Apply zoom and pan transforms
            this.ctx.save();
            this.ctx.translate(this.canvasOffsetX, this.canvasOffsetY);
            this.ctx.scale(this.zoomLevel, this.zoomLevel);

            this.drawLayerImages('Map');
            this.gridLayer.drawOnCanvas(this.canvas, this.canvasOffsetX, this.canvasOffsetY, this.canvasWidth, this.canvasHeight, this.zoomLevel);
            this.drawLayerImages('Token');
            this.fogLayer.drawOnCanvas(this.canvas, this.canvasOffsetX, this.canvasOffsetY, this.canvasWidth, this.canvasHeight, this.zoomLevel);
            this.drawLayerImages('GM');

            // Draw player viewport rectangle in GM view
            if (!this.isPlayerView && this.isPlayerViewportEnabled) {
                this.drawPlayerViewport();
            }
            this.ctx.restore();
        },

        drawPlayerViewport() {
            // Draw blue rectangle showing player viewport
            this.ctx.strokeStyle = '#0066ff';
            this.ctx.lineWidth = 3 / this.zoomLevel;
            this.ctx.strokeRect(
                this.playerViewportX,
                this.playerViewportY,
                this.playerViewportWidth,
                this.playerViewportHeight
            );
            this.ctx.fillStyle = '#0066ff22';
            this.ctx.fillRect(
                this.playerViewportX,
                this.playerViewportY,
                this.playerViewportWidth,
                this.playerViewportHeight
            );

            // Draw resize handles at corners
            const handleSize = 10 / this.zoomLevel;
            this.ctx.fillStyle = '#0066ff';
            this.ctx.fillRect(this.playerViewportX - handleSize / 2, this.playerViewportY - handleSize / 2, handleSize, handleSize);
            this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth - handleSize / 2, this.playerViewportY - handleSize / 2, handleSize, handleSize);
            this.ctx.fillRect(this.playerViewportX - handleSize / 2, this.playerViewportY + this.playerViewportHeight - handleSize / 2, handleSize, handleSize);
            this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth - handleSize / 2, this.playerViewportY + this.playerViewportHeight - handleSize / 2, handleSize, handleSize);


            // Label
            this.ctx.fillStyle = '#0066ff';
            this.ctx.font = `bold ${14 / this.zoomLevel}px Arial`;
            this.ctx.fillText("Player's View", this.playerViewportX + 5 / this.zoomLevel, this.playerViewportY - 10 / this.zoomLevel);
        },

        drawLayerImages(layer) {
            // Hide GM layer in player view
            if (this.isPlayerView && layer === 'GM') return;

            const images = this.layerImages[layer];
            if (!images) return;

            // const imageObj of images
            for (let image_index = 0; image_index < images.length; image_index++) {
                let imageObj = images[image_index]
                this.ctx.drawImage(
                    imageObj.img,
                    imageObj.x,
                    imageObj.y,
                    imageObj.width,
                    imageObj.height
                );
                if (layer === "GM") {
                    this.ctx.drawImage(this.gmFlagImg, imageObj.x - 10, imageObj.y - 10, 25, 25);
                }
                if (layer === this.selectedLayer && !this.isPanning && image_index === this.selectedImageId) {
                    this.ctx.strokeStyle = '#00a100';
                    this.ctx.lineWidth = 2 / this.zoomLevel;
                    this.ctx.strokeRect(imageObj.x, imageObj.y, imageObj.width, imageObj.height);
                    this.ctx.fillStyle = '#00a10022';
                    this.ctx.fillRect(imageObj.x, imageObj.y, imageObj.width, imageObj.height);

                    // Draw resize handles at corners and edges
                    const handleSize = 8 / this.zoomLevel;
                    this.ctx.fillStyle = '#00a100ff';

                    // Corner handles
                    this.ctx.fillRect(imageObj.x - handleSize / 2, imageObj.y - handleSize / 2, handleSize, handleSize);
                    this.ctx.fillRect(imageObj.x + imageObj.width - handleSize / 2, imageObj.y - handleSize / 2, handleSize, handleSize);
                    this.ctx.fillRect(imageObj.x - handleSize / 2, imageObj.y + imageObj.height - handleSize / 2, handleSize, handleSize);
                    this.ctx.fillRect(imageObj.x + imageObj.width - handleSize / 2, imageObj.y + imageObj.height - handleSize / 2, handleSize, handleSize);

                    // Edge handles
                    const edgeHandleSize = 6 / this.zoomLevel;
                    this.ctx.fillStyle = '#0088ff';

                    this.ctx.fillRect(imageObj.x + imageObj.width / 2 - edgeHandleSize / 2, imageObj.y - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                    this.ctx.fillRect(imageObj.x + imageObj.width - edgeHandleSize / 2, imageObj.y + imageObj.height / 2 - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                    this.ctx.fillRect(imageObj.x + imageObj.width / 2 - edgeHandleSize / 2, imageObj.y + imageObj.height - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                    this.ctx.fillRect(imageObj.x - edgeHandleSize / 2, imageObj.y + imageObj.height / 2 - edgeHandleSize / 2, edgeHandleSize, edgeHandleSize);
                }
            }
        },

        isClickInImage(click_position, img) {
            return click_position.x >= img.x &&
                click_position.x <= img.x + img.width &&
                click_position.y >= img.y &&
                click_position.y <= img.y + img.height
        },

        getCornerAt(img, worldX, worldY) {
            const handleSize = 8 / this.zoomLevel;
            const threshold = handleSize;

            // Check corners
            if (Math.abs(worldX - img.x) < threshold && Math.abs(worldY - img.y) < threshold) {
                return 'top-left';
            }
            if (Math.abs(worldX - (img.x + img.width)) < threshold && Math.abs(worldY - img.y) < threshold) {
                return 'top-right';
            }
            if (Math.abs(worldX - img.x) < threshold && Math.abs(worldY - (img.y + img.height)) < threshold) {
                return 'bottom-left';
            }
            if (Math.abs(worldX - (img.x + img.width)) < threshold && Math.abs(worldY - (img.y + img.height)) < threshold) {
                return 'bottom-right';
            }

            // Check edges
            const edgeThreshold = 6 / this.zoomLevel;

            if (Math.abs(worldX - (img.x + img.width / 2)) < edgeThreshold && Math.abs(worldY - img.y) < edgeThreshold) {
                return 'top';
            }
            if (Math.abs(worldX - (img.x + img.width)) < edgeThreshold && Math.abs(worldY - (img.y + img.height / 2)) < edgeThreshold) {
                return 'right';
            }
            if (Math.abs(worldX - (img.x + img.width / 2)) < edgeThreshold && Math.abs(worldY - (img.y + img.height)) < edgeThreshold) {
                return 'bottom';
            }
            if (Math.abs(worldX - img.x) < edgeThreshold && Math.abs(worldY - (img.y + img.height / 2)) < edgeThreshold) {
                return 'left';
            }

            return null;
        },

        getViewportHandleAt(worldX, worldY) {
            const handleSize = 10 / this.zoomLevel;
            const threshold = handleSize;

            // Check corners first
            if (Math.abs(worldX - this.playerViewportX) < threshold && Math.abs(worldY - this.playerViewportY) < threshold) {
                return 'top-left';
            }
            if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth)) < threshold && Math.abs(worldY - this.playerViewportY) < threshold) {
                return 'top-right';
            }
            if (Math.abs(worldX - this.playerViewportX) < threshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight)) < threshold) {
                return 'bottom-left';
            }
            if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth)) < threshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight)) < threshold) {
                return 'bottom-right';
            }

            // Check edges
            const edgeThreshold = 8 / this.zoomLevel;

            if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth / 2)) < edgeThreshold && Math.abs(worldY - this.playerViewportY) < edgeThreshold) {
                return 'top';
            }
            if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth)) < edgeThreshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight / 2)) < edgeThreshold) {
                return 'right';
            }
            if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth / 2)) < edgeThreshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight)) < edgeThreshold) {
                return 'bottom';
            }
            if (Math.abs(worldX - this.playerViewportX) < edgeThreshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight / 2)) < edgeThreshold) {
                return 'left';
            }

            return null;
        },

        handleMouseDown(event) {
            if (this.isPlayerView) {
                return;
            }
            this.hasClicked = true;
            const rect = this.canvas.getBoundingClientRect();
            const click_X = event.clientX - rect.left;
            const click_Y = event.clientY - rect.top;
            const click_position = this.screenToWorld(click_X, click_Y);
            this.isMoving = false;

            // Check viewport rectangle first (in GM view only)
            if (this.isPlayerViewportEnabled) {
                const viewportHandle = this.getViewportHandleAt(click_position.x, click_position.y);
                if (viewportHandle) {
                    this.isResizingViewport = true;
                    this.viewportResizeCorner = viewportHandle;
                    return;
                }

                // Check if clicking inside viewport rectangle for dragging
                if (click_position.x >= this.playerViewportX &&
                    click_position.x <= this.playerViewportX + this.playerViewportWidth &&
                    click_position.y >= this.playerViewportY &&
                    click_position.y <= this.playerViewportY + this.playerViewportHeight) {
                    this.isDraggingViewport = true;
                    this.viewportDragOffset = {
                        x: click_position.x - this.playerViewportX,
                        y: click_position.y - this.playerViewportY
                    };
                    return;
                }
            }
            // Handling Layer's manipulation
            if (this.selectedLayer === 'Grid') {
                this.isPanning = true;
                this.panStart = {x: click_X, y: click_Y};
                this.renderCanvas();
            }
            else {
                const images = this.layerImages[this.selectedLayer];
                let is_one_object_selected = false;
                if (images) {
                    for (let i = images.length - 1; i >= 0; i--) {
                        const img = images[i];

                        // Check resize handles
                        const corner = this.getCornerAt(img, click_position.x, click_position.y);
                        if (corner) {
                            this.isResizing = true;
                            this.resizeCorner = corner;
                            this.draggedImage = img;
                            this.resizeStartSize = {width: img.width, height: img.height};
                            this.resizeStartPos = {x: img.x, y: img.y};
                            this.resizeAspectRatio = img.width / img.height;
                            is_one_object_selected = true;
                            break;
                        }

                        // Check if clicking inside image
                        if (this.isClickInImage(click_position, img) && this.selectedImageId !== null) {
                            this.isDragging = true;
                            this.draggedImage = img;
                            this.dragOffset = {
                                x: click_position.x - img.x,
                                y: click_position.y - img.y
                            };
                            is_one_object_selected = true;
                            break;
                        } else {
                            this.selectedImageId = null;
                        }
                    }
                    // Start panning if no object clicked
                }
                if (!is_one_object_selected) {
                    this.isPanning = true;
                    this.panStart = {x: click_X, y: click_Y};
                    this.renderCanvas();
                }
            }
        },

        handleMouseMove(event) {
            if (this.isPlayerView) {
                return;
            }
            const rect = this.canvas.getBoundingClientRect();
            const click_X = event.clientX - rect.left;
            const click_Y = event.clientY - rect.top;
            const click_position = this.screenToWorld(click_X, click_Y);
            this.isMoving = true;
            this.canvas.style.cursor = 'default';

            if (this.isDraggingViewport) {
                this.canvas.style.cursor = 'grabbing';
                this.playerViewportX = click_position.x - this.viewportDragOffset.x;
                this.playerViewportY = click_position.y - this.viewportDragOffset.y;
            }
            else if (this.isResizingViewport) {
                const minSize = 100;
                const viewportAspectRatio = this.playerViewportWidth / this.playerViewportHeight;
                this.canvas.style.cursor = 'nwse-resize';
                // Corner resizing - maintain aspect ratio
                if (this.viewportResizeCorner === 'bottom-right') {
                    const newWidth = Math.max(minSize, click_position.x - this.playerViewportX);
                    this.playerViewportWidth = newWidth;
                    this.playerViewportHeight = newWidth / viewportAspectRatio;
                } else if (this.viewportResizeCorner === 'top-left') {
                    const oldRight = this.playerViewportX + this.playerViewportWidth;
                    const oldBottom = this.playerViewportY + this.playerViewportHeight;
                    const newWidth = Math.max(minSize, oldRight - click_position.x);
                    this.playerViewportWidth = newWidth;
                    this.playerViewportHeight = newWidth / viewportAspectRatio;
                    this.playerViewportX = oldRight - this.playerViewportWidth;
                    this.playerViewportY = oldBottom - this.playerViewportHeight;
                } else if (this.viewportResizeCorner === 'top-right') {
                    const oldBottom = this.playerViewportY + this.playerViewportHeight;
                    const newWidth = Math.max(minSize, click_position.x - this.playerViewportX);
                    this.playerViewportWidth = newWidth;
                    this.playerViewportHeight = newWidth / viewportAspectRatio;
                    this.playerViewportY = oldBottom - this.playerViewportHeight;
                } else if (this.viewportResizeCorner === 'bottom-left') {
                    const oldRight = this.playerViewportX + this.playerViewportWidth;
                    const newWidth = Math.max(minSize, oldRight - click_position.x);
                    this.playerViewportWidth = newWidth;
                    this.playerViewportHeight = newWidth / viewportAspectRatio;
                    this.playerViewportX = oldRight - this.playerViewportWidth;
                }
                // Edge resizing - also maintain aspect ratio
                else if (this.viewportResizeCorner === 'top') {
                    const oldBottom = this.playerViewportY + this.playerViewportHeight;
                    const newHeight = Math.max(minSize, oldBottom - click_position.y);
                    this.playerViewportHeight = newHeight;
                    this.playerViewportWidth = newHeight * viewportAspectRatio;
                    this.playerViewportY = oldBottom - this.playerViewportHeight;
                } else if (this.viewportResizeCorner === 'right') {
                    const newWidth = Math.max(minSize, click_position.x - this.playerViewportX);
                    this.playerViewportWidth = newWidth;
                    this.playerViewportHeight = newWidth / viewportAspectRatio;
                } else if (this.viewportResizeCorner === 'bottom') {
                    const newHeight = Math.max(minSize, click_position.y - this.playerViewportY);
                    this.playerViewportHeight = newHeight;
                    this.playerViewportWidth = newHeight * viewportAspectRatio;
                } else if (this.viewportResizeCorner === 'left') {
                    const oldRight = this.playerViewportX + this.playerViewportWidth;
                    const newWidth = Math.max(minSize, oldRight - click_position.x);
                    this.playerViewportWidth = newWidth;
                    this.playerViewportHeight = newWidth / viewportAspectRatio;
                    this.playerViewportX = oldRight - this.playerViewportWidth;
                }
            }
            else if (this.isPanning) {
                // Disable panning in player view
                this.canvas.style.cursor = 'grabbing';
                this.canvasOffsetX += click_X - this.panStart.x;
                this.canvasOffsetY += click_Y - this.panStart.y;
                this.panStart = {x: click_X, y: click_Y};
            }
            else if (this.isResizing && this.draggedImage) {
                const img = this.draggedImage;
                const minSize = 20;

                // Corner resizing - preserve aspect ratio
                if (this.resizeCorner === 'bottom-right') {
                    this.canvas.style.cursor = 'nwse-resize';
                    const newWidth = Math.max(minSize, click_position.x - img.x);
                    const newHeight = newWidth / this.resizeAspectRatio;
                    img.width = newWidth;
                    img.height = newHeight;
                } else if (this.resizeCorner === 'bottom-left') {
                    this.canvas.style.cursor = 'nesw-resize';
                    const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - click_position.x);
                    const newHeight = newWidth / this.resizeAspectRatio;
                    img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
                    img.width = newWidth;
                    img.height = newHeight;
                } else if (this.resizeCorner === 'top-right') {
                    this.canvas.style.cursor = 'nesw-resize';
                    const newWidth = Math.max(minSize, click_position.x - img.x);
                    const newHeight = newWidth / this.resizeAspectRatio;
                    img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
                    img.width = newWidth;
                    img.height = newHeight;
                } else if (this.resizeCorner === 'top-left') {
                    this.canvas.style.cursor = 'nwse-resize';
                    const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - click_position.x);
                    const newHeight = newWidth / this.resizeAspectRatio;
                    img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
                    img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
                    img.width = newWidth;
                    img.height = newHeight;
                }
                // Edge resizing - do NOT preserve aspect ratio
                else if (this.resizeCorner === 'top') {
                    this.canvas.style.cursor = 'ns-resize';
                    const newHeight = Math.max(minSize, this.resizeStartPos.y + this.resizeStartSize.height - click_position.y);
                    img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
                    img.height = newHeight;
                } else if (this.resizeCorner === 'right') {
                    this.canvas.style.cursor = 'ew-resize';
                    const newWidth = Math.max(minSize, click_position.x - img.x);
                    img.width = newWidth;
                } else if (this.resizeCorner === 'bottom') {
                    this.canvas.style.cursor = 'ns-resize';
                    const newHeight = Math.max(minSize, click_position.y - img.y);
                    img.height = newHeight;
                } else if (this.resizeCorner === 'left') {
                    this.canvas.style.cursor = 'ew-resize';
                    const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - click_position.x);
                    img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
                    img.width = newWidth;
                }
            }
            else if (this.isDragging && this.draggedImage) {
                this.canvas.style.cursor = 'move';
                this.draggedImage.x = click_position.x - this.dragOffset.x;
                this.draggedImage.y = click_position.y - this.dragOffset.y;
            }

            if (this.selectedLayer !== "Fog") {
                this.fogLayer.cancelCurrentPolygon()
            }
            else {
                if (!this.isPanning) {
                    this.canvas.style.cursor = 'crosshair';
                }
                let final_click_position = click_position;
                if (this.isMagnetEnabled) {
                    final_click_position = this.gridLayer.getClosestSnapCoordinates(click_position);
                }
                this.fogLayer.handleMouseMove(final_click_position.x, final_click_position.y);
            }
            this.renderCanvas();
            // if (!this.isPanning && !this.isDragging && !this.isResizing && !this.draggingGridLine && !this.draggingGridAnchor) {
            //   this.canvas.style.cursor = 'grab';
            // }
        },

        handleMouseUp(event) {
            if (this.isPlayerView) {
                return;
            }
            if (this.hasClicked) {
                this.hasClicked = false;
                const rect = this.canvas.getBoundingClientRect();
                const click_X = event.clientX - rect.left;
                const click_Y = event.clientY - rect.top;
                const click_position = this.screenToWorld(click_X, click_Y);
                let stateChanged = false;

                // Snap token layer images to grid
                if (this.isDragging && this.draggedImage) {
                    if (this.selectedLayer === 'Token') {
                        const new_coordinates = this.gridLayer.getImageSnapCoordinates(this.draggedImage);
                        this.draggedImage.x = new_coordinates.x;
                        this.draggedImage.y = new_coordinates.y;
                    }
                    this.renderCanvas();
                    stateChanged = true;
                }

                // Broadcast state if anything changed
                if (this.isDragging || this.isResizing || this.draggingGridLine || this.draggingGridAnchor || this.isDraggingViewport || this.isResizingViewport) {
                    stateChanged = true;
                }

                // Handle Fog
                if (this.selectedLayer === "Fog" && !this.isMoving) {
                    let final_click_position = click_position;
                    if (this.isMagnetEnabled) {
                        final_click_position = this.gridLayer.getClosestSnapCoordinates(click_position);
                    }
                    this.fogLayer.handleMouseUp(final_click_position.x, final_click_position.y);
                    this.renderCanvas();
                }

                this.isDragging = false;
                this.isResizing = false;
                this.resizeCorner = null;
                this.draggedImage = null;
                this.draggingGridLine = null;
                this.draggingGridAnchor = false;
                this.isDraggingViewport = false;
                this.isResizingViewport = false;
                this.viewportResizeCorner = null;
                this.isPanning = false;
                this.canvas.style.cursor = 'grab';

                if (stateChanged) {
                    this.broadcastImageUpdate();
                }
                const selected_image = this.checkImageSelection(click_position);
                if (selected_image !== null && !this.isMoving) {
                    this.selectedImageId = selected_image;
                    this.renderCanvas();
                }
            }
        },

        checkImageSelection(click_position) {
            // Check if an image is selected at the given click position and return the image id.
            let image_id = null;
            const images = this.layerImages[this.selectedLayer];
            if (images) {
                for (let i = images.length - 1; i >= 0; i--) {
                    const img = images[i];
                    if (this.isClickInImage(click_position, img)) {
                        image_id = i;
                        break
                    }
                }
            }
            return image_id;
        },

        handleKeyDown(event) {
            if (event.key === 'Delete' || event.keyCode === 46) {
                this.handleDeleteKey();
            } else if (event.key === 'Escape') {
                if (this.selectedLayer === "Fog") {
                    this.fogLayer.cancelCurrentPolygon();
                    this.renderCanvas();
                }
            } else if (event.ctrlKey && event.key === 'z') {
                if (this.selectedLayer === "Fog") {
                    this.fogLayer.eraseLastPoint();
                    this.renderCanvas();
                }
            }
        },

        handleDeleteKey() {
            if (this.selectedImageId !== null) {
                this.layerImages[this.selectedLayer].splice(this.selectedImageId, 1);
                this.draggedImage = null;
                this.renderCanvas();
                this.broadcastImageUpdate();
            }
        },

        handleWheel(event) {
            // Disable zoom in player view
            if (this.isPlayerView) return;

            event.preventDefault();

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;

            // Calculate zoom change
            const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.max(0.1, Math.min(5, this.zoomLevel * zoomFactor));

            // Calculate world coordinates of mouse position before zoom
            const worldX = (mouseX - this.canvasOffsetX) / this.zoomLevel;
            const worldY = (mouseY - this.canvasOffsetY) / this.zoomLevel;

            // Update zoom
            this.zoomLevel = newZoom;

            // Adjust offset to keep mouse position fixed
            this.canvasOffsetX = mouseX - worldX * this.zoomLevel;
            this.canvasOffsetY = mouseY - worldY * this.zoomLevel;

            this.renderCanvas();
        },

        togglePlayerViewport() {
            this.isPlayerViewportEnabled = !this.isPlayerViewportEnabled;
            this.renderCanvas();
            if (this.isPlayerViewportEnabled) {
                this.broadcastFullUpdate();
            }
        },

        toggleMagnet() {
            this.isMagnetEnabled = !this.isMagnetEnabled;
        },

        openPlayerView() {
            const url = window.location.origin + window.location.pathname + '?mode=player';
            window.open(url, '_blank');
            this.broadcastImageUpdate();
        },

        eraseLastFogDrawing() {
            this.fogLayer.eraseLastDrawing();
            this.renderCanvas();
        },

        eraseAllFogDrawings() {
            this.fogLayer.eraseAllDrawings();
            this.renderCanvas();
        },

        broadcastPlayerViewResize() {
            this.broadcastChannel.postMessage({
                type: 'player-view-resize',
                state: {
                    canvasHeight: this.canvasHeight,
                    canvasWidth: this.canvasWidth
                }
            })
        },

        broadcastFullUpdate() {
            if (this.isPlayerView || !this.broadcastChannel) return;

            // Convert images to serializable format
            const serializableImages = {};
            for (const layer in this.layerImages) {
                serializableImages[layer] = this.layerImages[layer].map(img => ({
                    src: img.img.src,
                    x: img.x,
                    y: img.y,
                    width: img.width,
                    height: img.height,
                    layer: img.layer
                }));
            }

            this.broadcastChannel.postMessage({
                type: 'full-update',
                state: {
                    layerImages: serializableImages,
                    gridCellSize: this.gridCellSize,
                    isGridEnabled: this.isGridEnabled,
                    gridOffsetX: this.gridOffsetX,
                    gridOffsetY: this.gridOffsetY,
                    gridAnchorCol: this.gridAnchorCol,
                    gridAnchorRow: this.gridAnchorRow,
                    playerViewportX: this.playerViewportX,
                    playerViewportY: this.playerViewportY,
                    playerViewportWidth: this.playerViewportWidth,
                    playerViewportHeight: this.playerViewportHeight,
                    isPlayerViewportEnabled: this.isPlayerViewportEnabled,
                    fogLayer: this.fogLayer.getJson()
                }
            });
        },

        broadcastImageUpdate() {
            if (this.isPlayerView || !this.broadcastChannel) return;

            // Convert images to serializable format
            const serializableImages = {};
            for (const layer in this.layerImages) {
                serializableImages[layer] = this.layerImages[layer].map(img => ({
                    src: img.img.src,
                    x: img.x,
                    y: img.y,
                    width: img.width,
                    height: img.height,
                    layer: img.layer
                }));
            }

            this.broadcastChannel.postMessage({
                type: 'image-update',
                state: {
                    layerImages: serializableImages,
                    gridCellSize: this.gridCellSize,
                    isGridEnabled: this.isGridEnabled,
                    gridOffsetX: this.gridOffsetX,
                    gridOffsetY: this.gridOffsetY,
                    gridAnchorCol: this.gridAnchorCol,
                    gridAnchorRow: this.gridAnchorRow,
                    playerViewportX: this.playerViewportX,
                    playerViewportY: this.playerViewportY,
                    playerViewportWidth: this.playerViewportWidth,
                    playerViewportHeight: this.playerViewportHeight,
                    isPlayerViewportEnabled: this.isPlayerViewportEnabled,
                }
            });
        },

        broadcastFogUpdate() {
            this.broadcastChannel.postMessage({
                type: 'fog-update',
                state: {
                    fogLayer: this.fogLayer.getJson()
                }
            });
        },

        handleBroadcastMessage(data) {
            if (data.type === 'image-update' || data.type === 'full-update') {
                const state = data.state;

                // Update images - reconstruct Image objects
                for (const layer in state.layerImages) {
                    this.layerImages[layer] = state.layerImages[layer].map(imgData => {
                        const img = new Image();
                        img.src = imgData.src;
                        return {
                            img: img,
                            x: imgData.x,
                            y: imgData.y,
                            width: imgData.width,
                            height: imgData.height,
                            layer: imgData.layer
                        };
                    });
                }

                // Update grid settings
                this.gridCellSize = state.gridCellSize;
                this.isGridEnabled = state.isGridEnabled;
                this.gridOffsetX = state.gridOffsetX;
                this.gridOffsetY = state.gridOffsetY;
                this.gridAnchorCol = state.gridAnchorCol;
                this.gridAnchorRow = state.gridAnchorRow;

                // In player view, use viewport to calculate zoom/pan
                if (this.isPlayerView) {
                    const widthRatio = this.canvasWidth / state.playerViewportWidth;
                    const heightRatio = this.canvasHeight / state.playerViewportHeight;
                    this.zoomLevel = Math.min(widthRatio, heightRatio);

                    this.canvasOffsetX = -state.playerViewportX * this.zoomLevel;
                    this.canvasOffsetY = -state.playerViewportY * this.zoomLevel;
                }
            }
            if (data.type === 'fog-update' || data.type === 'full-update') {
                this.fogLayer.loadJson(data.state.fogLayer);
            }
            if (data.type === 'player-view-resize') {
                const widthRatio = data.state.canvasWidth / this.playerViewportWidth;
                const heightRatio = data.state.canvasHeight / this.playerViewportHeight
                const scaleFactor = Math.min(widthRatio, heightRatio);
                // this.playerViewportHeight = data.state.canvasHeight / whratio / this.zoomLevel;
                this.playerViewportWidth = data.state.canvasWidth / this.zoomLevel;
                this.playerViewportHeight = data.state.canvasHeight / this.zoomLevel;
            }
            this.renderCanvas();
        },

        async saveTable() {
            this.isLoading = true;
            const zip = new JSZip();

            const mapData = {
                name: "",
                version: "1",
                savedAt: new Date().toISOString(),
                grid: {
                    cellSize: this.gridCellSize,
                    isGridEnabled: this.isGridEnabled,
                    offsetX: this.gridOffsetX,
                    offsetY: this.gridOffsetY,
                    anchorCol: this.gridAnchorCol,
                    anchorRow: this.gridAnchorRow
                },
                view: {
                    zoomLevel: this.zoomLevel,
                    canvasOffsetX: this.canvasOffsetX,
                    canvasOffsetY: this.canvasOffsetY
                },
                viewport: {
                    x: this.playerViewportX,
                    y: this.playerViewportY,
                    width: this.playerViewportWidth,
                    height: this.playerViewportHeight,
                    isPlayerViewportEnabled: this.isPlayerViewportEnabled
                },
                image_layers: {},
                fog_layer: this.fogLayer.getJson()
            };
            for (const layer in this.layerImages) {
                mapData.image_layers[layer] = [];
                for (let img_index = 0; img_index < this.layerImages[layer].length; img_index++) {
                    const img = this.layerImages[layer][img_index];
                    const dst_img_path = `images/${layer}/img_${img_index}.png`;
                    mapData.image_layers[layer].push({
                        src: dst_img_path,
                        x: img.x,
                        y: img.y,
                        width: img.width,
                        height: img.height
                    });
                    const dataURL = img.img.src;
                    const base64Data = dataURL.split(',')[1];
                    const imageData = atob(base64Data);
                    const byteArray = new Uint8Array(imageData.length);
                    for (let j = 0; j < imageData.length; j++) {
                        byteArray[j] = imageData.charCodeAt(j);
                    }
                    zip.file(dst_img_path, byteArray, {binary: true});
                }
            }
            zip.file('map_data.json', JSON.stringify(mapData));
            const save_file = await zip.generateAsync({type: "blob"})
            saveAs(save_file, "new_table.dtable");
            this.isLoading = false;
        },


        async loadTableFile(ziparchive) {
            try {
                const jsonFile = ziparchive.file('map_data.json');
                if (!jsonFile) {
                    alert("Table file has an incorrect format.");
                    return;
                }
                const jsonData = await jsonFile.async('text');
                const data = JSON.parse(jsonData);

                // Load grid settings
                this.gridCellSize = data.grid.cellSize;
                this.isGridEnabled = data.grid.isGridEnabled;
                this.gridOffsetX = data.grid.offsetX;
                this.gridOffsetY = data.grid.offsetY;
                this.gridAnchorCol = data.grid.anchorCol;
                this.gridAnchorRow = data.grid.anchorRow;

                // Load view settings
                this.zoomLevel = data.view.zoomLevel;
                this.canvasOffsetX = data.view.canvasOffsetX;
                this.canvasOffsetY = data.view.canvasOffsetY;

                // Load viewport settings
                this.playerViewportX = data.viewport.x;
                this.playerViewportY = data.viewport.y;
                this.playerViewportWidth = data.viewport.width;
                this.playerViewportHeight = data.viewport.height;
                this.isPlayerViewportEnabled = data.viewport.isPlayerViewportEnabled;
                this.layerImages = {};

                // Load fog layer
                this.fogLayer.loadJson(data.fog_layer)

                // Load all images
                for (const [layer, layerContent] of Object.entries(data.image_layers)) {
                    this.layerImages[layer] = [];
                    for (const image of layerContent) {
                        const imageFile = ziparchive.file(image.src);
                        if (!imageFile) {
                            console.warn(`The following file could not be loaded : ${image.src}`);
                            continue;
                        }
                        const imageData = await imageFile.async('uint8array');
                        const blob = new Blob([imageData], {type: 'image/png'});
                        const reader = new FileReader();
                        await new Promise((resolve) => {
                            reader.onload = (e) => {
                                const img = new Image();
                                img.onload = () => {
                                    const imageObject = {
                                        img: img,
                                        x: image.x,
                                        y: image.y,
                                        width: image.width,
                                        height: image.height,
                                        layer: layer,
                                    };
                                    this.layerImages[layer].push(imageObject);
                                    resolve();
                                };
                                img.src = e.target.result;
                            };
                            reader.readAsDataURL(blob);
                        });
                    }
                }
                this.renderCanvas();
                this.broadcastFullUpdate();
            } catch (error) {
                console.error("An error occured while loading Table :", error);
            }
        },

        async loadTable(event) {
            const file = event.target.files[0];
            if (!file) return;
            try {
                const zip = new JSZip();
                const zipContent = await zip.loadAsync(file);
                await this.loadTableFile(zipContent);
                event.target.value = '';
            } catch (error) {
                console.error(error);
                alert('An error occured while loading file.');
            } finally {
                this.isLoading = false; // Masquer le loader
            }
        }

    }
};