# Orb de bureau — patches asar

Fichiers modifiés pour ajouter l'orb flottant à Alex.

## Fichiers
- `out/main/index.js` — fenêtre orb, tray menu toggle
- `out/renderer/assets/index-IxiuGhEc.js` — composant OrbDesktopApp + route `#orb`
- `out/renderer/index.html` — charge three.min.js
- `orb-desktop-route.js` — source injectée du composant OrbDesktopApp
- `orb-theme-inject.js` — thème Three.js de l'orb

## Restauration
```bash
npx asar pack /tmp/asar-content /tmp/squashfs-root/resources/app.asar
```
