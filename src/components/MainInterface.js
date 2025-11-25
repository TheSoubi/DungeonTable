import JSZip from "jszip";
import {saveAs} from 'file-saver';
import FogLayer from "./FogLayer";
import GridLayer from "./GridLayer";
import ImageLayer from "./ImageLayer";
import debounce from 'lodash.debounce';

const MAX_HISTORY_LENGTH = 20;

export default {
    data() {
        return {
            game: null,
            canvas: null,
            ctx: null,
            editable_layers: ['Map', 'Grid', 'Token', 'Fog', 'GM'],
            selectedLayer: 'Map',
            mapLayer: null,
            gridLayer: null,
            tokenLayer: null,
            GMLayer: null,
            imageLayers: null,
            hasClicked: false,
            isDragging: false,
            isMoving: false,
            draggedImage: null,
            dragOffset: {x: 0, y: 0},
            isResizing: false,
            resizeCorner: null,
            resizeStartSize: {width: 0, height: 0},
            resizeStartPos: {x: 0, y: 0},
            canvasWidth: 0,
            canvasHeight: 0,
            isToolboxMinimized: false,
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
            mapName: '',
            savedMaps: [],
            isLoading: false,
            fogLayer: null,
            gmFlagImg: null,
            isMagnetEnabled: false,
            isFogEnabled: false,
            isGridEnabled: true,
            history: []
        };
    },
    created() {
        this.createGame();
        window.addEventListener('resize', debounce(this.handleWindowResize, 100));
        window.addEventListener('keydown', this.handleKeyDown);

        // Check if this is player view
        const urlParams = new URLSearchParams(window.location.search);
        this.isPlayerView = urlParams.get('mode') === 'player';

        // Set up BroadcastChannel for synchronization between main window and player's window
        this.broadcastChannel = new BroadcastChannel('game-sync');
        this.broadcastChannel.onmessage = (event) => {
            this.handleBroadcastMessage(event.data);
        };

        // Create all layers
        this.fogLayer = new FogLayer(this.isPlayerView);
        this.fogLayer.setUpdateCallback(() => {
            this.broadcastFullUpdate()
        });
        this.gridLayer = new GridLayer();
        this.mapLayer = new ImageLayer("Map");
        this.tokenLayer = new ImageLayer("Token");
        this.GMLayer = new ImageLayer("GM");
        this.imageLayers = {"Map": this.mapLayer, "Token": this.tokenLayer, "GM": this.GMLayer};
        this.resetHistory();

        if (this.isPlayerView) {
            this.broadcastUpdateRequest();
        }
    },
    beforeUnmount() {
        window.removeEventListener('resize', debounce(this.handleWindowResize, 200));
        window.removeEventListener('keydown', this.handleKeyDown);
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
            this.handleWindowResize();
            this.renderCanvas();
        },

        selectLayer(layer) {
            if (this.selectedLayer in this.imageLayers) {
                this.imageLayers[this.selectedLayer].resetImageSelection();
            } else if (this.selectedLayer === "Fog") {
                this.fogLayer.cancelCurrentPolygon();
            }
            this.selectedLayer = layer;
            this.renderCanvas();
        },

        handleWindowResize() {
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

        async handleImageUpload(event) {
            const file = event.target.files[0];
            if (!file || this.selectedLayer === 'Grid') return;

            let maxWidth = null;
            let maxHeight = null;
            if (this.selectedLayer === 'Map') {
                maxWidth = this.canvasWidth * 0.8;
                maxHeight = this.canvasHeight * 0.8;
            }
            await this.imageLayers[this.selectedLayer].addImage(file, null, null, null, null);
            this.imageLayers[this.selectedLayer].selectLastImage();
            this.saveCurrentStateToHistory();
            this.renderCanvas();
            this.broadcastFullUpdate();
            event.target.value = '';
        },

        renderCanvas() {
            // console.log("render canvas");
            if (!this.ctx) return;
            this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

            // Apply zoom and pan transforms
            this.ctx.save();
            this.ctx.translate(this.canvasOffsetX, this.canvasOffsetY);
            this.ctx.scale(this.zoomLevel, this.zoomLevel);

            this.mapLayer.drawOnCanvas(this.canvas, this.zoomLevel);
            this.gridLayer.drawOnCanvas(this.canvas, this.canvasOffsetX, this.canvasOffsetY, this.canvasWidth, this.canvasHeight, this.zoomLevel);
            this.tokenLayer.drawOnCanvas(this.canvas, this.zoomLevel);
            this.fogLayer.drawOnCanvas(this.canvas, this.canvasOffsetX, this.canvasOffsetY, this.canvasWidth, this.canvasHeight, this.zoomLevel);
            if (!this.isPlayerView) {
                this.GMLayer.drawOnCanvas(this.canvas, this.zoomLevel);
            }
            // Draw player viewport rectangle above all layers
            if (!this.isPlayerView) {
                this.drawPlayerViewport();
            }
            this.ctx.restore();
        },

        drawPlayerViewport() {
            // Draw blue rectangle showing player viewport
            this.ctx.strokeStyle = '#0066ff';
            this.ctx.lineWidth = 5 / this.zoomLevel;
            this.ctx.setLineDash([10, 10]);
            this.ctx.strokeRect(
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
            this.ctx.font = `bold ${15 / this.zoomLevel}px Arial`;
            this.ctx.fillText("Player's View", this.playerViewportX + 5 / this.zoomLevel, this.playerViewportY + 20 / this.zoomLevel);
        },

        getCursorTypeAtPosition(mouse_position, zoomLevel, is_click_pressed) {
            const closest_viewport_handle = this.getViewportResizeHandle(mouse_position);
            const closest_move_handle = this.getViewportMoveHandle(mouse_position);
            if (closest_viewport_handle !== null) {
                if (closest_viewport_handle === 'top-left') return 'nw-resize';
                else if (closest_viewport_handle === 'top-right') return 'ne-resize';
                else if (closest_viewport_handle === 'bottom-left') return 'sw-resize';
                else if (closest_viewport_handle === 'bottom-right') return 'se-resize';
                else if (closest_viewport_handle === 'top') return 'n-resize';
                else if (closest_viewport_handle === 'bottom') return 's-resize';
                else if (closest_viewport_handle === 'left') return 'w-resize';
                else if (closest_viewport_handle === 'right') return 'e-resize';
                else return 'default';
            } else if (closest_move_handle !== null) return 'move';
            else {
                if (this.selectedLayer in this.imageLayers) {
                    const image_under_click = this.imageLayers[this.selectedLayer].getImageAtPosition(mouse_position);
                    const selected_image = this.imageLayers[this.selectedLayer].getSelectedImage();
                    // console.log(image_under_click);
                    if (image_under_click !== null) {
                        const closest_resize_handle = this.imageLayers[this.selectedLayer].getClosestResizeHandle(mouse_position, zoomLevel);
                        if (closest_resize_handle !== null) {
                            if (closest_resize_handle.handle_name === 'top-left') return 'nw-resize';
                            else if (closest_resize_handle.handle_name === 'top-right') return 'ne-resize';
                            else if (closest_resize_handle.handle_name === 'bottom-left') return 'sw-resize';
                            else if (closest_resize_handle.handle_name === 'bottom-right') return 'se-resize';
                            else if (closest_resize_handle.handle_name === 'top') return 'n-resize';
                            else if (closest_resize_handle.handle_name === 'bottom') return 's-resize';
                            else if (closest_resize_handle.handle_name === 'left') return 'w-resize';
                            else if (closest_resize_handle.handle_name === 'right') return 'e-resize';
                            else return 'default';
                        } else {
                            if (selected_image !== null && image_under_click.id === selected_image.id) {
                                return 'move';
                            } else return 'pointer';
                        }
                    } else {
                        return 'default';
                    }
                } else return 'default';
            }
        },

        getViewportResizeHandle(position) {
            const handleSize = 10 / this.zoomLevel;
            const threshold = 2 * handleSize;
            if (Math.abs(position.x - this.playerViewportX) < threshold && Math.abs(position.y - this.playerViewportY) < threshold) return 'top-left';
            else if (Math.abs(position.x - (this.playerViewportX + this.playerViewportWidth)) < threshold && Math.abs(position.y - this.playerViewportY) < threshold) return 'top-right';
            else if (Math.abs(position.x - this.playerViewportX) < threshold && Math.abs(position.y - (this.playerViewportY + this.playerViewportHeight)) < threshold) return 'bottom-left';
            else if (Math.abs(position.x - (this.playerViewportX + this.playerViewportWidth)) < threshold && Math.abs(position.y - (this.playerViewportY + this.playerViewportHeight)) < threshold) return 'bottom-right';
            else return null;
        },

        getViewportMoveHandle(position) {
            const handleSize = 10 / this.zoomLevel;
            const threshold = 2 * handleSize;
            if (Math.abs(position.x - this.playerViewportX) < threshold && position.y > this.playerViewportY && position.y < this.playerViewportY + this.playerViewportHeight) return 'move';
            else if (Math.abs(position.x - this.playerViewportWidth - this.playerViewportX) < threshold && position.y > this.playerViewportY && position.y < this.playerViewportY + this.playerViewportHeight) return 'move';
            else if (Math.abs(position.y - this.playerViewportY) < threshold && position.x > this.playerViewportX && position.x < this.playerViewportX + this.playerViewportWidth) return 'move';
            else if (Math.abs(position.y - this.playerViewportHeight - this.playerViewportY) < threshold && position.x > this.playerViewportX && position.x < this.playerViewportX + this.playerViewportWidth) return 'move';
            else return null;
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

            // Check viewport rectangle first
            const viewportResizeHandle = this.getViewportResizeHandle(click_position);
            const viewportMoveHandle = this.getViewportMoveHandle(click_position);
            if (viewportResizeHandle !== null) {
                this.isResizingViewport = true;
                this.viewportResizeCorner = viewportResizeHandle;
                return;
            }
            if (viewportMoveHandle !== null) {
                this.isDraggingViewport = true;
                this.viewportDragOffset = {
                    x: click_position.x - this.playerViewportX,
                    y: click_position.y - this.playerViewportY
                };
                return;
            }
            // Handling Layer's manipulation
            if (this.selectedLayer === 'Grid') {
                this.isPanning = true;
                this.panStart = {x: click_X, y: click_Y};
                this.renderCanvas();
            } else if (this.selectedLayer in this.imageLayers) {
                let is_one_object_selected = false;
                const selected_handle = this.imageLayers[this.selectedLayer].getClosestResizeHandle(click_position, this.zoomLevel);
                if (selected_handle !== null) {
                    this.isResizing = true;
                    this.imageLayers[this.selectedLayer].selectHandle(selected_handle.handle_name);
                    this.draggedImage = selected_handle.image;
                    this.resizeStartSize = {width: selected_handle.image.width, height: selected_handle.image.height};
                    this.resizeStartPos = {x: selected_handle.image.x, y: selected_handle.image.y};
                    is_one_object_selected = true;
                    return;
                }
                const selected_image = this.imageLayers[this.selectedLayer].getImageAtPosition(click_position);
                const current_image_selection = this.imageLayers[this.selectedLayer].getSelectedImage();
                if (selected_image !== null && current_image_selection !== null && selected_image.id === current_image_selection.id) {
                    this.isDragging = true;
                    this.draggedImage = selected_image.image;
                    this.dragOffset = {
                        x: click_position.x - selected_image.image.x,
                        y: click_position.y - selected_image.image.y
                    };
                    is_one_object_selected = true;
                    this.imageLayers[this.selectedLayer].selectImageByID(selected_image.id);
                    return;
                } else {
                    this.isPanning = true;
                    this.panStart = {x: click_X, y: click_Y};
                    this.renderCanvas();
                }
            }
        },

        async processSelectedImage() {
            if (this.selectedLayer in this.imageLayers) {
                const grid_cell_size = this.gridLayer.get_grid_cell_size()
                this.isLoading = true;
                try {
                    await this.imageLayers[this.selectedLayer].processSelectedImage(grid_cell_size);
                    this.saveCurrentStateToHistory();
                }
                catch (error) {
                    console.log(error);
                }
                this.isLoading = false;
                this.renderCanvas();
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
            let is_state_changed = false;

            if (this.isDraggingViewport) {
                this.canvas.style.cursor = 'grabbing';
                this.playerViewportX = click_position.x - this.viewportDragOffset.x;
                this.playerViewportY = click_position.y - this.viewportDragOffset.y;
                is_state_changed = true;
            } else if (this.isResizingViewport) {
                this.resizeViewport(click_position);
                is_state_changed = true;
            } else if (this.isPanning) {
                this.canvas.style.cursor = 'grabbing';
                this.canvasOffsetX += click_X - this.panStart.x;
                this.canvasOffsetY += click_Y - this.panStart.y;
                this.panStart = {x: click_X, y: click_Y};
                is_state_changed = true;
            } else {
                if (this.isResizing && this.draggedImage && this.selectedLayer in this.imageLayers) {
                    this.imageLayers[this.selectedLayer].resizeSelectedImage(this.resizeStartPos, this.resizeStartSize, click_position);
                    is_state_changed = true;
                } else if (this.isDragging && this.draggedImage) {
                    this.canvas.style.cursor = 'move';
                    this.draggedImage.x = click_position.x - this.dragOffset.x;
                    this.draggedImage.y = click_position.y - this.dragOffset.y;
                    is_state_changed = true;
                }
                this.canvas.style.cursor = this.getCursorTypeAtPosition(click_position, this.zoomLevel, this.hasClicked);
            }

            if (this.selectedLayer === "Fog") {
                if (!this.isPanning) {
                    this.canvas.style.cursor = 'crosshair';
                }
                let final_click_position = click_position;
                if (this.isMagnetEnabled) {
                    final_click_position = this.gridLayer.getClosestSnapCoordinates(click_position);
                }
                this.fogLayer.handleMouseMove(final_click_position.x, final_click_position.y);
                is_state_changed = true;
            } else {
                this.fogLayer.cancelCurrentPolygon();
            }
            if (is_state_changed) {
                this.renderCanvas();
            }
        },

        resizeViewport(click_position) {
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
                let has_changed = false;
                let is_new_state = false;

                // Snap token layer images to grid
                if (this.isDragging && this.draggedImage) {
                    if (this.selectedLayer === 'Token') {
                        const new_coordinates = this.gridLayer.getImageSnapCoordinates(this.draggedImage);
                        this.draggedImage.x = new_coordinates.x;
                        this.draggedImage.y = new_coordinates.y;
                    }
                    has_changed = true;
                    is_new_state = true;
                }

                // Broadcast state if anything changed
                if (this.isDragging || this.isResizing || this.isDraggingViewport || this.isResizingViewport) {
                    has_changed = true;
                    is_new_state = true;
                }

                // Handle Fog
                if (this.selectedLayer === "Fog" && !this.isMoving) {
                    let final_click_position = click_position;
                    if (this.isMagnetEnabled) {
                        final_click_position = this.gridLayer.getClosestSnapCoordinates(click_position);
                    }
                    const is_fog_modified = this.fogLayer.handleMouseUp(final_click_position.x, final_click_position.y);
                    has_changed = true;
                    is_new_state = is_fog_modified;
                } else if (this.selectedLayer in this.imageLayers) {
                    this.imageLayers[this.selectedLayer].resetHandleSelection();
                    const selected_image = this.imageLayers[this.selectedLayer].getImageAtPosition(click_position);
                    const current_image_selection = this.imageLayers[this.selectedLayer].getSelectedImage();
                    if (selected_image !== null && current_image_selection === null && !this.isMoving) {
                        this.imageLayers[this.selectedLayer].selectImageByID(selected_image.id);
                        has_changed = true;
                    } else if (selected_image === null && current_image_selection !== null && !this.isMoving) {
                        this.imageLayers[this.selectedLayer].resetImageSelection();
                        has_changed = true;
                    } else if (selected_image !== null && current_image_selection !== null && selected_image.id !== current_image_selection.id && !this.isMoving) {
                        this.imageLayers[this.selectedLayer].resetImageSelection();
                        has_changed = true;
                    }
                }
                this.isDragging = false;
                this.isResizing = false;
                this.draggedImage = null;
                this.isDraggingViewport = false;
                this.isResizingViewport = false;
                this.viewportResizeCorner = null;
                this.isPanning = false;
                if (is_new_state) {
                    this.saveCurrentStateToHistory();
                }
                if (has_changed) {
                    this.renderCanvas();
                    this.broadcastFullUpdate();
                }
            }
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
                this.undo();
            }
        },

        handleDeleteKey() {
            let is_deleted = this.imageLayers[this.selectedLayer].removeSelectedImage();
            if (is_deleted) {
                this.draggedImage = null;
                this.saveCurrentStateToHistory();
                this.renderCanvas();
                this.broadcastFullUpdate();
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

        toggleMagnet() {
            this.isMagnetEnabled = !this.isMagnetEnabled;
        },

        toggleFog() {
            this.isFogEnabled = !this.isFogEnabled;
            this.fogLayer.setFogVisibility(this.isFogEnabled);
            this.saveCurrentStateToHistory();
            this.renderCanvas();
            this.broadcastFullUpdate();
        },

        toggleGrid() {
            this.isGridEnabled = !this.isGridEnabled;
            this.gridLayer.isGridEnabled = this.isGridEnabled;
            this.saveCurrentStateToHistory();
            this.renderCanvas();
            this.broadcastFullUpdate();
        },

        openPlayerView() {
            const url = window.location.origin + window.location.pathname + '?mode=player';
            window.open(url, '_blank');
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

        getGlobalState(){
            const all_images = {};
            for (const layer in this.imageLayers) {
                all_images[layer] = this.imageLayers[layer].getJson();
            }
            return {
                    layerImages: all_images,
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
                    fogLayer: this.fogLayer.getJson()
                }
        },

        setGlobalState(state){
            // Update image layers
            for (const layer in state.layerImages) {
                    if (layer in this.imageLayers) {
                        this.imageLayers[layer].loadJson(state.layerImages[layer]);
                    }
                }
            // Update grid settings
            this.gridCellSize = state.gridCellSize;
            this.isGridEnabled = state.isGridEnabled;
            this.gridLayer.setGridVisibility(state.isGridEnabled);
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
            } else {
                this.playerViewportX = state.playerViewportX;
                this.playerViewportY = state.playerViewportY;
                this.playerViewportWidth = state.playerViewportWidth;
                this.playerViewportHeight = state.playerViewportHeight;
            }
            // Update fog
            this.isFogEnabled = state.fogLayer.isFogEnabled;
            this.fogLayer.loadJson(state.fogLayer);
        },

        broadcastUpdateRequest(){
            this.broadcastChannel.postMessage({
                type: 'request-update',
            });
        },

        broadcastFullUpdate() {
            // console.log("broadcast update !");
            if (this.isPlayerView || !this.broadcastChannel) return;
            this.broadcastChannel.postMessage({
                type: 'full-update',
                state: this.getGlobalState()
            });
        },

        handleBroadcastMessage(data) {
            if (data.type === 'full-update') {
                this.setGlobalState(data.state);
                this.renderCanvas();
            }
            else if (data.type === 'player-view-resize') {
                const widthRatio = data.state.canvasWidth / this.playerViewportWidth;
                const heightRatio = data.state.canvasHeight / this.playerViewportHeight
                const scaleFactor = Math.min(widthRatio, heightRatio);
                // this.playerViewportHeight = data.state.canvasHeight / whratio / this.zoomLevel;
                this.playerViewportWidth = data.state.canvasWidth / this.zoomLevel;
                this.playerViewportHeight = data.state.canvasHeight / this.zoomLevel;
                this.renderCanvas();
            }
            else if (data.type === 'request-update') {
                this.broadcastFullUpdate();
                this.renderCanvas();
            }
        },

        /*
        Table file is a json file with the following format:
        {
        "name": "",
        "version": "1",
        "savedAt": "2025-11-15T10:52:59.734Z",
        "grid": {},
        "view": {
            "zoomLevel": 0.49774952626127594,
            "canvasOffsetX": 280.0828334636053,
            "canvasOffsetY": 231.09193394519312
        },
        "viewport": {
            "x": -155,
            "y": -316,
            "width": 460,
            "height": 460
        },
        "image_layers": {
            "Map": [
            {
                "src": "images/Map/img.png",
                "x": 0,
                "y": 0,
                "width": 0,
                "height": 0
            }
            ],
            "Token": [],
            "GM": []
        },
        "fog_layer": {
            "isFogEnabled": false,
            "fogPolygons": []
        }
        }
        */
        async saveTable() {
            this.isLoading = true;
            try {
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
                    },
                    image_layers: {},
                    fog_layer: this.fogLayer.getJson()
                };
                for (const layer in this.imageLayers) {
                    mapData.image_layers[layer] = [];
                    for (let img_index = 0; img_index < this.imageLayers[layer].images.length; img_index++) {
                        const img = this.imageLayers[layer].images[img_index];
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
            } catch (error) {
                console.error("An error occured while saving Table :", error);
                this.isLoading = false;
            }
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

                // Load fog layer
                this.fogLayer.loadJson(data.fog_layer)

                // Load all images
                for (const [layer_name, layer_image_list] of Object.entries(data.image_layers)) {
                    if (layer_name in this.imageLayers) {
                        await this.imageLayers[layer_name].loadJsonWithFiles(layer_image_list, ziparchive);
                    }
                }
                this.renderCanvas();
                this.broadcastFullUpdate();
                this.resetHistory();
            } catch (error) {
                console.error("An error occured while loading Table :", error);
            }
        },

        async loadTable(event) {
            const file = event.target.files[0];
            this.isLoading = true;
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
        },

        resetHistory() {
            this.history = [];
            this.saveCurrentStateToHistory();
        },

        saveCurrentStateToHistory() {
            if (this.history.length > MAX_HISTORY_LENGTH) {
                this.history.shift();
            }
            this.history.push(this.getGlobalState());
        },

        undo() {
            if (this.history.length >= 2) {
                this.history.pop();
                this.setGlobalState(this.history.at(-1));
                this.renderCanvas();
                this.broadcastFullUpdate();
            }
        }
    }
};