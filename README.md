# MTG-RGB-HD

<p align="center">
  <img src="assets/img/cover.jpg" alt="MTG-RGB-HD preview" width="900" />
</p>

**Near-real-time EUMETSAT satellite imagery viewer and export tool**

MTG-RGB-HD is a web application to visualize and export Meteosat Third Generation
(MTG) satellite imagery from EUMETSAT with multi-layer blending. The default view
is centered on France; the map can be freely panned over Europe and Africa.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation & Setup](#installation--setup)
- [Usage Guide](#usage-guide)
- [Satellite Data Reference](#satellite-data-reference)
- [Credits & Attribution](#credits--attribution)
- [License](#license)

---

## Features

### Layer Control

- Independent RGB, VIS (0.6 µm), and IR (10.5 µm) toggles across **7
  visualization modes**: RGB, VIS, IR, RGB+VIS (HD), Sandwich (VIS+IR),
  Cloud-only (RGB+IR), and Hybrid (RGB+VIS+IR)
- **Fire hotspot overlay** (Fire Temperature RGB): an independent,
  always-on-top layer with live-adjustable detection thresholds (opacity,
  sensitivity, minimum brightness), toggled separately from the main layer
  combination

### Adjustments & Refinement

A context-aware panel — each control only shows up when it actually affects
the current layer combination:

- VIS contrast/brightness, RGB saturation, IR style, VIS/IR blend weighting
- Algorithmic HD enhancement for RGB+VIS, with 4 presets (Natural, Balanced,
  Punchy, Analyze) plus a fully custom mode
- Automatic night-time VIS attenuation based on real solar elevation
- One-click reset (`R`)

### Geographic Overlays

Country borders, France departments, and city labels — with a
population-aware decluttering pass so dense regions (Benelux, the Rhine-Ruhr
area) stay readable instead of turning into overlapping clutter.

### Export & Download

- **Still images** (PNG/JPEG, up to 4096px) — a genuine WMS re-render at the
  requested resolution, not a browser-side upscale — with live preview
  thumbnails and automatic ZIP bundling for multi-format selections
- **Animations** as GIF or WebM video, sharing the same time-range picker:
  up to 73 frames (a full 12h window), configurable FPS and resolution, plus
  format-specific controls (GIF palette/dithering, WebM quality)
- Borders, departments, cities, the fire hotspot layer, and a source
  watermark are baked directly into every export, at every resolution
- Resolution- and timestamp-tagged filenames that always match what you get

### User Experience

- 10-minute UTC time navigation, map position memory across visits, and a
  share button that reopens the exact same view (time, layers, adjustments,
  theme, language) via URL
- Light/Dark/Auto theme, bilingual FR/EN interface, mobile-responsive layout
- **Keyboard shortcuts**:

  | Key | Action |
  | --- | --- |
  | `←` `→` | ±10 min (Shift: ±30 min, Ctrl/Cmd: ±60 min) |
  | `L` | Jump to latest available time |
  | `A` | Toggle animation export (GIF/WebM) |
  | `D` | Toggle image download |
  | `F` | Toggle fire hotspot overlay |
  | `S` | Toggle adjustments panel |
  | `I` | Toggle info modal |
  | `R` | Reset adjustments |
  | `Shift` + `S` | Copy share link |
  | `?` | Toggle help modal |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19 + TypeScript (strict mode) |
| **Build** | Vite 6 |
| **Server** | Express (Vite middleware in dev, static + SPA fallback in production) |
| **Maps** | Leaflet (WMS tile layers), driven imperatively — no react-leaflet |
| **Export** | JSZip + file-saver + Canvas API + gifenc (GIF encoding) + MediaRecorder (WebM video) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`, no config file) |
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

# Type checking (the only correctness check — there's no separate test suite)
npm run lint

# Production build (client + server bundle) and run
npm run build
npm run start

# Remove build output
npm run clean
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

There is no backend or database: the Express server only serves the app (Vite
middleware in dev, static files in production) — all satellite imagery comes
directly from EUMETSAT's public WMS endpoint, and all state lives client-side
(`localStorage` plus the URL query string for shared links).

---

## Usage Guide

1. **Select Date & Time**: Use the UTC time picker at the top to choose your
   observation time (10-minute increments)
2. **Enable Layers**: Toggle RGB, VIS, and/or IR from the control bar
3. **Fine-tune**: Click "Adjustments" to access layer-specific controls
   (contrast, brightness, saturation, etc.)
4. **Add Overlays**: Enable borders, departments, and cities from the Adjustments
   panel
5. **Spot fires**: Click the 🔥 button to open its own panel, enable the fire
   hotspot overlay, and tune opacity/sensitivity/brightness thresholds live
   against the current view
6. **Download**: Click "Download" to preview each available format as a
   thumbnail, pick a file format (PNG/JPEG) and resolution, then export —
   you'll get a single file directly if one format is selected, or a ZIP if
   several are

---

## Satellite Data Reference

### Bands Provided by MTG

| Band | Wavelength | Use Case | Resolution |
| --- | --- | --- | --- |
| **RGB True Color** | Visible spectrum (0.44–0.64 µm) | Natural color visualization | ~1 km |
| **VIS 0.6 µm** | 0.64 µm | Cloud detection, daytime detail | ~0.5 km (HRFI) |
| **IR 10.5 µm** | 10.5 µm | Cloud-top temperature, night analysis | ~1 km (HRFI) |
| **Fire Temperature RGB** | 3.8 / 2.2 / 1.6 µm composite | Wildfire detection and intensity | ~0.5 km |

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

- Mapping: [Leaflet.js](https://leafletjs.com/)
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
