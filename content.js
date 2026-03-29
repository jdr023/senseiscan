/* SenseiScan — replace Sensei's Library diagrams with interactive WGo.js boards */
(function () {
  'use strict';

  if (typeof WGo === 'undefined') return;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ─── SL board theme: match the real SL diagram colour palette ────────────────
  const SL_THEME = {
    backgroundColor: '#F2B06D', // measured from actual SL diagram PNGs
    grid: {
      linesColor: '#4A3320',
      starColor:  '#4A3320',
      linesWidth: 0.06,        // thicker than WGo default (0.03) to match SL images
    },
  };

  // ─── boarddata parsing ────────────────────────────────────────────────────────
  //
  // SL boarddata format (verified from live HTML):
  //   • stride = width + 1  (each row is followed by a '?' row-terminator)
  //   • boarddata[ row*(width+1) + col ]  for col in 0..width-1
  //   • '?'  in a non-terminator position = off-board (not shown in the diagram)
  //   • 'X'  = black stone, 'O' = white stone, '.' = empty intersection
  //   • ','  = circle mark  (SL's liberty/interest marker)
  //   • a-z (except 'x','o'), A-Z (except 'X','O'), '1'-'9' = labelled intersection

  function parseBoarddata(boarddata, width, height) {
    const stride = width + 1;
    const stones  = [];
    const markups = [];

    let minRow = height, maxRow = -1, minCol = width, maxCol = -1;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const base = row * stride + col;
        if (base >= boarddata.length) continue;
        const ch = boarddata[base];

        if (ch === '?') continue; // off-board — skip AND don't include in bbox

        // Expand bounding box of the visible region
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;

        if (ch === 'X') {
          stones.push({ x: col, y: row, type: 'B' });
        } else if (ch === 'O') {
          stones.push({ x: col, y: row, type: 'W' });
        } else if (ch === ',') {
          markups.push({ kind: 'CR', x: col, y: row });
        } else if ((ch >= 'a' && ch <= 'z' && ch !== 'x' && ch !== 'o') ||
                   (ch >= 'A' && ch <= 'Z' && ch !== 'X' && ch !== 'O') ||
                   (ch >= '1' && ch <= '9')) {
          markups.push({ kind: 'LB', x: col, y: row, text: ch });
        }
      }
    }

    // Fall back to the full board if nothing non-? was found
    if (maxRow === -1) { minRow = 0; maxRow = height - 1; minCol = 0; maxCol = width - 1; }

    // WGo viewport = how many lines to hide from each edge of the full board
    const viewport = {
      top:    minRow,
      left:   minCol,
      right:  (width  - 1) - maxCol,
      bottom: (height - 1) - maxRow,
    };

    return { stones, markups, viewport };
  }

  // ─── Diagram data extraction ──────────────────────────────────────────────────

  function getDiagramData(diagramEl) {
    const form = diagramEl.querySelector('form');
    if (!form) return null;

    const boarddata = form.querySelector('[name="boarddata"]')?.value;
    const widthStr  = form.querySelector('[name="width"]')?.value;
    const heightStr = form.querySelector('[name="height"]')?.value;
    if (!boarddata || !widthStr || !heightStr) return null;

    const width  = parseInt(widthStr,  10);
    const height = parseInt(heightStr, 10);
    if (!width || !height) return null;

    // Accept either the exact stride-based length or the naive w*h length
    const expectedMin = width * height;
    if (boarddata.length < expectedMin) return null;

    // Label: first non-empty text node in the form (before any INPUT element)
    let label = '';
    for (const node of form.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t) { label = t; break; }
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'INPUT') break;
    }

    const sgfLink = diagramEl.querySelector('a[href$=".sgf"]');
    const sgfUrl  = sgfLink?.href ?? null;
    const img     = diagramEl.querySelector('img');

    return { boarddata, width, height, label, sgfUrl, img };
  }

  // ─── Minimal SGF player ───────────────────────────────────────────────────────

  function buildMinimalPlayer(container, sgfText, boardSize, viewport, boardWidth) {
    const kifu = WGo.KifuNode.fromSGF(sgfText);

    // Honour the SGF's own board size if it disagrees with the static board
    const szProp = kifu.getProperty('SZ');
    if (szProp != null) {
      const v = Array.isArray(szProp) ? szProp[0] : szProp;
      boardSize = (typeof v === 'object' && 'x' in v) ? v.x : (parseInt(v, 10) || boardSize);
    }

    // Trim the trailing extra move — SL SGFs append one continuation move beyond
    // what the diagram shows, so remove the deepest node in the main line.
    let lastNode = kifu;
    while (lastNode.children.length > 0) lastNode = lastNode.children[0];
    if (lastNode !== kifu) {
      const idx = lastNode.parent.children.indexOf(lastNode);
      if (idx !== -1) lastNode.parent.children.splice(idx, 1);
    }

    container.innerHTML = '';

    // ── Use SVGBoardComponent for correct, tested stone + markup rendering ──
    const boardComponent = new WGo.SVGBoardComponent({ coordinates: false });

    // Apply SL theme directly on the internal board's config
    boardComponent.board.config.theme.backgroundColor = SL_THEME.backgroundColor;
    boardComponent.board.config.theme.grid.linesColor = SL_THEME.grid.linesColor;
    boardComponent.board.config.theme.grid.starColor  = SL_THEME.grid.starColor;
    boardComponent.board.config.theme.grid.linesWidth = SL_THEME.grid.linesWidth;
    // Remove extra margin so the grid fills exactly to the image crop boundary
    boardComponent.board.config.theme.marginSize = 0.1;
    // Remove WGo's decorative wood-border on the touch area overlay
    boardComponent.board.touchArea.style.border = 'none';
    // Flat stones: replace gradient glass-stone handlers with SimpleStone.
    // SimpleStone returns a plain <circle> with no gradient overlays and no shadow.
    boardComponent.board.config.theme.drawHandlers.B = new WGo.svgDrawHandlers.SimpleStone('#000000');
    boardComponent.board.config.theme.drawHandlers.W = new WGo.svgDrawHandlers.SimpleStone('#ffffff');
    // Scale CR and SQ marker handlers so they render smaller than a stone,
    // matching SL's diagram style.  We wrap each handler's createElement and
    // multiply every geometric attribute by MARKER_SCALE before WGo draws them.
    const MARKER_SCALE = 0.75;
    ['CR', 'SQ'].forEach(type => {
      const orig = boardComponent.board.config.theme.drawHandlers[type];
      boardComponent.board.config.theme.drawHandlers[type] = {
        createElement(config) {
          const elem = orig.createElement(config);
          Object.values(elem).forEach(el => {
            if (el.tagName === 'circle') {
              el.setAttribute('r', String(parseFloat(el.getAttribute('r')) * MARKER_SCALE));
            } else if (el.tagName === 'rect') {
              for (const attr of ['x', 'y', 'width', 'height']) {
                el.setAttribute(attr, String(parseFloat(el.getAttribute(attr)) * MARKER_SCALE));
              }
            }
          });
          return elem;
        },
        updateElement: orig.updateElement.bind(orig),
      };
    });
    boardComponent.board.config.size  = boardSize;
    boardComponent.board.config.width = boardWidth;
    // Redraw with new theme/size, then set the cropped viewport, then fix width
    boardComponent.board.redraw();
    boardComponent.board.setViewport(viewport);
    boardComponent.board.resize();

    // ── Replace WGo's circular star points with solid black squares ──────────
    // WGo hardcodes star circles as <circle fill="#553310"> in the grid group.
    // SL images use small filled squares for star points, so swap them out.
    boardComponent.board.svgElement.querySelectorAll('circle[fill="#553310"]').forEach(circle => {
      const cx   = parseFloat(circle.getAttribute('cx'));
      const cy   = parseFloat(circle.getAttribute('cy'));
      const r    = parseFloat(circle.getAttribute('r'));
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x',      String(cx - r));
      rect.setAttribute('y',      String(cy - r));
      rect.setAttribute('width',  String(r * 2));
      rect.setAttribute('height', String(r * 2));
      rect.setAttribute('fill',   SL_THEME.grid.starColor);
      rect.setAttribute('stroke-width', '0');
      circle.parentNode.replaceChild(rect, circle);
    });

    // ── Last-move indicator — contrasting circle per stone colour ───────────
    // Near-zero fill (not exactly rgba(0,0,0,0)) so the red CSS rule for symbol
    // markers does NOT fire on these circles.
    boardComponent.config.currentMoveBlackMark = new WGo.svgDrawHandlers.Circle({
      color:     'rgba(255,255,255,0.9)',   // white ring on black stone
      fillColor: 'rgba(255,255,255,0.001)',
    });
    boardComponent.config.currentMoveWhiteMark = new WGo.svgDrawHandlers.Circle({
      color:     'rgba(0,0,0,0.85)',        // dark ring on white stone
      fillColor: 'rgba(0,0,0,0.001)',
    });

    boardComponent.element.className = 'senseiscan-player-board';
    container.appendChild(boardComponent.element);

    // ── Wire PlayerBase + SVGBoardComponent ──
    const player = new WGo.PlayerBase();
    boardComponent.create(player); // attaches all stone/markup event listeners
    player.loadKifu(kifu);

    return player;
  }

  // ─── SGF upgrade (on click) ───────────────────────────────────────────────────

  const upgrading = new WeakSet();

  async function upgradeToPlayer(boardContainer, sgfUrl, boardSize, viewport, boardWidth, textPromise) {
    if (upgrading.has(boardContainer)) return null;
    upgrading.add(boardContainer);
    boardContainer.classList.add('senseiscan-loading');

    try {
      // Use pre-fetched text if available; fall back to a fresh fetch if not.
      let sgfText = textPromise ? await textPromise : null;
      if (!sgfText) {
        const resp = await fetch(sgfUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        sgfText = await resp.text();
      }
      boardContainer.classList.remove('senseiscan-loading');
      return buildMinimalPlayer(boardContainer, sgfText, boardSize, viewport, boardWidth);
    } catch (err) {
      console.warn('SenseiScan: could not load SGF from', sgfUrl, err);
      boardContainer.classList.remove('senseiscan-loading');
      upgrading.delete(boardContainer);
      return null;
    }
  }

  // ─── Main diagram processor ───────────────────────────────────────────────────

  function processDiagram(diagramEl) {
    if (diagramEl.dataset.senseiscanDone) return;
    diagramEl.dataset.senseiscanDone = '1';

    const data = getDiagramData(diagramEl);
    if (!data) return;
    const { boarddata, width, height, sgfUrl, img } = data;
    if (!img) return;

    // Measure the original image (HTML attribute is reliable at document_idle)
    const imgW = parseInt(img.getAttribute('width')  || '0', 10) || img.offsetWidth  || 300;
    const imgH = parseInt(img.getAttribute('height') || '0', 10) || img.offsetHeight || 300;

    // The img may be wrapped in the SGF <a> link — hide the whole anchor
    const originalEl = img.closest('a[href$=".sgf"]') ?? img;
    originalEl.classList.add('senseiscan-original');

    // Prevent the SGF anchor from navigating — we have a dedicated download button
    if (originalEl.tagName === 'A') {
      originalEl.addEventListener('click', e => e.preventDefault());
    }

    // ── Outer container — inline block holding wrapper + controls bar ─────────
    const outer = document.createElement('div');
    outer.className = 'senseiscan-outer';

    // ── Board wrapper — fixed to the image's exact footprint ──────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'senseiscan-wrapper';
    wrapper.style.width  = imgW + 'px';
    wrapper.style.height = imgH + 'px';

    // ── Board container — fills the wrapper absolutely ─────────────────────────
    const boardContainer = document.createElement('div');
    boardContainer.className = 'senseiscan-board';

    // Compute board geometry without rendering a static WGo board.
    // Rendering a static board would populate the shared WGo draw-handler
    // singleton caches (<defs> gradients/filters). If that SVG is later
    // destroyed by container.innerHTML = '' the cached elements become
    // detached and the player board renders stones invisibly.
    const { viewport, markups } = parseBoarddata(boarddata, width, height);
    const boardSize = Math.max(width, height);
    // Count labelled positions in the diagram to cap navigation depth.
    // labelCount = 0 means no sequence is shown — navigation is uncapped
    // (relies on the SGF having the right move count).
    const labelCount = markups.filter(m => m.kind === 'LB').length;

    wrapper.appendChild(boardContainer);

    // ── Controls bar — placed BELOW the wrapper (not overlaying the board) ────
    const mkBtn = (text, title) => {
      const b = document.createElement('button');
      b.className = 'senseiscan-ctrl-btn';
      b.textContent = text;
      b.title = title;
      return b;
    };

    const firstBtn  = mkBtn('⏮', 'First position');
    const prevBtn   = mkBtn('◀', 'Previous move');
    // Toggle sits in the center; ▷ (outlined play) is visually distinct from ▶ (next move)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'senseiscan-ctrl-btn senseiscan-toggle';
    toggleBtn.setAttribute('aria-label', 'Toggle interactive board');
    const nextBtn  = mkBtn('▶', 'Next move');
    const lastBtn  = mkBtn('⏭', 'Last position');

    const bar = document.createElement('div');
    bar.className = 'senseiscan-controls';
    bar.style.width = imgW + 'px';

    if (sgfUrl) {
      const dlLink = document.createElement('a');
      dlLink.className = 'senseiscan-ctrl-btn senseiscan-download';
      dlLink.textContent = '⬇';
      dlLink.title = 'Download SGF';
      dlLink.href = sgfUrl;
      dlLink.download = sgfUrl.split('/').pop() || 'game.sgf';
      dlLink.addEventListener('click', e => e.stopPropagation());
      bar.append(firstBtn, prevBtn, toggleBtn, nextBtn, lastBtn, dlLink);
    } else {
      bar.append(firstBtn, prevBtn, toggleBtn, nextBtn, lastBtn);
    }
    // All navigation buttons start disabled; they enable once the player is wired.
    // Toggle is enabled immediately if there's an SGF URL (we can't know move
    // count without fetching; the player will disable it post-load if empty).
    firstBtn.disabled = prevBtn.disabled = nextBtn.disabled = lastBtn.disabled = true;
    toggleBtn.disabled = !sgfUrl;

    let showingOriginal = false;
    let playerRef       = null;
    let updateBtnsRef   = null;

    function setView(toOriginal) {
      showingOriginal = toOriginal;
      boardContainer.style.display = toOriginal ? 'none' : '';
      originalEl.style.display     = toOriginal ? ''     : 'none';
      // Add gray border to wrapper when showing the interactive board
      wrapper.classList.toggle('senseiscan-board-active', !toOriginal);
      toggleBtn.textContent = toOriginal ? '▷' : '⊞';
      toggleBtn.title = toOriginal ? 'Show interactive board' : 'Show original image';
      if (toOriginal) {
        firstBtn.disabled = prevBtn.disabled = nextBtn.disabled = lastBtn.disabled = true;
      }
      if (!toOriginal && playerRef) {
        // Reset to first position; if already at root first() fires no events,
        // so always call updateBtns explicitly afterwards to re-enable buttons.
        playerRef.first();
        if (updateBtnsRef) updateBtnsRef();
      }
    }

    // Wire controls to player once built
    function wirePlayerControls(player) {
      function currentDepth() {
        let depth = 0, n = player.currentNode;
        while (n.parent) { depth++; n = n.parent; }
        return depth;
      }
      function canGoNext() {
        if (!player.currentNode.children.length) return false;
        // If the diagram shows a labelled sequence, cap navigation at that depth
        if (labelCount > 0 && currentDepth() >= labelCount) return false;
        return true;
      }
      function updateBtns() {
        prevBtn.disabled  = !player.currentNode.parent;
        firstBtn.disabled = !player.currentNode.parent;
        nextBtn.disabled  = !canGoNext();
        lastBtn.disabled  = !canGoNext();
      }
      updateBtnsRef = updateBtns;
      player.on('applyNodeChanges', updateBtns);
      updateBtns();
      firstBtn.onclick = () => player.first();
      prevBtn.onclick  = () => player.previous();
      nextBtn.onclick  = () => { if (canGoNext()) player.next(); };
      lastBtn.onclick  = () => { while (canGoNext()) player.next(); };

      // Keyboard navigation
      boardContainer.setAttribute('tabindex', '0');
      boardContainer.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { player.previous(); e.preventDefault(); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { if (canGoNext()) player.next(); e.preventDefault(); }
        if (e.key === 'Home') { player.first(); e.preventDefault(); }
        if (e.key === 'End')  { while (canGoNext()) player.next(); e.preventDefault(); }
      });
    }

    // ── Assemble DOM ──────────────────────────────────────────────────────────
    // outer → wrapper (board + original, fixed size) + bar (controls, below)
    outer.appendChild(wrapper);
    outer.appendChild(bar);

    const originalParent = originalEl.parentNode;
    originalParent.insertBefore(outer, originalEl);
    wrapper.appendChild(originalEl);
    setView(true); // initialise state: show original image first

    // ── Pre-fetch SGF on hover ────────────────────────────────────────────────
    // Start the network request as soon as the user moves over the diagram so
    // the SGF is likely already cached by the time they click the toggle.
    let prefetchPromise = null;
    if (sgfUrl) {
      outer.addEventListener('mouseenter', () => {
        if (!prefetchPromise && !upgraded) {
          prefetchPromise = fetch(sgfUrl)
            .then(r => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .catch(() => null); // null signals upgradeToPlayer to fall back to fresh fetch
        }
      });
    }

    // ── Activate board ────────────────────────────────────────────────────────
    let upgraded = false;

    function activateBoard() {
      setView(false);
      if (sgfUrl && !upgraded) {
        upgraded = true;
        upgradeToPlayer(boardContainer, sgfUrl, boardSize, viewport, imgW, prefetchPromise)
          .then(player => {
            if (player) {
              playerRef = player;
              wirePlayerControls(player);
            }
          });
      }
    }

    // Toggle button: activate board (from image) or return to image (from board)
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (showingOriginal) activateBoard(); else setView(true);
    });
  }

  // ─── Lazy rendering via IntersectionObserver ──────────────────────────────────

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        io.unobserve(e.target);
        processDiagram(e.target);
      }
    }
  }, { rootMargin: '300px 0px' });

  function observeAll(root) {
    for (const el of root.querySelectorAll('div.diagram')) {
      if (!el.dataset.senseiscanDone) io.observe(el);
    }
  }

  // ─── MutationObserver for dynamically injected diagrams ──────────────────────

  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches('div.diagram')) {
          if (!node.dataset.senseiscanDone) io.observe(node);
        } else {
          observeAll(node);
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  observeAll(document);
})();
