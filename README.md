# MTG-RGB-HD

MTG-RGB-HD est une application web de visualisation et d'export d'images satellites MTG (EUMETSAT), centrée sur la France, avec fusion multi-couches en temps reel.

## Fonctionnalites
- Panneau unique par couches actives: activation/desactivation independante de RGB, VIS et IR.
- Combinaisons prises en charge:
   - RGB
   - VIS
   - IR
   - RGB + VIS (fusion luminosite)
   - VIS + IR (Sandwich)
   - RGB + IR (fusion cloud-only)
   - RGB + VIS + IR (hybride)
- Ajustements image contextuels selon les couches actives:
   - contraste et luminosite VIS
   - saturation RGB
   - apport VIS sur RGB (quand pertinent)
   - intensite IR/Sandwich
   - style IR 10.5
   - reduction automatique du VIS la nuit
- Loader visuel de tuiles avec pourcentage et tuiles en attente.
- Export ZIP preselectionne selon les couches actives (VIS, RGB, IR, HD, Sandwich, Hybride).
- Selection temporelle en pas de 10 minutes.
- Overlays: frontieres, departements France, villes.

## Optimisations de chargement
- Vue initiale resserree sur la France (bounds dedies).
- Chargement evite sur la carte technique cachee (pas de double trafic tuiles).
- keepBuffer + updateWhenIdle sur les couches tuiles.
- Cache LRU des tuiles cloud-only IR pour les modes hybrides.
- Rendu des labels villes uniquement sur la carte visible.

## Stack technique
- React 19
- Vite
- Leaflet (WMS)
- JSZip + file-saver
- Tailwind CSS
- Lucide Icons

## Installation
Prerequis:
- Node.js 18+
- npm

Commandes:
```bash
npm install
npm run dev
```

Checks qualite:
```bash
npm run lint
```

## Utilisation
1. Choisir la date/heure (UTC) dans le selecteur en haut.
2. Activer les couches RGB, VIS, IR depuis la barre de controle.
3. Ouvrir Ajustements pour modifier les parametres disponibles pour la combinaison courante.
4. Activer les overlays via les Parametres (roue crantee).
5. Ouvrir la modale de telechargement pour choisir les exports proposes et generer un ZIP.

## Credits et sources
- Auteur: Quentin Rey
- Imagerie: EUMETSAT / Meteosat Third Generation (MTG)
- Fond de carte: CARTO, OpenStreetMap contributors

## Licence
Projet a but educatif et informatif. L'utilisation des donnees satellites reste soumise aux conditions EUMETSAT.
