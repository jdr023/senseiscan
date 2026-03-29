# SenseiScan

A Chrome extension that replaces static Go diagram images on [Sensei's Library](https://senseis.xmp.net) with interactive WGo.js boards.

![Demo](https://github.com/user-attachments/assets/b722389e-6a0c-4c2b-81fc-4cebad26ece5)

## Features

- Replaces SL's static PNG diagrams with fully interactive boards on demand
- Matches SL's visual style: board colour, grid line weight, flat stones, square star points
- Navigate move sequences with buttons or keyboard arrow keys
- Download the SGF file directly from the controls bar
- SGF is pre-fetched on hover so the board loads instantly on click

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
