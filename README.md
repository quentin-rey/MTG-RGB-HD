# MTG-RGB-HD

**Real-time EUMETSAT satellite imagery visualization and export tool for France**

MTG-RGB-HD is a web application that allows you to visualize and export Meteosat Third Generation (MTG) satellite imagery from EUMETSAT with advanced multi-layer blending capabilities.

---

## Features

### Layer Control
- **Independent layer toggles** for RGB, VIS (0.6 µm), and IR (10.5 µm)
- **8 visualization modes**:
  - RGB (True Color)
  - VIS (Visible/Reflective)
  - IR (Thermal/Infrared)
  - RGB + VIS (HD – luminosity blend)
  - VIS + IR (Sandwich mode)
  - RGB + IR (Cloud-only)
  - RGB + VIS + IR (Hybrid)

### Adjustments & Refinement
Context-aware image adjustments that adapt based on active layers:
- VIS contrast and brightness fine-tuning
- RGB color saturation control
- VIS contribution weighting (when blending with RGB)
- IR/Sandwich intensity modulation
- IR visualization style (Grayscale, Berlin, or custom palette)
- Automatic VIS attenuation during night hours

### Geographic Overlays
Enhance your view with map overlays:
- **Country borders** (white lines, adjustable opacity)
- **France departments** (light blue lines for administrative divisions)
- **City labels** (major European cities with zoom-dependent rendering)

### Export & Download
- **ZIP archive packaging** with smart preselection based on active layer combination
- **Multiple export formats**:
  - VIS 0.6 µm single layer
  - RGB True Color single layer
  - RGB + VIS HD composite (luminosity blend)
  - (Sandwich and Hybrid layers available when active)
- **Bilingual export labels** (French/English)
- **Overlay integration** – borders, departments, and cities rendered directly in exported PNGs
- **Timestamped packaging** for easy file organization

### User Experience
- **Real-time time selection** in 10-minute UTC increments
- **Tile loading progress indicator** with percentage and pending tile count
- **Light/Dark/Auto theme support**
- **Bilingual interface** (FR/EN)
- **Responsive design** for desktop and tablet

---

## Performance Optimizations

- Initial map view constrained to France to minimize tile loading
- Hidden technical map prevents duplicate WMS requests
- Leaflet `keepBuffer` and `updateWhenIdle` enabled for smoother interaction
- LRU cache for cloud-only IR tiles (hybrid-related modes)
- City labels rendered only on visible map
- Efficient canvas compositing for multi-layer exports

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + TypeScript |
| **Build** | Vite |
| **Maps** | Leaflet + react-leaflet (WMS) |
| **Export** | JSZip + file-saver + Canvas API |
| **Styling** | Tailwind CSS |
| **Icons** | Lucide Icons |

---

## Installation & Setup

**Prerequisites:**
- Node.js 18 or higher
- npm or yarn

**Steps:**
```bash
# Clone and install dependencies
git clone https://github.com/quentin-rey/MTG-RGB-HD.git
cd MTG-RGB-HD
npm install

# Development server
npm run dev

# Type checking & linting
npm run lint
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Usage Guide

1. **Select Date & Time**: Use the UTC time picker at the top to choose your observation time (10-minute increments)
2. **Enable Layers**: Toggle RGB, VIS, and/or IR from the control bar
3. **Fine-tune**: Click "Adjustments" to access layer-specific controls (contrast, brightness, saturation, etc.)
4. **Add Overlays**: Enable borders, departments, and cities from the Adjustments panel
5. **Download**: Click "Download" to select export formats and generate your ZIP package

---

## Satellite Data Reference

### Bands Provided by MTG

| Band | Wavelength | Use Case | Resolution |
|------|-----------|----------|------------|
| **RGB True Color** | Visible spectrum | Natural color visualization | ~600m |
| **VIS 0.6 µm** | Visible reflective | Cloud detection, daytime detail | ~600m |
| **IR 10.5 µm** | Thermal infrared | Cloud-top temperature, night analysis | ~2km |

For technical documentation, see:
- [EUMETSAT MTG Overview](https://www.eumetsat.int/mtg)
- [EUMETSAT Imagery Guide](https://www.eumetsat.int/imagery-guide)

---

## Credits & Attribution

**Project Author:** [Quentin Rey](https://github.com/quentin-rey)

**Data Source:**
- Satellite Imagery: [EUMETSAT](https://www.eumetsat.int/) / Meteosat Third Generation (MTG)
- WMS Service: EUMETSAT Geoserver (view.eumetsat.int/geoserver/ows)

**Map Layers:**
- Basemap: [OpenStreetMap](https://www.openstreetmap.org/) contributors via [CARTO](https://carto.com/)
- Geographic Data: [GeoJSON datasets](https://github.com/datasets/geo-countries) (country borders)

**Libraries & Tools:**
- Mapping: [Leaflet.js](https://leafletjs.com/) & [react-leaflet](https://react-leaflet.js.org/)
- Build Tools: [Vite](https://vitejs.dev/)
- UI Components: [Lucide React](https://lucide.dev/)
- Styling: [Tailwind CSS](https://tailwindcss.com/)

---

## License

This project is provided for **educational and informational purposes**.

- **Application Code**: Licensed under [Apache-2.0](LICENSE)
- **EUMETSAT Data**: Satellite imagery usage is subject to [EUMETSAT terms and conditions](https://www.eumetsat.int/terms-and-conditions)
- **OpenStreetMap Data**: Licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/)

---

## Resources

- GitHub Repository: [MTG-RGB-HD](https://github.com/quentin-rey/MTG-RGB-HD)
- Live Application: [mtg-rgb-hd.pages.dev](https://mtg-rgb-hd.pages.dev/)
- EUMETSAT: [https://www.eumetsat.int/](https://www.eumetsat.int/)
