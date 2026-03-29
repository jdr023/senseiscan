# SenseiScan

A Chrome extension that replaces static Go diagram images on [Sensei's Library](https://senseis.xmp.net) with interactive WGo.js boards.

![Demo](https://github.com/user-attachments/assets/b722389e-6a0c-4c2b-81fc-4cebad26ece5)

## Features

- Replaces SL's static PNG diagrams with fully interactive boards on demand
- Matches SL's visual style: board colour, grid line weight, flat stones, square star points
- Navigate move sequences with buttons or keyboard arrow keys
- Caps navigation depth to the sequence shown in the diagram (letter-labelled positions)
- Download the SGF file directly from the controls bar
- SGF is pre-fetched on hover so the board loads instantly on click
- Works with dynamically loaded diagrams (MutationObserver) and lazy-loads off-screen diagrams (IntersectionObserver)

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `senseiscan` folder
5. Navigate to any page on `senseis.xmp.net` — diagrams will show a controls bar beneath them

## Usage

| Control | Action |
|---|---|
| **▷** | Switch to interactive board |
| **⊞** | Return to original image |
| **⏮ ◀ ▶ ⏭** | First / previous / next / last move |
| **⬇** | Download SGF |
| Arrow keys | Navigate moves (when board is focused) |
| Home / End | Jump to first / last move |

The toggle button is disabled when the diagram has no move sequence (position-only diagrams).

## Project structure

```
senseiscan/
├── manifest.json      # Manifest V3 extension config
├── content.js         # Main content script
├── content.css        # Board and controls styles
└── lib/
    ├── wgo.js         # WGo.js v3.0.0-alpha.10 (UMD bundle)
    └── wgo.css        # WGo base styles
```

## Technical notes

- **No static board render** — board geometry is computed from `boarddata` form fields without rendering a throwaway WGo board. This avoids a WGo bug where drawing handlers cache SVG `<defs>` elements that become detached when the container is cleared, causing stones to render invisibly on the player board.
- **Viewport cropping** — the bounding box of non-`?` cells in `boarddata` is used to set WGo's viewport, matching the crop of SL's static diagram image.
- **Marker scaling** — CR (circle) and SQ (square) markup handlers are wrapped at build time to scale their geometry down to 75% so markers sit comfortably inside a stone.
- **Last-move indicator** — uses `fillColor: 'rgba(x,x,x,0.001)'` (non-zero alpha) so it is not matched by the CSS rule that colours symbol markers red.
- **Trailing move trim** — SL SGFs append one extra move beyond the diagram; this is stripped before the kifu is loaded into the player.
