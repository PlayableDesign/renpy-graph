# renpy-graph

VS Code extension that visualizes Ren'Py dialogue flow as an interactive node graph.

## Features

- **Automatic parsing:** scans all `.rpy` files in your workspace for `label`, `jump`, `call`, and `menu` statements
- **Interactive graph:** pan, zoom, and click nodes to jump straight to that label in your editor
- **Live updates:** graph refreshes automatically when you save a `.rpy` file
- **Search/filter:** type in the search bar to highlight matching labels
- **Hover details:** hover a node to see its file, line number, and first line of dialogue
- **Color by file:** nodes are colored by their source `.rpy` file so you can see your project structure at a glance

## Usage

1. Open a workspace containing `.rpy` files
2. Run the command **Ren'Py: Show Dialogue Graph** from the command palette (`Ctrl+Shift+P`)
3. Click any node to jump to that label in the editor

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `renpyGraph.layout` | `dagre` | Layout algorithm: `dagre`, `cose`, or `breadthfirst` |
| `renpyGraph.showOrphans` | `true` | Show labels with no connections |
| `renpyGraph.colorByFile` | `true` | Color nodes by their source file |
| `renpyGraph.fontSize` | `11` | Font size (px) for node labels |
| `renpyGraph.nodeFillColor` | `#555555` | Node fill color (used when Color by File is off) |
| `renpyGraph.nodeOutlineColor` | `#888888` | Node border/outline color |
| `renpyGraph.jumpArrowColor` | `#4fc1ff` | Color of jump edges |
| `renpyGraph.choiceArrowColor` | `#e5c07b` | Color of menu choice edges |

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch the Extension Development Host
```
