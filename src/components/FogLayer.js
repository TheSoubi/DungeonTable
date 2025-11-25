
import * as turf from '@turf/turf';

export default class FogLayer {
    constructor(isFogOpaque) {
        this.isFogEnabled = false;
        this.isDrawingFogPolygon = false;
        this.fogPolygons = [];
        this.currentFogPolygon = [];
        this.updateCallback = null;
        this.isFogOpaque = isFogOpaque;
        this.displayedPolygons = [];
    }

    setFogVisibility(isEnabled) {
        this.isFogEnabled = isEnabled;
    }

    /*
    Handles a mouse_up event at the given coordinates. Return true if a new polygon was drawn, false instead.
    */
    handleMouseUp(x, y) {
        try {
            if (this.isFogEnabled) {
                if (this.currentFogPolygon.length === 1){
                    this.addPointToCurrentFogPolygon(x, y);
                }
                else {
                    if (this.isFirstFogPolygonPointSelected(x, y)) {
                        if (this.currentFogPolygon.length >= 4) {
                            this.saveCurrentFogPolygon();
                            return true;
                        }
                    }
                    else {
                        this.addPointToCurrentFogPolygon(x, y);
                    }
                }
            }
            return false;
        } catch (error) {
            console.error(error);
        }
    }

    handleMouseMove(x, y) {
        if (this.currentFogPolygon.length >= 1 ){
            this.currentFogPolygon.pop();
        }
        this.addPointToCurrentFogPolygon(x, y);
    }

    addPointToCurrentFogPolygon(x, y){
        this.isDrawingFogPolygon = true;
        if (this.currentFogPolygon.x !== x && this.currentFogPolygon.y !== y) {
            this.currentFogPolygon.push({"x": x, "y": y});
        }
    }

    saveCurrentFogPolygon(){
        this.currentFogPolygon.pop();
        this.currentFogPolygon.push(this.currentFogPolygon[0]);
        this.fogPolygons.push([...this.currentFogPolygon]);
        this.isDrawingFogPolygon = false;
        this.currentFogPolygon = [];
        this.optimizePolygons();
    }

    isFirstFogPolygonPointSelected(x, y){
      if (this.currentFogPolygon.length > 0){
        const first_point = this.currentFogPolygon[0];
        const click_distance_allowed = 20;
        return Math.sqrt((x-first_point.x)**2 + (y-first_point.y)**2) < click_distance_allowed;
      } else {
        return false;
      }
    }

    toTurfPolygon(poly) {
        return turf.polygon([poly.map(point => [point.x, point.y])]);
    }

    fromTurfPolygon(turfPoly) {
        return turfPoly.geometry.coordinates[0].map(([x, y]) => ({ x, y }));
    }

    /**
     * Reduce the number of polygons by computing geometric operations.
     */
    optimizePolygons(){
        if (this.fogPolygons.length < 2) {
            this.displayedPolygons = [this.fogPolygons[0]];
        }
        else {
            const turfPolygons = this.fogPolygons.map(this.toTurfPolygon);
            const includedPolygons = [];
            const polygonsToUnion = [];

            for (let i = 0; i < turfPolygons.length; i++) {
                let isIncluded = false;
                for (let j = 0; j < turfPolygons.length; j++) {
                    if (i === j) continue;
                    if (turf.booleanContains(turfPolygons[j], turfPolygons[i])) {
                        isIncluded = true;
                        break;
                    }
                }
                if (isIncluded) {
                    includedPolygons.push(turfPolygons[i]);
                } else {
                    polygonsToUnion.push(turfPolygons[i]);
                }
            }

            let unionResults = [];
            if (polygonsToUnion.length >= 2) {
                let currentUnion = turf.union(turf.featureCollection([polygonsToUnion[0], polygonsToUnion[1]]));
                unionResults.push(currentUnion);
                for (let i = 2; i < polygonsToUnion.length; i++) {
                currentUnion = turf.union(turf.featureCollection([currentUnion, polygonsToUnion[i]]));
                unionResults = [currentUnion];
                }
            } else if (polygonsToUnion.length === 1) {
                unionResults = polygonsToUnion;
            }

            const optimizedPolygons = [];
            for (const result of unionResults) {
                if (result.type === "Feature") {
                const geometry = result.geometry;
                if (geometry.type === "Polygon") {
                    optimizedPolygons.push(this.fromTurfPolygon(turf.feature(geometry)));
                } else if (geometry.type === "MultiPolygon") {
                    geometry.coordinates.forEach(coords => {
                    optimizedPolygons.push(this.fromTurfPolygon(turf.polygon(coords)));
                    });
                }
                } else if (result.type === "Polygon") {
                optimizedPolygons.push(this.fromTurfPolygon(turf.feature(result)));
                } else if (result.type === "MultiPolygon") {
                result.coordinates.forEach(coords => {
                    optimizedPolygons.push(this.fromTurfPolygon(turf.polygon(coords)));
                });
                }
            }

            includedPolygons.forEach(poly => {
                optimizedPolygons.push(this.fromTurfPolygon(poly));
            });
            if (polygonsToUnion.length === 1 && unionResults.length === 0) {
                optimizedPolygons.push(this.fromTurfPolygon(polygonsToUnion[0]));
            }
            this.displayedPolygons = optimizedPolygons;
        }
    }

    cancelCurrentPolygon(){
      this.isDrawingFogPolygon = false;
      this.currentFogPolygon = [];
    }

    eraseLastDrawing(){
      if (this.fogPolygons.length > 0) {
        this.fogPolygons.pop();
        this.updateCallback();
      }
      this.optimizePolygons();
    }

    eraseLastPoint(){
        if (this.currentFogPolygon.length > 0){
            this.currentFogPolygon.pop();
        }
    }

    eraseAllDrawings(){
        this.fogPolygons = [];
        this.updateCallback();
        this.optimizePolygons();
    }

    drawOnCanvas(canvas, canvasOffsetX, canvasOffsetY, canvasWidth, canvasHeight, zoomLevel){
        this.drawFogPolygons(canvas, canvasOffsetX, canvasOffsetY, canvasWidth, canvasHeight, zoomLevel);
        this.drawCurrentFogPolygon(canvas, zoomLevel);
    }

    drawCurrentFogPolygon(canvas, zoomLevel) {
        const ctx = canvas.getContext('2d');
        if (this.isDrawingFogPolygon) {
            if (!ctx|| !this.isDrawingFogPolygon || this.currentFogPolygon.length === 0) {
                return;
            }
            const handleSize = 8 / zoomLevel;
            ctx.save();
            ctx.strokeStyle = "red";
            ctx.fillStyle = "red";
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (this.currentFogPolygon.length > 0) {
                ctx.arc(this.currentFogPolygon[0].x, this.currentFogPolygon[0].y, handleSize, 0, 2 * Math.PI);
                ctx.fill();
                ctx.moveTo(this.currentFogPolygon[0].x, this.currentFogPolygon[0].y);
                for (let i = 1; i < this.currentFogPolygon.length; i++) {
                    ctx.lineTo(this.currentFogPolygon[i].x, this.currentFogPolygon[i].y);
                }
            }
            ctx.stroke();
            ctx.restore();
        }
    }

    drawFogPolygons(canvas, canvasOffsetX, canvasOffsetY,canvasWidth, canvasHeight, zoomLevel){
        const ctx = canvas.getContext('2d');
        if (!ctx || !this.isFogEnabled) return;
        // Add global fog layer 
        ctx.save();
        const fog_style = this.isFogOpaque ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.5)';
        ctx.fillStyle = fog_style;
        ctx.beginPath();
        ctx.rect(-canvasOffsetX/zoomLevel, -canvasOffsetY/zoomLevel, canvasWidth/zoomLevel, canvasHeight/zoomLevel);
        // Remove fog under polygons 
        if (this.fogPolygons.length > 0) {
            this.displayedPolygons.forEach(polygon => {
                if (polygon.length >= 3) {
                ctx.moveTo(polygon[0].x, polygon[0].y);
                for (let i = 1; i < polygon.length; i++) {
                    ctx.lineTo(polygon[i].x, polygon[i].y);
                }
                ctx.closePath();
                }
            });
            
        }
        ctx.fill('evenodd');
        ctx.restore();
    }

    getJson(){
        return {"isFogEnabled": this.isFogEnabled,
                "fogPolygons": JSON.parse(JSON.stringify(this.fogPolygons)),}
    }

    loadJson(json){
        this.isDrawingFogPolygon = false;
        this.currentFogPolygon = [];
        this.isFogEnabled = json.isFogEnabled;
        this.fogPolygons = json.fogPolygons;
        this.optimizePolygons();
    }

    setUpdateCallback(callback){
        this.updateCallback = callback;
    }
}