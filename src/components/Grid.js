
export default class GridLayer {
    constructor() {
        this.gridCellSize = 50;
        this.isGridEnabled = true;
        this.draggingGridLine = null;
        this.gridLineIndex = 0;
        this.gridOffsetX = 0;
        this.gridOffsetY = 0;
        this.draggingGridAnchor = false
    }

    drawOnCanvas(canvas, canvasOffsetX, canvasOffsetY, canvasWidth, canvasHeight, zoomLevel) {
        if (this.isGridEnabled){
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1 / zoomLevel;
            
            const worldBounds = {
                minX: (0 - canvasOffsetX) / zoomLevel,
                minY: (0 - canvasOffsetY) / zoomLevel,
                maxX: (canvasWidth - canvasOffsetX) / zoomLevel,
                maxY: (canvasHeight - canvasOffsetY) / zoomLevel
            };
            
            // Draw vertical lines
            for (let x = Math.floor(worldBounds.minX / this.gridCellSize) * this.gridCellSize + this.gridOffsetX % this.gridCellSize; 
                x <= worldBounds.maxX; 
                x += this.gridCellSize) {
                ctx.beginPath();
                ctx.moveTo(x, worldBounds.minY);
                ctx.lineTo(x, worldBounds.maxY);
                ctx.stroke();
            }
            
            // Draw horizontal lines
            for (let y = Math.floor(worldBounds.minY / this.gridCellSize) * this.gridCellSize + this.gridOffsetY % this.gridCellSize; 
                y <= worldBounds.maxY; 
                y += this.gridCellSize) {
                ctx.beginPath();
                ctx.moveTo(worldBounds.minX, y);
                ctx.lineTo(worldBounds.maxX, y);
                ctx.stroke();
            }
        }
    }

    /**
     * Return the image's closest coordinates to snap it on the grid.
     * @param {HTMLImageElement|Object} imageObj The image to snap on the grid.
     */
    getImageSnapCoordinates(imageObj){
        if (this.isGridEnabled){
            const imageCenterX = imageObj.x + imageObj.width / 2;
            const imageCenterY = imageObj.y + imageObj.height / 2;
            
            let gridCol = Math.round(2*(imageCenterX / this.gridCellSize))/2;
            let gridRow = Math.round(2*(imageCenterY / this.gridCellSize))/2;
            const deltaCol = gridCol - Math.round(gridCol);
            const deltaRow = gridRow - Math.round(gridRow);
            if (deltaCol !== deltaRow) {
                if (deltaCol === 0) gridCol += 0.5;
                if (deltaRow === 0) gridRow += 0.5;
            }
            
            const gridCenterX = gridCol * this.gridCellSize;
            const gridCenterY = gridRow * this.gridCellSize;
            
            const new_x = gridCenterX - imageObj.width / 2;
            const new_y = gridCenterY - imageObj.height / 2;

            return {"x": new_x, "y": new_y}
        }
        return {"x": imageObj.x, "y": imageObj.y}
    }

    getClosestSnapCoordinates(coordinates){
        if (this.isGridEnabled){
            return {"x": Math.round(coordinates.x / this.gridCellSize) * this.gridCellSize, "y": Math.round(coordinates.y / this.gridCellSize) * this.gridCellSize}
        }
        return {"x": coordinates.x, "y": coordinates.y}
    }
}