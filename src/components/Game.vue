<template>
  <div class="game-container">
    <canvas 
      v-if="game"
      ref="canvas" 
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel="handleWheel"
      class="fullscreen-canvas"
    ></canvas>
    
    <div v-if="!game" class="start-overlay">
      <div class="start-panel">
        <h1>Game Canvas</h1>
        <button @click="createGame">Create Game</button>
      </div>
    </div>
    
    <div v-if="game" class="toolbox" :class="{ minimized: toolboxMinimized }">
      <div class="toolbox-header">
        <h2>Toolbox</h2>
        <button @click="toolboxMinimized = !toolboxMinimized" class="minimize-btn">
          {{ toolboxMinimized ? '+' : '-' }}
        </button>
      </div>
      
      <div v-if="!toolboxMinimized" class="toolbox-content">
        <div class="section">
          <h3>Layer Selection</h3>
          <div class="layer-buttons">
            <label v-for="layer in layers" :key="layer" :class="{ active: selectedLayer === layer }">
              <input type="radio" v-model="selectedLayer" :value="layer" />
              {{ layer }}
            </label>
          </div>
        </div>
        
        <div v-if="selectedLayer === 'Grid'" class="section">
          <h3>Grid Controls</h3>
          <div class="grid-controls">
            <label>
              Cell Size: {{ gridCellSize }}px
              <input type="range" v-model.number="gridCellSize" min="20" max="100" @input="renderCanvas" />
            </label>
            <label>
              <input type="checkbox" v-model="showGrid" @change="renderCanvas" />
              Show Grid
            </label>
          </div>
          <p class="help-text">Click and drag grid lines to resize cells when Grid layer is selected.</p>
        </div>
        
        <div v-else class="section">
          <h3>Add Image to {{ selectedLayer }} Layer</h3>
          <input type="file" @change="handleImageUpload" accept="image/*" ref="fileInput" />
        </div>
        
        <div v-if="!isPlayerView" class="section">
          <h3>Player View</h3>
          <button @click="togglePlayerViewport" class="player-view-btn">
            {{ hasOpenPlayerView ? 'Hide Player View' : 'Show/Edit Player View' }}
          </button>
          <button v-if="hasOpenPlayerView" @click="openPlayerView" class="player-view-btn" style="margin-top: 10px;">
            Open Player View Tab
          </button>
          <p class="help-text">{{ hasOpenPlayerView ? 'Blue rectangle shows player viewport' : 'Show viewport rectangle to define player view' }}</p>
        </div>
        
        <div v-if="!isPlayerView" class="section">
          <h3>Save/Load Map</h3>
          <input v-model="mapName" type="text" placeholder="Map name" class="map-name-input" />
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button @click="saveMap" style="flex: 1;">Save Map</button>
            <button @click="showLoadDialog" style="flex: 1;">Load Map</button>
          </div>
          <div v-if="showingLoadDialog" class="load-dialog">
            <h4>Saved Maps:</h4>
            <div v-if="savedMaps.length === 0" class="help-text">No saved maps found</div>
            <div v-else class="saved-maps-list">
              <div v-for="map in savedMaps" :key="map" class="map-item">
                <span>{{ map }}</span>
                <div>
                  <button @click="loadMap(map)" class="small-btn">Load</button>
                  <button @click="deleteMap(map)" class="small-btn delete-btn">Delete</button>
                </div>
              </div>
            </div>
          </div>
          <p class="help-text">Maps saved in browser storage</p>
        </div>
        
        <div class="section info">
          <h4>{{ isPlayerView ? 'Player View' : 'Instructions:' }}</h4>
          <ul v-if="!isPlayerView">
            <li><strong>Map/Token/GM layers:</strong> Upload images and drag them to move</li>
            <li><strong>Grid layer:</strong> Edit grid by dragging grid lines</li>
            <li><strong>Mouse wheel:</strong> Zoom in/out</li>
            <li><strong>Click empty space:</strong> Pan the canvas</li>
            <li>All layers are visible simultaneously</li>
            <li>Only items on the selected layer can be moved</li>
          </ul>
          <ul v-else>
            <li><strong>This is the Player View</strong></li>
            <li>GM layer is hidden</li>
            <li>Only Token layer can be edited</li>
            <li>Map and Grid are view-only</li>
            <li>Synchronized with GM view in real-time</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      game: null,
      canvas: null,
      ctx: null,
      layers: ['Map', 'Grid', 'Token', 'GM'],
      selectedLayer: 'Map',
      layerImages: {
        Map: [],
        Token: [],
        GM: []
      },
      isDragging: false,
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
      showingLoadDialog: false,
      savedMaps: []
    };
  },
  mounted() {
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
          // Auto-resize if image is too large for canvas
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
      
      this.ctx.fillStyle = '#ffffff';
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
      
      for (const imageObj of images) {
        this.ctx.drawImage(
          imageObj.img,
          imageObj.x,
          imageObj.y,
          imageObj.width,
          imageObj.height
        );
        
        if (layer === this.selectedLayer && !this.isPanning) {
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
    
    handleMouseDown(event) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const world = this.screenToWorld(screenX, screenY);
      
      // Check viewport rectangle first (in GM view only)
      if (!this.isPlayerView && this.hasOpenPlayerView) {
        const viewportHandle = this.getViewportHandleAt(world.x, world.y);
        if (viewportHandle) {
          this.isResizingViewport = true;
          this.viewportResizeCorner = viewportHandle;
          return;
        }
        
        // Check if clicking inside viewport rectangle for dragging
        if (world.x >= this.playerViewportX && 
            world.x <= this.playerViewportX + this.playerViewportWidth &&
            world.y >= this.playerViewportY && 
            world.y <= this.playerViewportY + this.playerViewportHeight) {
          this.isDraggingViewport = true;
          this.viewportDragOffset = {
            x: world.x - this.playerViewportX,
            y: world.y - this.playerViewportY
          };
          return;
        }
      }
      
      if (this.selectedLayer === 'Grid') {
        // Disable Grid editing in player view
        if (this.isPlayerView) {
          this.isPanning = true;
          this.panStart = { x: screenX, y: screenY };
          this.renderCanvas();
          return;
        }
        
        // Check anchor point
        const anchorX = this.gridAnchorCol * this.gridCellSize + this.gridOffsetX;
        const anchorY = this.gridAnchorRow * this.gridCellSize + this.gridOffsetY;
        const anchorThreshold = 10 / this.zoomLevel;
        
        if (Math.abs(world.x - anchorX) < anchorThreshold && Math.abs(world.y - anchorY) < anchorThreshold) {
          this.draggingGridAnchor = true;
          return;
        }
        
        // Check grid lines
        const threshold = 5 / this.zoomLevel;
        let lineIndex = 1;
        
        for (let x = this.gridOffsetX % this.gridCellSize + this.gridCellSize; lineIndex < 100; x += this.gridCellSize) {
          if (Math.abs(world.x - x) < threshold) {
            this.draggingGridLine = { type: 'vertical', index: lineIndex };
            return;
          }
          lineIndex++;
        }
        
        lineIndex = 1;
        for (let y = this.gridOffsetY % this.gridCellSize + this.gridCellSize; lineIndex < 100; y += this.gridCellSize) {
          if (Math.abs(world.y - y) < threshold) {
            this.draggingGridLine = { type: 'horizontal', index: lineIndex };
            return;
          }
          lineIndex++;
        }
        
        // Start panning if no grid element clicked
        this.isPanning = true;
        this.panStart = { x: screenX, y: screenY };
        this.renderCanvas();
      } else {
        // Disable Map editing in player view
        if (this.isPlayerView && this.selectedLayer === 'Map') {
          this.isPanning = true;
          this.panStart = { x: screenX, y: screenY };
          this.renderCanvas();
          return;
        }
        
        const images = this.layerImages[this.selectedLayer];
        if (!images) return;
        
        let foundObject = false;
        for (let i = images.length - 1; i >= 0; i--) {
          const img = images[i];
          
          // Check resize handles
          const corner = this.getCornerAt(img, world.x, world.y);
          if (corner) {
            this.isResizing = true;
            this.resizeCorner = corner;
            this.draggedImage = img;
            this.resizeStartSize = { width: img.width, height: img.height };
            this.resizeStartPos = { x: img.x, y: img.y };
            this.resizeAspectRatio = img.width / img.height;
            foundObject = true;
            break;
          }
          
          // Check if clicking inside image
          if (
            world.x >= img.x &&
            world.x <= img.x + img.width &&
            world.y >= img.y &&
            world.y <= img.y + img.height
          ) {
            this.isDragging = true;
            this.draggedImage = img;
            this.dragOffset = {
              x: world.x - img.x,
              y: world.y - img.y
            };
            foundObject = true;
            break;
          }
        }
        
        // Start panning if no object clicked
        if (!foundObject) {
          this.isPanning = true;
          this.panStart = { x: screenX, y: screenY };
          this.renderCanvas();
        }
      }
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
    
    handleMouseMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const world = this.screenToWorld(screenX, screenY);
      
      if (this.isDraggingViewport) {
        this.playerViewportX = world.x - this.viewportDragOffset.x;
        this.playerViewportY = world.y - this.viewportDragOffset.y;
        this.renderCanvas();
      } else if (this.isResizingViewport) {
        const minSize = 100;
        const viewportAspectRatio = this.canvasWidth / this.canvasHeight;
        
        // Corner resizing - maintain aspect ratio
        if (this.viewportResizeCorner === 'bottom-right') {
          const newWidth = Math.max(minSize, world.x - this.playerViewportX);
          this.playerViewportWidth = newWidth;
          this.playerViewportHeight = newWidth / viewportAspectRatio;
        } else if (this.viewportResizeCorner === 'top-left') {
          const oldRight = this.playerViewportX + this.playerViewportWidth;
          const oldBottom = this.playerViewportY + this.playerViewportHeight;
          const newWidth = Math.max(minSize, oldRight - world.x);
          this.playerViewportWidth = newWidth;
          this.playerViewportHeight = newWidth / viewportAspectRatio;
          this.playerViewportX = oldRight - this.playerViewportWidth;
          this.playerViewportY = oldBottom - this.playerViewportHeight;
        } else if (this.viewportResizeCorner === 'top-right') {
          const oldBottom = this.playerViewportY + this.playerViewportHeight;
          const newWidth = Math.max(minSize, world.x - this.playerViewportX);
          this.playerViewportWidth = newWidth;
          this.playerViewportHeight = newWidth / viewportAspectRatio;
          this.playerViewportY = oldBottom - this.playerViewportHeight;
        } else if (this.viewportResizeCorner === 'bottom-left') {
          const oldRight = this.playerViewportX + this.playerViewportWidth;
          const newWidth = Math.max(minSize, oldRight - world.x);
          this.playerViewportWidth = newWidth;
          this.playerViewportHeight = newWidth / viewportAspectRatio;
          this.playerViewportX = oldRight - this.playerViewportWidth;
        } 
        // Edge resizing - also maintain aspect ratio
        else if (this.viewportResizeCorner === 'top') {
          const oldBottom = this.playerViewportY + this.playerViewportHeight;
          const newHeight = Math.max(minSize, oldBottom - world.y);
          this.playerViewportHeight = newHeight;
          this.playerViewportWidth = newHeight * viewportAspectRatio;
          this.playerViewportY = oldBottom - this.playerViewportHeight;
        } else if (this.viewportResizeCorner === 'right') {
          const newWidth = Math.max(minSize, world.x - this.playerViewportX);
          this.playerViewportWidth = newWidth;
          this.playerViewportHeight = newWidth / viewportAspectRatio;
        } else if (this.viewportResizeCorner === 'bottom') {
          const newHeight = Math.max(minSize, world.y - this.playerViewportY);
          this.playerViewportHeight = newHeight;
          this.playerViewportWidth = newHeight * viewportAspectRatio;
        } else if (this.viewportResizeCorner === 'left') {
          const oldRight = this.playerViewportX + this.playerViewportWidth;
          const newWidth = Math.max(minSize, oldRight - world.x);
          this.playerViewportWidth = newWidth;
          this.playerViewportHeight = newWidth / viewportAspectRatio;
          this.playerViewportX = oldRight - this.playerViewportWidth;
        }
        
        this.renderCanvas();
      } else if (this.isPanning) {
        // Disable panning in player view
        if (!this.isPlayerView) {
          this.canvasOffsetX += screenX - this.panStart.x;
          this.canvasOffsetY += screenY - this.panStart.y;
          this.panStart = { x: screenX, y: screenY };
          this.renderCanvas();
          this.canvas.style.cursor = 'grabbing';
        }
      } else if (this.draggingGridAnchor) {
        this.gridOffsetX = world.x - this.gridAnchorCol * this.gridCellSize;
        this.gridOffsetY = world.y - this.gridAnchorRow * this.gridCellSize;
        this.renderCanvas();
      } else if (this.draggingGridLine) {
        const newCellSize = this.draggingGridLine.type === 'vertical' 
          ? world.x / this.draggingGridLine.index
          : world.y / this.draggingGridLine.index;
        
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
          const newWidth = Math.max(minSize, world.x - img.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.width = newWidth;
          img.height = newHeight;
        } else if (this.resizeCorner === 'bottom-left') {
          const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - world.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
          img.width = newWidth;
          img.height = newHeight;
        } else if (this.resizeCorner === 'top-right') {
          const newWidth = Math.max(minSize, world.x - img.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
          img.width = newWidth;
          img.height = newHeight;
        } else if (this.resizeCorner === 'top-left') {
          const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - world.x);
          const newHeight = newWidth / this.resizeAspectRatio;
          img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
          img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
          img.width = newWidth;
          img.height = newHeight;
        }
        // Edge resizing - do NOT preserve aspect ratio
        else if (this.resizeCorner === 'top') {
          const newHeight = Math.max(minSize, this.resizeStartPos.y + this.resizeStartSize.height - world.y);
          img.y = this.resizeStartPos.y + this.resizeStartSize.height - newHeight;
          img.height = newHeight;
        } else if (this.resizeCorner === 'right') {
          const newWidth = Math.max(minSize, world.x - img.x);
          img.width = newWidth;
        } else if (this.resizeCorner === 'bottom') {
          const newHeight = Math.max(minSize, world.y - img.y);
          img.height = newHeight;
        } else if (this.resizeCorner === 'left') {
          const newWidth = Math.max(minSize, this.resizeStartPos.x + this.resizeStartSize.width - world.x);
          img.x = this.resizeStartPos.x + this.resizeStartSize.width - newWidth;
          img.width = newWidth;
        }
        
        this.renderCanvas();
      } else if (this.isDragging && this.draggedImage) {
        this.draggedImage.x = world.x - this.dragOffset.x;
        this.draggedImage.y = world.y - this.dragOffset.y;
        this.renderCanvas();
      }
      
      if (!this.isPanning && !this.isDragging && !this.isResizing && !this.draggingGridLine && !this.draggingGridAnchor) {
        this.canvas.style.cursor = 'grab';
      }
    },
    
    handleMouseUp() {
      let stateChanged = false;
      
      // Snap token layer images to grid (only when dragging, not resizing)
      if (this.isDragging && this.draggedImage && this.draggedImage.layer === 'Token') {
        this.snapToGrid(this.draggedImage);
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
    
    saveMap() {
      if (!this.mapName.trim()) {
        alert('Please enter a map name');
        return;
      }
      
      // Prepare map data
      const mapData = {
        name: this.mapName,
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
      
      // Save images with their data URLs
      for (const layer in this.layerImages) {
        mapData.layers[layer] = this.layerImages[layer].map(img => ({
          src: img.img.src,
          x: img.x,
          y: img.y,
          width: img.width,
          height: img.height,
          layer: img.layer
        }));
      }
      
      // Save to localStorage
      localStorage.setItem(`homedungeon_map_${this.mapName}`, JSON.stringify(mapData));
      
      // Update saved maps list
      const savedMaps = this.getSavedMaps();
      if (!savedMaps.includes(this.mapName)) {
        savedMaps.push(this.mapName);
        localStorage.setItem('homedungeon_maps', JSON.stringify(savedMaps));
      }
      
      alert(`Map "${this.mapName}" saved successfully!`);
    },
    
    showLoadDialog() {
      this.savedMaps = this.getSavedMaps();
      this.showingLoadDialog = !this.showingLoadDialog;
    },
    
    getSavedMaps() {
      const maps = localStorage.getItem('homedungeon_maps');
      return maps ? JSON.parse(maps) : [];
    },
    
    loadMap(mapName) {
      const mapData = localStorage.getItem(`homedungeon_map_${mapName}`);
      if (!mapData) {
        alert('Map not found');
        return;
      }
      
      const data = JSON.parse(mapData);
      
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
      
      // Load images
      for (const layer in data.layers) {
        this.layerImages[layer] = data.layers[layer].map(imgData => {
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
      
      this.mapName = mapName;
      this.showingLoadDialog = false;
      this.renderCanvas();
      this.broadcastState();
      
      alert(`Map "${mapName}" loaded successfully!`);
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
</script>

<style scoped>
.game-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

.fullscreen-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  cursor: grab;
}

.start-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.start-panel {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  text-align: center;
}

.start-panel h1 {
  margin: 0 0 20px 0;
  color: #333;
  font-size: 32px;
}

.toolbox {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  min-width: 300px;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.toolbox.minimized {
  min-width: auto;
}

.toolbox-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: #007bff;
  color: white;
  border-radius: 8px 8px 0 0;
}

.toolbox-header h2 {
  margin: 0;
  font-size: 18px;
}

.minimize-btn {
  background: rgba(255,255,255,0.2);
  color: white;
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 0;
}

.minimize-btn:hover {
  background: rgba(255,255,255,0.3);
}

.toolbox-content {
  padding: 20px;
}

.section {
  margin-bottom: 20px;
}

.section h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #333;
}

.section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #555;
}

.layer-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.layer-buttons label {
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  text-align: center;
  font-size: 14px;
}

.layer-buttons label.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.layer-buttons input[type="radio"] {
  margin-right: 5px;
}

.grid-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grid-controls label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 14px;
}

.grid-controls input[type="range"] {
  width: 100%;
}

.grid-controls input[type="checkbox"] {
  margin-right: 8px;
}

.help-text {
  margin: 10px 0 0 0;
  font-size: 12px;
  color: #666;
  font-style: italic;
}

.info {
  background: #e7f3ff;
  padding: 15px;
  border-radius: 6px;
  border-left: 4px solid #007bff;
}

.info ul {
  margin: 5px 0 0 0;
  padding-left: 20px;
  font-size: 13px;
}

.info li {
  margin: 5px 0;
  color: #555;
}

button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.3s;
}

button:hover {
  background: #0056b3;
}

input[type="file"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}

.map-name-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.load-dialog {
  margin-top: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.saved-maps-list {
  max-height: 200px;
  overflow-y: auto;
}

.map-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin: 5px 0;
  background: white;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.map-item span {
  flex: 1;
  font-size: 14px;
  color: #333;
}

.map-item div {
  display: flex;
  gap: 5px;
}

.small-btn {
  padding: 5px 10px;
  font-size: 12px;
}

.delete-btn {
  background: #dc3545;
}

.delete-btn:hover {
  background: #c82333;
}
</style>
