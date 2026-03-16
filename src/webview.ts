/**
 * Webview provider — creates the graph panel and manages communication
 * between the extension and the Cytoscape.js webview.
 */

import * as vscode from 'vscode';
import { GraphModel } from './graphModel';

export class GraphWebview {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly model: GraphModel
  ) {}

  /**
   * Show (or reveal) the graph panel.
   */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      this.sendUpdate();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'renpyGraph',
      "Ren'Py Dialogue Graph",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    this.panel.webview.html = this.getHtml();

    // Listen for messages from the webview (node clicks)
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'navigate') {
        this.navigateToLabel(msg.file, msg.line);
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Initial data push (slight delay to let webview initialize)
    setTimeout(() => this.sendUpdate(), 300);
  }

  /**
   * Push the latest graph data to the webview.
   */
  sendUpdate(): void {
    if (!this.panel) { return; }
    const config = vscode.workspace.getConfiguration('renpyGraph');
    this.panel.webview.postMessage({
      type: 'update',
      graph: this.model.toJson(),
      files: this.model.getFileNames(),
      stats: this.model.getStats(),
      settings: {
        layout: config.get<string>('layout', 'dagre'),
        showOrphans: config.get<boolean>('showOrphans', true),
        colorByFile: config.get<boolean>('colorByFile', true),
      },
    });
  }

  /**
   * Navigate the editor to a specific label in a .rpy file.
   */
  private async navigateToLabel(file: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(file);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const range = new vscode.Range(line, 0, line, 0);
      editor.selection = new vscode.Selection(range.start, range.start);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (err) {
      vscode.window.showErrorMessage(`Could not open file: ${file}`);
    }
  }

  /**
   * Generate the full HTML for the webview, including Cytoscape.js and dagre.
   */
  private getHtml(): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Ren'Py Dialogue Graph</title>
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-editor-foreground, #ccc);
    --border: var(--vscode-panel-border, #444);
    --accent: var(--vscode-textLink-foreground, #4fc1ff);
    --badge-bg: var(--vscode-badge-background, #333);
    --badge-fg: var(--vscode-badge-foreground, #fff);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: 13px;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .toolbar .stats {
    opacity: 0.6;
    font-size: 12px;
  }
  .toolbar .spacer { flex: 1; }
  .toolbar button {
    background: var(--badge-bg);
    color: var(--badge-fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    font-size: 12px;
  }
  .toolbar button:hover { opacity: 0.8; }
  .toolbar input[type="text"] {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    width: 180px;
  }

  /* ── Legend ── */
  .legend {
    display: flex;
    gap: 14px;
    font-size: 11px;
    opacity: 0.7;
    flex-wrap: wrap;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .legend-swatch {
    display: inline-block;
    width: 18px;
    height: 3px;
    border-radius: 2px;
  }

  /* ── Graph container ── */
  #cy {
    flex: 1;
    min-height: 0;
  }

  /* ── Tooltip ── */
  .tooltip {
    display: none;
    position: absolute;
    background: var(--badge-bg);
    color: var(--badge-fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    pointer-events: none;
    z-index: 100;
    max-width: 300px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="search" placeholder="Filter labels..." />
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch" style="background:#4fc1ff"></span>jump</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#c678dd; border: 1px dashed #c678dd"></span>call</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#e5c07b"></span>menu</span>
    </div>
    <div class="spacer"></div>
    <span class="stats" id="stats"></span>
    <button id="btn-fit" title="Fit graph to view">Fit</button>
    <button id="btn-relayout" title="Re-run layout">Layout</button>
  </div>
  <div id="cy"></div>
  <div class="tooltip" id="tooltip"></div>

  <!-- Cytoscape.js + dagre layout from CDN -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.28.1/cytoscape.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"></script>

  <script>
    // ── VS Code API ──
    const vscode = acquireVsCodeApi();

    // ── Color palette for files ──
    const FILE_COLORS = [
      '#61afef', '#98c379', '#e5c07b', '#c678dd', '#e06c75',
      '#56b6c2', '#d19a66', '#be5046', '#7ec699', '#a9b2c3',
    ];
    let fileColorMap = {};

    // ── Edge colors ──
    const EDGE_COLORS = {
      jump: '#4fc1ff',
      call: '#c678dd',
      menu: '#e5c07b',
    };

    // ── Initialize Cytoscape ──
    const cy = cytoscape({
      container: document.getElementById('cy'),
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(id)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-family': 'var(--vscode-font-family, monospace)',
            'color': '#fff',
            'text-outline-color': 'data(color)',
            'text-outline-width': 2,
            'background-color': 'data(color)',
            'border-width': 2,
            'border-color': 'data(borderColor)',
            'shape': 'round-rectangle',
            'width': 'label',
            'height': 'label',
            'padding': '10px',
            'min-width': '60px',
          },
        },
        {
          selector: 'node.start',
          style: {
            'border-width': 3,
            'border-color': '#e5c07b',
          },
        },
        {
          selector: 'node.orphan',
          style: {
            'opacity': 0.5,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#fff',
            'border-width': 3,
            'z-index': 10,
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.15,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2,
          },
        },
        {
          selector: 'edge[type="call"]',
          style: {
            'line-style': 'dashed',
          },
        },
        {
          selector: 'edge[type="menu"]',
          style: {
            'label': 'data(menuText)',
            'font-size': '9px',
            'color': '#e5c07b',
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
            'text-outline-color': '#1e1e1e',
            'text-outline-width': 1,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.08,
          },
        },
      ],
      layout: { name: 'grid' },  // placeholder, re-laid out on data
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 4,
    });

    // ── State ──
    let currentLayout = 'dagre';
    let showOrphans = true;
    let colorByFile = true;
    let currentGraphData = null;

    // ── Message handler ──
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'update') {
        currentLayout = msg.settings.layout;
        showOrphans = msg.settings.showOrphans;
        colorByFile = msg.settings.colorByFile;
        currentGraphData = msg;
        rebuildGraph(msg);
      }
    });

    function rebuildGraph(msg) {
      const { graph, files, stats } = msg;

      // Build file → color map
      fileColorMap = {};
      files.forEach((f, i) => {
        fileColorMap[f] = FILE_COLORS[i % FILE_COLORS.length];
      });

      // Find nodes with edges
      const hasIncoming = new Set();
      const hasOutgoing = new Set();
      graph.edges.forEach((e) => {
        hasOutgoing.add(e.from);
        hasIncoming.add(e.to);
      });

      // Build elements
      const elements = [];

      graph.nodes.forEach((n) => {
        const isOrphan = !hasIncoming.has(n.id) && !hasOutgoing.has(n.id);
        if (isOrphan && !showOrphans) return;

        // Extract filename without extension for color mapping
        const fname = n.file.replace(/.*[\\/]/, '').replace(/\\.rpy$/, '');
        const nodeColor = colorByFile ? (fileColorMap[fname] || '#666') : '#555';

        const classes = [];
        if (n.id === 'start' || n.id === 'main_menu' || n.id === 'splashscreen') {
          classes.push('start');
        }
        if (isOrphan) classes.push('orphan');

        elements.push({
          group: 'nodes',
          data: {
            id: n.id,
            file: n.file,
            line: n.line,
            comment: n.comment || '',
            color: nodeColor,
            borderColor: nodeColor,
          },
          classes: classes.join(' '),
        });
      });

      graph.edges.forEach((e, i) => {
        // Only add edge if both endpoints exist in our node set
        const nodeIds = new Set(elements.filter(el => el.group === 'nodes').map(el => el.data.id));
        if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) return;

        elements.push({
          group: 'edges',
          data: {
            id: 'e' + i,
            source: e.from,
            target: e.to,
            type: e.type,
            color: EDGE_COLORS[e.type] || '#666',
            menuText: e.menuText || '',
          },
        });
      });

      // Update graph
      cy.elements().remove();
      cy.add(elements);
      runLayout();

      // Update stats
      document.getElementById('stats').textContent =
        stats.labels + ' labels · ' + stats.edges + ' edges · ' + stats.files + ' files';
    }

    function runLayout() {
      const layoutOpts = {
        dagre: {
          name: 'dagre',
          rankDir: 'TB',
          rankSep: 60,
          nodeSep: 30,
          edgeSep: 10,
          animate: true,
          animationDuration: 300,
        },
        cose: {
          name: 'cose',
          animate: true,
          animationDuration: 500,
          nodeRepulsion: 8000,
          idealEdgeLength: 120,
        },
        breadthfirst: {
          name: 'breadthfirst',
          directed: true,
          spacingFactor: 1.5,
          animate: true,
          animationDuration: 300,
        },
      };

      cy.layout(layoutOpts[currentLayout] || layoutOpts.dagre).run();
    }

    // ── Node click → navigate to file ──
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      vscode.postMessage({
        type: 'navigate',
        file: node.data('file'),
        line: node.data('line'),
      });
    });

    // ── Hover: highlight connected ──
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass('dimmed');
      node.addClass('highlighted');

      // Show tooltip
      const tip = document.getElementById('tooltip');
      const comment = node.data('comment');
      const file = node.data('file').replace(/.*[\\/]/, '');
      let html = '<strong>' + node.id() + '</strong><br/>' + file + ':' + (node.data('line') + 1);
      if (comment) html += '<br/><em>' + escapeHtml(comment) + '</em>';
      tip.innerHTML = html;
      tip.style.display = 'block';

      const pos = evt.renderedPosition;
      tip.style.left = (pos.x + 15) + 'px';
      tip.style.top = (pos.y + 15) + 'px';
    });

    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted');
      document.getElementById('tooltip').style.display = 'none';
    });

    // ── Search/filter ──
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      if (!q) {
        cy.elements().removeClass('dimmed highlighted');
        return;
      }
      cy.nodes().forEach((node) => {
        if (node.id().toLowerCase().includes(q)) {
          node.removeClass('dimmed').addClass('highlighted');
        } else {
          node.addClass('dimmed').removeClass('highlighted');
        }
      });
      cy.edges().forEach((edge) => {
        const src = edge.source();
        const tgt = edge.target();
        if (src.hasClass('highlighted') || tgt.hasClass('highlighted')) {
          edge.removeClass('dimmed');
        } else {
          edge.addClass('dimmed');
        }
      });
    });

    // ── Toolbar buttons ──
    document.getElementById('btn-fit').addEventListener('click', () => {
      cy.fit(undefined, 40);
    });
    document.getElementById('btn-relayout').addEventListener('click', () => {
      runLayout();
    });

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
  }
}
