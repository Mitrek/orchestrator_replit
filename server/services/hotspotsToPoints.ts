
import type { Hotspot } from "./validation";

export function hotspotsToPoints(
  hotspots: Hotspot[], 
  viewport: { width: number; height: number }, 
  densityPerMp = 800
): Array<{ x: number; y: number; weight: number }> {
  const points: Array<{ x: number; y: number; weight: number }> = [];
  
  hotspots.forEach(hotspot => {
    // Convert normalized coordinates to pixel coordinates
    const pixelRect = {
      x: Math.floor(hotspot.x * viewport.width),
      y: Math.floor(hotspot.y * viewport.height),
      width: Math.ceil(hotspot.width * viewport.width),
      height: Math.ceil(hotspot.height * viewport.height)
    };
    
    // Calculate area in pixels and number of points
    const areaPx = pixelRect.width * pixelRect.height;
    const pointsCount = Math.min(2000, Math.max(20, Math.floor(areaPx / (1e6 / densityPerMp))));
    
    // Calculate grid dimensions for point distribution
    const aspectRatio = pixelRect.width / pixelRect.height;
    const cols = Math.ceil(Math.sqrt(pointsCount * aspectRatio));
    const rows = Math.ceil(pointsCount / cols);
    
    // Generate points in a grid with jitter
    for (let i = 0; i < pointsCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      
      // Base position in grid
      const baseX = pixelRect.x + (col + 0.5) * (pixelRect.width / cols);
      const baseY = pixelRect.y + (row + 0.5) * (pixelRect.height / rows);
      
      // Add jitter ±1px
      const jitterX = (Math.random() - 0.5) * 2;
      const jitterY = (Math.random() - 0.5) * 2;
      
      const finalX = Math.round(Math.max(pixelRect.x, Math.min(pixelRect.x + pixelRect.width - 1, baseX + jitterX)));
      const finalY = Math.round(Math.max(pixelRect.y, Math.min(pixelRect.y + pixelRect.height - 1, baseY + jitterY)));
      
      // Ensure point is within viewport bounds
      if (finalX >= 0 && finalX < viewport.width && finalY >= 0 && finalY < viewport.height) {
        // Center-weighted: higher weight near center of rect
        const centerX = pixelRect.x + pixelRect.width / 2;
        const centerY = pixelRect.y + pixelRect.height / 2;
        const distFromCenter = Math.sqrt((finalX - centerX) ** 2 + (finalY - centerY) ** 2);
        const maxDist = Math.sqrt((pixelRect.width / 2) ** 2 + (pixelRect.height / 2) ** 2);
        const centerWeight = 1 - (distFromCenter / maxDist) * 0.3; // 30% weight variation
        
        points.push({
          x: finalX,
          y: finalY,
          weight: hotspot.confidence * centerWeight
        });
      }
    }
  });
  
  return points;
}
