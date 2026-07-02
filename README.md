# MTG-RGB-HD

<p align="center">
  <img src="assets/img/cover.jpg" alt="MTG-RGB-HD preview" width="900" />
</p>

**Near-real-time EUMETSAT satellite imagery viewer and export tool**

MTG-RGB-HD is a web application to visualize and export Meteosat Third Generation
(MTG) satellite imagery from EUMETSAT with multi-layer blending. The default view
is centered on France; the map can be freely panned over Europe and Africa.

---

## Features

### Layer Control

- **Independent layer toggles** for RGB, VIS (0.6 µm), and IR (10.5 µm)
- **7 visualization modes**:
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
- IR visualization style (Style 01, Style 02, Grayscale)
- Automatic VIS attenuation during night hours

### Geographic Overlays

Enhance your view with map overlays:

- **Country borders** (white lines, adjustable opacity)
- **France departments** (light blue lines for administrative divisions)
- **City labels** (major European cities with zoom-dependent rendering)

### Export & Download

- **ZIP archive packaging** with smart preselection based on active layer
  combination
- **GIF animation export** with advanced controls:
  - Custom UTC day selection with bounded start/end range on a single timeline
  - Fixed 10-minute sampling (no frame skipping)
  - Up to **73 frames** (full 12-hour window)
  - GIF color count (64 / 128 / 256)
  - Palette mode: per-frame or global palette
  - Dithering levels: none / low / medium / high
  - Export progress integrated in the export button
- **Multiple export formats**:
  - VIS 0.6 µm single layer
  - RGB True Color single layer
  - RGB + VIS HD composite (luminosity blend)
  - Sandwich (VIS + IR) and Hybrid (RGB + VIS + IR), when those layers are active
- **Bilingual export labels** (French/English)
- **Overlay integration** – borders, departments, and cities rendered directly
  in exported PNGs
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
- Dedicated export map instance isolates tile requests from the display map
- Leaflet `keepBuffer` and `updateWhenIdle` enabled for smoother interaction
- LRU cache for cloud-only IR tiles (hybrid-related modes)
- City labels rendered only on visible map
- Efficient canvas compositing for multi-layer exports

---

## Tech Stack

| Layer | Technology |
| --- | --- |
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

1. **Select Date & Time**: Use the UTC time picker at the top to choose your
   observation time (10-minute increments)
2. **Enable Layers**: Toggle RGB, VIS, and/or IR from the control bar
3. **Fine-tune**: Click "Adjustments" to access layer-specific controls
   (contrast, brightness, saturation, etc.)
4. **Add Overlays**: Enable borders, departments, and cities from the Adjustments
   panel
5. **Download**: Click "Download" to select export formats and generate your ZIP
   package

---

## Satellite Data Reference

### Bands Provided by MTG

| Band | Wavelength | Use Case | Resolution |
| --- | --- | --- | --- |
| **RGB True Color** | Visible spectrum (0.44–0.64 µm) | Natural color visualization | ~1 km |
| **VIS 0.6 µm** | 0.64 µm | Cloud detection, daytime detail | ~0.5 km (HRFI) |
| **IR 10.5 µm** | 10.5 µm | Cloud-top temperature, night analysis | ~1 km (HRFI) |

For technical documentation, see:

- [EUMETSAT Meteosat Third Generation](https://www.eumetsat.int/meteosat-third-generation)
- [EUMETSAT User Portal](https://user.eumetsat.int/)
- [MTG FCI Level 1C Data Guide](https://user.eumetsat.int/resources/user-guides/mtg-fci-level-1c-data-guide)

---

## Credits & Attribution

**Project Author:** [Quentin Rey](https://github.com/quentin-rey)

**Data Source:**

- Satellite Imagery: [EUMETSAT](https://www.eumetsat.int/) / Meteosat Third
  Generation (MTG)
- WMS Service: EUMETSAT Geoserver (view.eumetsat.int/geoserver/ows)

**Map Layers:**

- Basemap: [OpenStreetMap](https://www.openstreetmap.org/) contributors via
  [CARTO](https://carto.com/)
- Country borders: [geo-countries](https://github.com/datasets/geo-countries)
  (datasets/geo-countries)
- France departments:
  [france-geojson](https://github.com/gregoiredavid/france-geojson)
  (Grégoire David)
- City labels: [Natural Earth](https://www.naturalearthdata.com/) via
  [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector)

**Libraries & Tools:**

- Mapping: [Leaflet.js](https://leafletjs.com/) & [react-leaflet](https://react-leaflet.js.org/)
- Build Tools: [Vite](https://vitejs.dev/)
- UI Components: [Lucide React](https://lucide.dev/)
- Styling: [Tailwind CSS](https://tailwindcss.com/)

---

## License

This project is provided for **educational and informational purposes**.

- **Application Code**: Licensed under [Apache-2.0](LICENSE)
- **EUMETSAT Data**: Satellite imagery usage is subject to
  [EUMETSAT terms of use](https://www.eumetsat.int/about-us/terms-use)
- **OpenStreetMap Data**: Licensed under
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/)
