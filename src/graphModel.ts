/**
 * Graph model — manages the workspace-wide dialogue graph.
 * Scans all .rpy files, parses them, and keeps the graph up to date
 * as files change.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  parseFile,
  mergeResults,
  graphToJson,
  FileParseResult,
} from './parser';

export class GraphModel {
  private results = new Map<string, FileParseResult>();
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  private watcher: vscode.FileSystemWatcher | undefined;

  constructor() {}

  /**
   * Initial full scan of the workspace for .rpy files.
   */
  async scan(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.rpy', '**/.*/**');
    const readPromises = files.map(async (uri) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const result = parseFile(doc.getText(), uri.fsPath);
      this.results.set(uri.fsPath, result);
    });
    await Promise.all(readPromises);
    this._onDidChange.fire();
  }

  /**
   * Start watching for .rpy file changes.
   */
  startWatching(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.rpy');

    this.watcher.onDidChange(async (uri) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      this.results.set(uri.fsPath, parseFile(doc.getText(), uri.fsPath));
      this._onDidChange.fire();
    }, null, disposables);

    this.watcher.onDidCreate(async (uri) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      this.results.set(uri.fsPath, parseFile(doc.getText(), uri.fsPath));
      this._onDidChange.fire();
    }, null, disposables);

    this.watcher.onDidDelete((uri) => {
      this.results.delete(uri.fsPath);
      this._onDidChange.fire();
    }, null, disposables);

    // Also re-parse on text document save (catches unsaved → saved transitions)
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'renpy' || doc.fileName.endsWith('.rpy')) {
        this.results.set(doc.uri.fsPath, parseFile(doc.getText(), doc.uri.fsPath));
        this._onDidChange.fire();
      }
    }, null, disposables);

    disposables.push(this.watcher);
    return disposables;
  }

  /**
   * Get the current graph as JSON for the webview.
   */
  toJson() {
    const merged = mergeResults(Array.from(this.results.values()));
    return graphToJson(merged);
  }

  /**
   * Get a set of unique .rpy file basenames (for color mapping).
   */
  getFileNames(): string[] {
    const names = new Set<string>();
    for (const r of this.results.values()) {
      names.add(path.basename(r.file, '.rpy'));
    }
    return Array.from(names).sort();
  }

  /**
   * Get stats about the current graph.
   */
  getStats(): { labels: number; edges: number; files: number } {
    let labels = 0;
    let edges = 0;
    for (const r of this.results.values()) {
      labels += r.labels.length;
      edges += r.edges.length;
    }
    return { labels, edges, files: this.results.size };
  }
}
