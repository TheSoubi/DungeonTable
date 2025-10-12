import JSZip from "jszip";
import { saveAs } from 'file-saver';
import path from "path-browserify";

export default {
  data() {
    return {
      game: null,
      canvas: null,
      ctx: null,
      editable_layers: ['Map', 'Grid', 'Token', 'GM'],
      selectedLayer: 'Map',
      layerImages: {
        Map: [],
        Token: [],
        GM: []
      },
      selectedImageId: null,
      isDragging: false,
      isMoving: false,
      draggedImage: null,
      dragOffset: { x: 0, y: 0 },
      isResizing: false,
      resizeCorner: null,
      resizeStartSize: { width: 0, height: 0 },
      resizeStartPos: { x: 0, y: 0 },
      resizeAspectRatio: 1,
      canvasWidth: 0,
      canvasHeight: 0,
      toolboxMinimized: false,
      gridCellSize: 50,
      showGrid: true,
      draggingGridLine: null,
      gridLineIndex: 0,
      gridOffsetX: 0,
      gridOffsetY: 0,
      gridAnchorCol: 5,
      gridAnchorRow: 5,
      draggingGridAnchor: false,
      zoomLevel: 1,
      canvasOffsetX: 0,
      canvasOffsetY: 0,
      isPanning: false,
      panStart: { x: 0, y: 0 },
      isPlayerView: false,
      broadcastChannel: null,
      playerViewportX: 0,
      playerViewportY: 0,
      playerViewportWidth: 800,
      playerViewportHeight: 600,
      isDraggingViewport: false,
      isResizingViewport: false,
      viewportDragOffset: { x: 0, y: 0 },
      viewportResizeCorner: null,
      hasOpenPlayerView: false,
      mapName: '',
      isShowingOpenMapDialog: false,
      isShowingSaveMapDialog: false,
      savedMaps: [],
      isLoading: false
    };
  },
  mounted() {
    this.createGame()
    window.addEventListener('resize', this.handleResize);
    
    // Check if this is player view
    const urlParams = new URLSearchParams(window.location.search);
    this.isPlayerView = urlParams.get('mode') === 'player';
    
    // Set up BroadcastChannel for synchronization
    this.broadcastChannel = new BroadcastChannel('game-sync');
    
    if (this.isPlayerView) {
      // Player view: listen for updates
      this.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(event.data);
      };
    }
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize);
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

    selectLayer(layer){
      console.log(`select layer ${layer}`);
      this.selectedLayer = layer;
    },
    
    handleResize() {
      if (!this.canvas) return;
      
      this.canvasWidth = window.innerWidth;
      this.canvasHeight = window.innerHeight;
      this.canvas.width = this.canvasWidth;
      this.canvas.height = this.canvasHeight;
      
      this.renderCanvas();
    },
    
    screenToWorld(screenX, screenY) {
      return {
        x: (screenX - this.canvasOffsetX) / this.zoomLevel,
        y: (screenY - this.canvasOffsetY) / this.zoomLevel
      };
    },
    
    worldToScreen(worldX, worldY) {
      return {
        x: worldX * this.zoomLevel + this.canvasOffsetX,
        y: worldY * this.zoomLevel + this.canvasOffsetY
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
          this.broadcastState();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    
    renderCanvas() {
      if (!this.ctx) return;
      
      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      
      // Apply zoom and pan transforms
      this.ctx.save();
      this.ctx.translate(this.canvasOffsetX, this.canvasOffsetY);
      this.ctx.scale(this.zoomLevel, this.zoomLevel);
      
      this.drawLayerImages('Map');
      if (this.showGrid) {
        this.drawGrid();
      }
      this.drawLayerImages('Token');
      this.drawLayerImages('GM');
      
      // Draw player viewport rectangle in GM view
      if (!this.isPlayerView && this.hasOpenPlayerView) {
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
      
      // Draw resize handles at corners
      const handleSize = 10 / this.zoomLevel;
      this.ctx.fillStyle = '#0066ff';
      
      // Corner handles
      this.ctx.fillRect(this.playerViewportX - handleSize/2, this.playerViewportY - handleSize/2, handleSize, handleSize);
      this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth - handleSize/2, this.playerViewportY - handleSize/2, handleSize, handleSize);
      this.ctx.fillRect(this.playerViewportX - handleSize/2, this.playerViewportY + this.playerViewportHeight - handleSize/2, handleSize, handleSize);
      this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth - handleSize/2, this.playerViewportY + this.playerViewportHeight - handleSize/2, handleSize, handleSize);
      
      // Edge handles
      const edgeHandleSize = 8 / this.zoomLevel;
      this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth/2 - edgeHandleSize/2, this.playerViewportY - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
      this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth - edgeHandleSize/2, this.playerViewportY + this.playerViewportHeight/2 - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
      this.ctx.fillRect(this.playerViewportX + this.playerViewportWidth/2 - edgeHandleSize/2, this.playerViewportY + this.playerViewportHeight - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
      this.ctx.fillRect(this.playerViewportX - edgeHandleSize/2, this.playerViewportY + this.playerViewportHeight/2 - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
      
      // Label
      this.ctx.fillStyle = '#0066ff';
      this.ctx.font = `${14 / this.zoomLevel}px Arial`;
      this.ctx.fillText('Player View', this.playerViewportX + 5 / this.zoomLevel, this.playerViewportY - 10 / this.zoomLevel);
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
        if (layer === this.selectedLayer && !this.isPanning && image_index === this.selectedImageId) {
          this.ctx.strokeStyle = '#ff0000';
          this.ctx.lineWidth = 2 / this.zoomLevel;
          this.ctx.strokeRect(imageObj.x, imageObj.y, imageObj.width, imageObj.height);
          
          // Draw resize handles at corners and edges
          const handleSize = 8 / this.zoomLevel;
          this.ctx.fillStyle = '#ff0000';
          
          // Corner handles
          this.ctx.fillRect(imageObj.x - handleSize/2, imageObj.y - handleSize/2, handleSize, handleSize);
          this.ctx.fillRect(imageObj.x + imageObj.width - handleSize/2, imageObj.y - handleSize/2, handleSize, handleSize);
          this.ctx.fillRect(imageObj.x - handleSize/2, imageObj.y + imageObj.height - handleSize/2, handleSize, handleSize);
          this.ctx.fillRect(imageObj.x + imageObj.width - handleSize/2, imageObj.y + imageObj.height - handleSize/2, handleSize, handleSize);
          
          // Edge handles
          const edgeHandleSize = 6 / this.zoomLevel;
          this.ctx.fillStyle = '#0088ff';
          
          this.ctx.fillRect(imageObj.x + imageObj.width/2 - edgeHandleSize/2, imageObj.y - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
          this.ctx.fillRect(imageObj.x + imageObj.width - edgeHandleSize/2, imageObj.y + imageObj.height/2 - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
          this.ctx.fillRect(imageObj.x + imageObj.width/2 - edgeHandleSize/2, imageObj.y + imageObj.height - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
          this.ctx.fillRect(imageObj.x - edgeHandleSize/2, imageObj.y + imageObj.height/2 - edgeHandleSize/2, edgeHandleSize, edgeHandleSize);
        }
      }
    },
    
    drawGrid() {
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 1 / this.zoomLevel;
      
      const worldBounds = {
        minX: this.screenToWorld(0, 0).x,
        minY: this.screenToWorld(0, 0).y,
        maxX: this.screenToWorld(this.canvasWidth, this.canvasHeight).x,
        maxY: this.screenToWorld(0, this.canvasHeight).y
      };
      
      // Draw vertical lines
      for (let x = Math.floor(worldBounds.minX / this.gridCellSize) * this.gridCellSize + this.gridOffsetX % this.gridCellSize; 
           x <= worldBounds.maxX; 
           x += this.gridCellSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(x, worldBounds.minY);
        this.ctx.lineTo(x, worldBounds.maxY);
        this.ctx.stroke();
      }
      
      // Draw horizontal lines
      for (let y = Math.floor(worldBounds.minY / this.gridCellSize) * this.gridCellSize + this.gridOffsetY % this.gridCellSize; 
           y <= worldBounds.maxY; 
           y += this.gridCellSize) {
        this.ctx.beginPath();
        this.ctx.moveTo(worldBounds.minX, y);
        this.ctx.lineTo(worldBounds.maxX, y);
        this.ctx.stroke();
      }
      
      if (this.selectedLayer === 'Grid' && !this.isPanning) {
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.lineWidth = 3 / this.zoomLevel;
        
        for (let x = Math.floor(worldBounds.minX / this.gridCellSize) * this.gridCellSize + this.gridOffsetX % this.gridCellSize + this.gridCellSize; 
             x < worldBounds.maxX; 
             x += this.gridCellSize) {
          this.ctx.beginPath();
          this.ctx.moveTo(x, worldBounds.minY);
          this.ctx.lineTo(x, worldBounds.maxY);
          this.ctx.stroke();
        }
        
        for (let y = Math.floor(worldBounds.minY / this.gridCellSize) * this.gridCellSize + this.gridOffsetY % this.gridCellSize + this.gridCellSize; 
             y < worldBounds.maxY; 
             y += this.gridCellSize) {
          this.ctx.beginPath();
          this.ctx.moveTo(worldBounds.minX, y);
          this.ctx.lineTo(worldBounds.maxX, y);
          this.ctx.stroke();
        }
        
        // Draw anchor point
        const anchorX = this.gridAnchorCol * this.gridCellSize + this.gridOffsetX;
        const anchorY = this.gridAnchorRow * this.gridCellSize + this.gridOffsetY;
        
        this.ctx.fillStyle = '#00ff00';
        this.ctx.beginPath();
        this.ctx.arc(anchorX, anchorY, 6 / this.zoomLevel, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#008800';
        this.ctx.lineWidth = 2 / this.zoomLevel;
        this.ctx.stroke();
      }
    },

    isClickInImage(click_position, img){
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
      
      if (Math.abs(worldX - (img.x + img.width/2)) < edgeThreshold && Math.abs(worldY - img.y) < edgeThreshold) {
        return 'top';
      }
      if (Math.abs(worldX - (img.x + img.width)) < edgeThreshold && Math.abs(worldY - (img.y + img.height/2)) < edgeThreshold) {
        return 'right';
      }
      if (Math.abs(worldX - (img.x + img.width/2)) < edgeThreshold && Math.abs(worldY - (img.y + img.height)) < edgeThreshold) {
        return 'bottom';
      }
      if (Math.abs(worldX - img.x) < edgeThreshold && Math.abs(worldY - (img.y + img.height/2)) < edgeThreshold) {
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
      
      if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth/2)) < edgeThreshold && Math.abs(worldY - this.playerViewportY) < edgeThreshold) {
        return 'top';
      }
      if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth)) < edgeThreshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight/2)) < edgeThreshold) {
        return 'right';
      }
      if (Math.abs(worldX - (this.playerViewportX + this.playerViewportWidth/2)) < edgeThreshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight)) < edgeThreshold) {
        return 'bottom';
      }
      if (Math.abs(worldX - this.playerViewportX) < edgeThreshold && Math.abs(worldY - (this.playerViewportY + this.playerViewportHeight/2)) < edgeThreshold) {
        return 'left';
      }
      
      return null;
    },
    
    handleMouseDown(event) {
      console.log("MouseDownEvent!")
      const rect = this.canvas.getBoundingClientRect();
      const click_X = event.clientX - rect.left;
      const click_Y = event.clientY - rect.top;
      const click_position = this.screenToWorld(click_X, click_Y);
      this.isMoving = false;
      
      // Check viewport rectangle first (in GM view only)
      if (!this.isPlayerView && this.hasOpenPlayerView) {
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
      
      if (this.selectedLayer === 'Grid') {
        // Disable Grid editing in player view
        if (this.isPlayerView) {
          this.isPanning = true;
          this.panStart = { x: click_X, y: click_Y };
          this.renderCanvas();
          return;
        }
        
        // Check anchor point
        const anchorX = this.gridAnchorCol * this.gridCellSize + this.gridOffsetX;
        const anchorY = this.gridAnchorRow * this.gridCellSize + this.gridOffsetY;
        const anchorThreshold = 10 / this.zoomLevel;
        
        if (Math.abs(click_position.x - anchorX) < anchorThreshold && Math.abs(click_position.y - anchorY) < anchorThreshold) {
          this.draggingGridAnchor = true;
          return;
        }
        
        // Check grid lines
        const threshold = 5 / this.zoomLevel;
        let lineIndex = 1;
        
        for (let x = this.gridOffsetX % this.gridCellSize + this.gridCellSize; lineIndex < 100; x += this.gridCellSize) {
          if (Math.abs(click_position.x - x) < threshold) {
            this.draggingGridLine = { type: 'vertical', index: lineIndex };
            return;
          }
          lineIndex++;
        }
        
        lineIndex = 1;
        for (let y = this.gridOffsetY % this.gridCellSize + this.gridCellSize; lineIndex < 100; y += this.gridCellSize) {
          if (Math.abs(click_position.y - y) < threshold) {
            this.draggingGridLine = { type: 'horizontal', index: lineIndex };
            return;
          }
          lineIndex++;
        }
        
        // Start panning if no grid element clicked
        this.isPanning = true;
        this.panStart = { x: click_X, y: click_Y };
        this.renderCanvas();
      }
      // Handle other layers 
      else {
        const images = this.layerImages[this.selectedLayer];
        if (images) {
          let is_one_object_selected = false;
          for (let i = images.length - 1; i >= 0; i--) {
            const img = images[i];
            
            // Check resize handles
            const corner = this.getCornerAt(img, click_position.x, click_position.y);
            if (corner) {
              this.isResizing = true;
              this.resizeCorner = corner;
              this.draggedImage = img;
              this.resizeStartSize = { width: img.width, height: img.height };
              this.resizeStartPos = { x: img.x, y: img.y };
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
              console.log(`Selected Image ${this.selectedImageId}`)
              break;
            }
            else {
              this.selectedImageId = null;
            }
          }
          // Start panning if no object clicked
          if (!is_one_object_selected) {
            this.isPanning = true;
            this.panStart = {x: click_X, y: click_Y};
            this.renderCanvas();
          }
        } 
      }
    },
    
    handleMouseMove(event) {
      // console.log("MouseMouveEvent!");
      const rect = this.canvas.getBoundingClientRect();
      const click_X = event.clientX - rect.left;
      const click_Y = event.clientY - rect.top;
      const click_position = this.screenToWorld(click_X, click_Y);
      this.isMoving = true;
      
      if (this.isDraggingViewport) {
        this.playerViewportX = click_position.x - this.viewportDragOffset.x;
        this.playerViewportY = click_position.y - this.viewportDragOffset.y;
        this.renderCanvas();
      } else if (this.isResizingViewport) {
        const minSize = 100;
        const viewportAspectRatio = this.canvasWidth / this.canvasHeight;
        
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
        
        this.renderCanvas();
      } else if (this.isPanning) {
        // Disable panning in player view
        if (!this.isPlayerView) {
          this.canvasOffsetX += click_X - this.panStart.x;
          this.canvasOffsetY += click_Y - this.panStart.y;
          this.panStart = { x: click_X, y: click_Y };
          this.renderCanvas();
          this.canvas.style.cursor = 'grabbing';
        }
      } else if (this.draggingGridAnchor) {
        this.gridOffsetX = click_position.x - this.gridAnchorCol * this.gridCellSize;
        this.gridOffsetY = click_position.y - this.gridAnchorRow * this.gridCellSize;
        this.renderCanvas();
      } else if (this.draggingGridLine) {
        const newCellSize = this.draggingGridLine.type === 'vertical' 
          ? click_position.x / this.draggingGridLine.index
          : click_position.y / this.draggingGridLine.index;
        
        if (newCellSize >= 20 && newCellSize <= 150) {
          const anchorX = this.gridAnchorCol * this.gridCellSize + this.gridOffsetX;
          const anchorY = this.gridAnchorRow * this.gridCellSize + this.gridOffsetY;
          
          this.gridCellSize = Math.round(newCellSize);
          
          this.gridOffsetX = anchorX - this.gridAnchorCol * this.gridCellSize;
          this.gridOffsetY = anchorY - this.gridAnchorRow * this.gridCellSize;
          
          this.renderCanvas();
        }
      } else if (this.isResizing && this.draggedImage) {
        const img = this.draggedImage;
        const minSize = 20;
        
        // Corner resizing - preserve aspect ratio
        if (this.resizeCorner === 'bottom-right') {
          const newWidth = Math.max(minSize, click_position.x - img.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.width = newWidth;
          img.height = newHeight;
        } else if (this.resizeCorner === 'bottom-left') {
          const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - click_position.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
          img.width = newWidth;
          img.height = newHeight;
        } else if (this.resizeCorner === 'top-right') {
          const newWidth = Math.max(minSize, click_position.x - img.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
          img.width = newWidth;
          img.height = newHeight;
        } else if (this.resizeCorner === 'top-left') {
          const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - click_position.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
          img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
          img.width = newWidth;
          img.height = newHeight;
        }
        // Edge resizing - do NOT preserve aspect ratio
        else if (this.resizeCorner === 'top') {
          const newHeight = Math.max(minSize, this.resizeStartPos.y + this.resizeStartSize.height - click_position.y);
          img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
          img.height = newHeight;
        } else if (this.resizeCorner === 'right') {
          const newWidth = Math.max(minSize, click_position.x - img.x);
          img.width = newWidth;
        } else if (this.resizeCorner === 'bottom') {
          const newHeight = Math.max(minSize, click_position.y - img.y);
          img.height = newHeight;
        } else if (this.resizeCorner === 'left') {
          const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - click_position.x);
          img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
          img.width = newWidth;
        }
        
        this.renderCanvas();
      } else if (this.isDragging && this.draggedImage) {
        this.draggedImage.x = click_position.x - this.dragOffset.x;
        this.draggedImage.y = click_position.y - this.dragOffset.y;
        this.renderCanvas();
      }
      
      if (!this.isPanning && !this.isDragging && !this.isResizing && !this.draggingGridLine && !this.draggingGridAnchor) {
        this.canvas.style.cursor = 'grab';
      }
    },
    
    handleMouseUp(event) {
      console.log("MouseUpEvent!");
      const rect = this.canvas.getBoundingClientRect();
      const click_X = event.clientX - rect.left;
      const click_Y = event.clientY - rect.top;
      let stateChanged = false;
      // Snap token layer images to grid (only when dragging, not resizing)
      if (this.isDragging && this.draggedImage) {
        if (this.draggedImage.layer === 'Token') {
          this.snapToGrid(this.draggedImage);
        }
        this.renderCanvas();
        stateChanged = true;
      }
      
      // Broadcast state if anything changed
      if (this.isDragging || this.isResizing || this.draggingGridLine || this.draggingGridAnchor || this.isDraggingViewport || this.isResizingViewport) {
        stateChanged = true;
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
        this.broadcastState();
      }
      const click_position = this.screenToWorld(click_X, click_Y);
      const selected_image = this.checkImageSelection(click_position);
      if (selected_image !== null && !this.isMoving) {
        this.selectedImageId = selected_image;
        this.renderCanvas();
      }
    },

    checkImageSelection(click_position){
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
        console.log("Touche Suppr pressée !");
        this.handleDeleteKey();
      }
    },

    handleDeleteKey() {
      console.log(`Deleting image ${this.selectedImageId} of layer ${this.selectedLayer} containing ${this.layerImages[this.selectedLayer].length} images`);
      if (this.selectedImageId !== null) {
        console.log(`Deleting image`);
        this.layerImages[this.selectedLayer].splice(this.selectedImageId, 1);
        this.draggedImage = null;
        this.renderCanvas();
        this.broadcastState();
      }
    },
    
    snapToGrid(imageObj) {
      const imageCenterX = imageObj.x + imageObj.width / 2;
      const imageCenterY = imageObj.y + imageObj.height / 2;
      
      const gridCol = Math.round(imageCenterX / this.gridCellSize);
      const gridRow = Math.round(imageCenterY / this.gridCellSize);
      
      const gridCenterX = gridCol * this.gridCellSize;
      const gridCenterY = gridRow * this.gridCellSize;
      
      imageObj.x = gridCenterX - imageObj.width / 2;
      imageObj.y = gridCenterY - imageObj.height / 2;
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
      this.hasOpenPlayerView = !this.hasOpenPlayerView;
      this.renderCanvas();
      if (this.hasOpenPlayerView) {
        this.broadcastState();
      }
    },
    
    openPlayerView() {
      const url = window.location.origin + window.location.pathname + '?mode=player';
      window.open(url, '_blank');
      this.broadcastState();
    },
    
    broadcastState() {
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
        type: 'state-update',
        state: {
          layerImages: serializableImages,
          gridCellSize: this.gridCellSize,
          showGrid: this.showGrid,
          gridOffsetX: this.gridOffsetX,
          gridOffsetY: this.gridOffsetY,
          gridAnchorCol: this.gridAnchorCol,
          gridAnchorRow: this.gridAnchorRow,
          playerViewportX: this.playerViewportX,
          playerViewportY: this.playerViewportY,
          playerViewportWidth: this.playerViewportWidth,
          playerViewportHeight: this.playerViewportHeight,
          hasOpenPlayerView: this.hasOpenPlayerView
        }
      });
    },
    
    handleBroadcastMessage(data) {
      if (data.type === 'state-update') {
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
        this.showGrid = state.showGrid;
        this.gridOffsetX = state.gridOffsetX;
        this.gridOffsetY = state.gridOffsetY;
        this.gridAnchorCol = state.gridAnchorCol;
        this.gridAnchorRow = state.gridAnchorRow;
        
        // In player view, use viewport to calculate zoom/pan
        if (this.isPlayerView && state.hasOpenPlayerView) {
          // Calculate zoom to fit viewport into canvas
          const viewportWidth = state.playerViewportWidth;
          const viewportHeight = state.playerViewportHeight;
          
          const widthRatio = this.canvasWidth / viewportWidth;
          const heightRatio = this.canvasHeight / viewportHeight;
          
          // Use the smaller ratio to ensure entire viewport fits
          this.zoomLevel = Math.min(widthRatio, heightRatio);
          
          // Center the viewport in the canvas
          this.canvasOffsetX = (this.canvasWidth - viewportWidth * this.zoomLevel) / 2 - state.playerViewportX * this.zoomLevel;
          this.canvasOffsetY = (this.canvasHeight - viewportHeight * this.zoomLevel) / 2 - state.playerViewportY * this.zoomLevel;
        } else if (!this.isPlayerView) {
          // GM view: use broadcast zoom/pan (though we don't broadcast it anymore)
          // Keep current zoom/pan (GM controls their own view)
        }
        
        this.renderCanvas();
      }
    },
    
    async saveTable() {
      this.isLoading = true;
      const zip = new JSZip();

      const mapData = {
        name: "",
        savedAt: new Date().toISOString(),
        grid: {
          cellSize: this.gridCellSize,
          showGrid: this.showGrid,
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
          hasOpenPlayerView: this.hasOpenPlayerView
        },
        layers: {}
      };
      for (const layer in this.layerImages) {
        mapData.layers[layer] = [];
        for (let img_index = 0; img_index < this.layerImages[layer].length; img_index++) {
          const img = this.layerImages[layer][img_index];
          const dst_img_path = `images/${layer}/img_${img_index}.png`;
          mapData.layers[layer].push({src: dst_img_path,
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
          zip.file(dst_img_path, byteArray, { binary: true });
        }
      }
      zip.file('map_data.json', JSON.stringify(mapData));
      const save_file = await zip.generateAsync({type:"blob"})
      saveAs(save_file, "new_table.dtable");
      this.isLoading = false;
      console.log("End save");
    },


    async loadTableFile(ziparchive){
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
        this.showGrid = data.grid.showGrid;
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
        this.hasOpenPlayerView = data.viewport.hasOpenPlayerView;
        this.layerImages = {};

        // Load all images
        for (const [layer, layerContent] of Object.entries(data.layers)) {
          this.layerImages[layer] = [];
          for (const image of layerContent) {
            const imageFile = ziparchive.file(image.src);
            if (!imageFile) {
              console.warn(`The following file could not be loaded : ${image.src}`);
              continue;
            }
            const imageData = await imageFile.async('uint8array');
            const blob = new Blob([imageData], { type: 'image/png' });
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
        this.broadcastState();
      }
      catch (error) {
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
    },
    
    deleteMap(mapName) {
      if (!confirm(`Are you sure you want to delete "${mapName}"?`)) {
        return;
      }
      
      localStorage.removeItem(`homedungeon_map_${mapName}`);
      
      const savedMaps = this.getSavedMaps().filter(m => m !== mapName);
      localStorage.setItem('homedungeon_maps', JSON.stringify(savedMaps));
      
      this.savedMaps = savedMaps;
      alert(`Map "${mapName}" deleted`);
    }
  }
};