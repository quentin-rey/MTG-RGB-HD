# MTG-RGB-HD

MTG-RGB-HD is a specialized web application for synchronizing, comparing, and exporting high-resolution satellite imagery from EUMETSAT's Meteosat Third Generation (MTG). 

## Features
- **Dual Map Synchronization**: Automatically synchronizes pan and zoom across two independent map views.
- **VIS 0.6 & RGB True Color**: Provides instant comparison between the visible channel and true color composite.
- **Image Export**: Allows users to download a `.zip` pack containing the visual representation of both channels, along with a transparent blended layer (with improved brightness/contrast rendering for optimal visual quality), complete with borders and city overlays (based on user settings).
- **Time Selection**: Select and view past data by navigating historical records (in 10-minute increments, matching the EUMETSAT update cycle).
- **Overlay Customization**: Toggle political borders and city names directly from the settings menu.

## Tech Stack
- **React 19**
- **Vite**
- **Leaflet**: Core mapping engine and WMS tile rendering.
- **JSZip & FileSaver**: Client-side archiving and file generation.
- **Tailwind CSS**: Rapid UI styling and layout design.
- **Lucide Icons**: Beautiful, clean iconography.

## Getting Started

### Prerequisites
- Node.js (version 18+ recommended)
- npm or yarn

### Installation
1. Clone the repository
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Access the application at `http://localhost:3000` (or as indicated in your terminal).

## Usage
- **Navigation**: Click and drag to pan around the map. Scroll to zoom in and out. Both panels will remain perfectly synchronized.
- **Historical Data**: Click the time selector (top right) to explore older captures. Only timestamps corresponding to actual captures (every 10 minutes) will fetch valid images.
- **Settings**: Click the gear icon to toggle boundaries and city names.
- **Download**: Click "Télécharger les images" to download a ZIP containing high-resolution views of your current framing.

## Credits & Sources
- Built by **Quentin Rey**
- Satellite imagery provided by **EUMETSAT / Meteosat Third Generation (MTG)** via their WMS services.
- Mapping orientation and city labels by **CARTO** and **OpenStreetMap contributors**.

## License
This project is for educational and informational purposes. Satellite data is subject to EUMETSAT's terms of use.
