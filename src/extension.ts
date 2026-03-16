/**
 * Extension entry point — wires up the graph model, webview, and commands.
 */

import * as vscode from 'vscode';
import { GraphModel } from './graphModel';
import { GraphWebview } from './webview';

export function activate(context: vscode.ExtensionContext) {
  const model = new GraphModel();
  const webview = new GraphWebview(context.extensionUri, model);

  // When the graph data changes, push updates to the webview
  model.onDidChange(() => {
    webview.sendUpdate();
  });

  // Command: show the graph
  context.subscriptions.push(
    vscode.commands.registerCommand('renpyGraph.showGraph', async () => {
      // Scan on first open (or rescan)
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Ren'Py Graph: Scanning .rpy files...",
          cancellable: false,
        },
        async () => {
          await model.scan();
        }
      );
      webview.show();

      const stats = model.getStats();
      vscode.window.showInformationMessage(
        `Ren'Py Graph: Found ${stats.labels} labels across ${stats.files} files.`
      );
    })
  );

  // Command: refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('renpyGraph.refresh', async () => {
      await model.scan();
      webview.sendUpdate();
    })
  );

  // Start the file watcher
  const watcherDisposables = model.startWatching();
  context.subscriptions.push(...watcherDisposables);
}

export function deactivate() {
  // nothing to clean up — disposables handle it
}
