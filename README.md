# MTG-RGB-HD

MTG-RGB-HD is a web app to visualize and export MTG (EUMETSAT) satellite imagery, focused on France, with real-time multi-layer blending.

## Features
- Single control panel for active layers, with independent RGB, VIS, and IR toggles.
- Supported combinations:
   - RGB
   - VIS
   - IR
   - RGB + VIS (luminosity blend)
   - VIS + IR (Sandwich)
   - RGB + IR (cloud-only blend)
   - RGB + VIS + IR (hybrid)
- Context-aware image adjustments depending on active layers:
   - VIS contrast and brightness
   - RGB saturation
   - VIS contribution over RGB (when relevant)
   - IR/Sandwich intensity
   - IR 10.5 style
   - Automatic VIS reduction at night
- Tile loading indicator with percentage and pending tile count.
- ZIP export with smart preselection based on active layers (VIS, RGB, IR, HD, Sandwich, Hybrid).
- Time selection in 10-minute steps.
- Overlays: borders, France departments, and cities.

## Loading Optimizations
- Initial view constrained to France (dedicated bounds).
- No extra loading on the hidden technical map (prevents duplicate tile traffic).
- `keepBuffer` and `updateWhenIdle` enabled on tile layers.
- LRU cache for cloud-only IR tiles in hybrid-related modes.
- City labels rendered only on the visible map.

## Tech Stack
- React 19
- Vite
- Leaflet (WMS)
- JSZip + file-saver
- Tailwind CSS
- Lucide Icons

## Installation
Prerequisites:
- Node.js 18+
- npm

Commands:
```bash
npm install
npm run dev
```

Quality check:
```bash
npm run lint
```

## Usage
1. Pick date/time (UTC) from the top selector.
2. Enable RGB, VIS, and IR layers from the control bar.
3. Open Adjustments to tune available parameters for the current combination.
4. Enable overlays from Settings (gear icon).
5. Open the download modal to choose exports and generate a ZIP.

## Credits and Sources
- Author: Quentin Rey
- Satellite imagery: EUMETSAT / Meteosat Third Generation (MTG)
- Basemap: CARTO, OpenStreetMap contributors

## License
This project is for educational and informational purposes. Satellite data usage remains subject to EUMETSAT terms.
