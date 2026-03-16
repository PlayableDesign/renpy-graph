/**
 * Ren'Py script parser — extracts labels, jumps, calls, and menu branches
 * from .rpy files to build a dialogue flow graph.
 *
 * Ren'Py's structure is indentation-based (like Python), so we track indent
 * levels to associate menu choices and jumps with their parent labels.
 */

/** A single label definition in a .rpy file */
export interface RenpyLabel {
  name: string;
  file: string;       // absolute path to the .rpy file
  line: number;       // 0-indexed line number
  indent: number;     // indentation level (column of 'l' in 'label')
  /** Optional docstring — first comment or string after the label */
  comment?: string;
}

/** An edge in the dialogue flow graph */
export interface RenpyEdge {
  from: string;       // source label name
  to: string;         // target label name
  type: 'jump' | 'call' | 'menu';
  /** For menu edges, the choice text that leads here */
  menuText?: string;
  file: string;
  line: number;
}

/** Full parse result for a single .rpy file */
export interface FileParseResult {
  file: string;
  labels: RenpyLabel[];
  edges: RenpyEdge[];
}

/** Aggregated graph across all files */
export interface DialogueGraph {
  labels: Map<string, RenpyLabel>;
  edges: RenpyEdge[];
}

// ─── Regex patterns ────────────────────────────────────────────────

// `label chapter1_intro:` or `label .sub_label:`
const RE_LABEL = /^(\s*)label\s+([\w.]+)\s*(\(.*?\))?\s*:/;

// `jump chapter2` or `jump expression some_var`
const RE_JUMP = /^(\s*)jump\s+([\w.]+)\s*$/;

// `call chapter2` or `call screen some_screen`
const RE_CALL = /^(\s*)call\s+(?!screen\b)([\w.]+)/;

// `menu:` or `menu optional_label:`
const RE_MENU = /^(\s*)menu\s*(\w*)\s*:/;

// `"Choice text":` inside a menu block
const RE_MENU_CHOICE = /^(\s*)"([^"]+)"\s*(\s+if\s+.+)?\s*:/;

// Programmatic: `$ renpy.jump("label")` or `$ renpy.call("label")`
const RE_RENPY_JUMP = /renpy\.jump\(\s*["']([\w.]+)["']\s*\)/;
const RE_RENPY_CALL = /renpy\.call\(\s*["']([\w.]+)["']\s*\)/;

// ─── Parser ────────────────────────────────────────────────────────

/**
 * Parse a single .rpy file and extract its labels and edges.
 */
export function parseFile(text: string, filePath: string): FileParseResult {
  const lines = text.split('\n');
  const labels: RenpyLabel[] = [];
  const edges: RenpyEdge[] = [];

  let currentLabel: string | null = null;
  let currentLabelIndent = 0;
  let inMenu = false;
  let menuIndent = 0;
  let currentMenuChoice: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.trimStart().startsWith('#')) {
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // ── Label definition ──
    const labelMatch = trimmed.match(RE_LABEL);
    if (labelMatch) {
      const name = labelMatch[2];
      currentLabel = name;
      currentLabelIndent = indent;
      inMenu = false;
      currentMenuChoice = null;

      // Look ahead for a comment/docstring
      let comment: string | undefined;
      if (i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trimStart();
        if (nextTrimmed.startsWith('#')) {
          comment = nextTrimmed.replace(/^#\s*/, '');
        } else if (nextTrimmed.startsWith('"') && !nextTrimmed.includes(':')) {
          comment = nextTrimmed.replace(/^"/, '').replace(/"$/, '');
          if (comment.length > 80) {
            comment = comment.substring(0, 77) + '...';
          }
        }
      }

      labels.push({ name, file: filePath, line: i, indent, comment });
      continue;
    }

    // If we're past the current label's scope, clear it
    if (currentLabel && indent <= currentLabelIndent && !labelMatch) {
      // Only clear if this is a non-indented statement (back to label level or above)
      // but NOT if it's another label (handled above)
      if (indent <= currentLabelIndent) {
        // Check if this line is at a top-level construct
        if (indent === 0 && !trimmed.startsWith(' ')) {
          currentLabel = null;
          inMenu = false;
          currentMenuChoice = null;
        }
      }
    }

    // ── Menu block ──
    const menuMatch = trimmed.match(RE_MENU);
    if (menuMatch && currentLabel) {
      inMenu = true;
      menuIndent = indent;
      currentMenuChoice = null;
      continue;
    }

    // ── Menu choice ──
    const choiceMatch = trimmed.match(RE_MENU_CHOICE);
    if (choiceMatch && inMenu && currentLabel) {
      currentMenuChoice = choiceMatch[2];
      continue;
    }

    // ── Jump ──
    const jumpMatch = trimmed.match(RE_JUMP);
    if (jumpMatch && currentLabel) {
      edges.push({
        from: currentLabel,
        to: jumpMatch[2],
        type: inMenu && currentMenuChoice ? 'menu' : 'jump',
        menuText: inMenu ? (currentMenuChoice ?? undefined) : undefined,
        file: filePath,
        line: i,
      });
      continue;
    }

    // ── Call ──
    const callMatch = trimmed.match(RE_CALL);
    if (callMatch && currentLabel) {
      edges.push({
        from: currentLabel,
        to: callMatch[2],
        type: 'call',
        file: filePath,
        line: i,
      });
      continue;
    }

    // ── Programmatic jump/call ──
    const pJumpMatch = trimmed.match(RE_RENPY_JUMP);
    if (pJumpMatch && currentLabel) {
      edges.push({
        from: currentLabel,
        to: pJumpMatch[1],
        type: 'jump',
        file: filePath,
        line: i,
      });
    }

    const pCallMatch = trimmed.match(RE_RENPY_CALL);
    if (pCallMatch && currentLabel) {
      edges.push({
        from: currentLabel,
        to: pCallMatch[1],
        type: 'call',
        file: filePath,
        line: i,
      });
    }

    // ── Exiting menu scope ──
    if (inMenu && indent <= menuIndent && !menuMatch) {
      inMenu = false;
      currentMenuChoice = null;
    }
  }

  return { file: filePath, labels, edges };
}

/**
 * Merge multiple file parse results into a single dialogue graph.
 */
export function mergeResults(results: FileParseResult[]): DialogueGraph {
  const labels = new Map<string, RenpyLabel>();
  const edges: RenpyEdge[] = [];

  for (const result of results) {
    for (const label of result.labels) {
      labels.set(label.name, label);
    }
    edges.push(...result.edges);
  }

  return { labels, edges };
}

/**
 * Convert a DialogueGraph to a JSON-serializable format for the webview.
 */
export function graphToJson(graph: DialogueGraph): {
  nodes: Array<{
    id: string;
    file: string;
    line: number;
    comment?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    menuText?: string;
  }>;
} {
  const nodes = Array.from(graph.labels.values()).map((l) => ({
    id: l.name,
    file: l.file,
    line: l.line,
    comment: l.comment,
  }));

  const edges = graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    type: e.type,
    menuText: e.menuText,
  }));

  return { nodes, edges };
}
