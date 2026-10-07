const vscode = require('vscode');

const BEGIN_RE = /USER CODE BEGIN\b/;
const END_RE = /USER CODE END\b/;
const BEGIN_LABEL_RE = /USER CODE BEGIN\s+(.+?)\s*(?:\*\/)?\s*$/;
const END_LABEL_RE = /USER CODE END\s+(.+?)\s*(?:\*\/)?\s*$/;

function isThemeColor(value) {
  return typeof value === 'string' && /^[a-zA-Z][\w.-]*$/.test(value);
}

function colorValue(value) {
  return isThemeColor(value) ? new vscode.ThemeColor(value) : value;
}

function parseUserRegions(text) {
  const lines = text.split(/\r?\n/);
  const regions = [];
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (BEGIN_RE.test(lines[i]) && open === null) {
      const match = lines[i].match(BEGIN_LABEL_RE);
      open = { markerLine: i, label: match ? match[1].trim() : `Section ${regions.length + 1}` };
    } else if (END_RE.test(lines[i]) && open !== null) {
      const endMatch = lines[i].match(END_LABEL_RE);
      const endLabel = endMatch ? endMatch[1].trim() : open.label;
      // Ignore nested or mismatched marker pairs; close only the active CubeMX section.
      if (endLabel === open.label) {
        // The marker comments themselves are generated; only their contents are editable.
        regions.push({
          start: open.markerLine + 1,
          end: i - 1,
          beginLine: open.markerLine,
          endLine: i,
          label: open.label
        });
        open = null;
      }
    }
  }
  return { lines, regions };
}

function isEditableLine(line, regions) {
  return regions.some(({ start, end }) => line >= start && line <= end);
}

class CubeMXOutlineProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(section) {
    const item = new vscode.TreeItem(`User code ${section.label}`, vscode.TreeItemCollapsibleState.None);
    item.command = {
      command: 'cubemxOutline.jumpToSection',
      title: 'Go to editable code',
      arguments: [section]
    };
    item.iconPath = new vscode.ThemeIcon('symbol-namespace');
    item.tooltip = `Jump to the editable area of ${section.label}`;
    return item;
  }

  getChildren() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !['c', 'cpp'].includes(editor.document.languageId)) return [];
    const { regions } = parseUserRegions(editor.document.getText());
    return regions.map((region) => ({
      uri: editor.document.uri,
      label: region.label,
      line: region.start
    }));
  }
}

function updateEditor(editor, generatedDecoration, userDecoration) {
  const config = vscode.workspace.getConfiguration('cubemxUserCodeGuard', editor.document);
  if (!config.get('enabled', true)) {
    editor.setDecorations(generatedDecoration, []);
    editor.setDecorations(userDecoration, []);
    return;
  }

  const { lines, regions } = parseUserRegions(editor.document.getText());
  const generated = [];
  const editable = [];
  for (let line = 0; line < lines.length; line += 1) {
    const range = new vscode.Range(line, 0, line, lines[line].length);
    (isEditableLine(line, regions) ? editable : generated).push(range);
  }
  editor.setDecorations(generatedDecoration, generated);
  editor.setDecorations(userDecoration, editable);
}

function editTouchesGenerated(oldText, change) {
  const { lines, regions } = parseUserRegions(oldText);
  const start = change.range.start.line;
  const end = Math.min(change.range.end.line, lines.length - 1);
  // A zero-width insertion still edits the containing line.
  for (let line = start; line <= end; line += 1) {
    if (!isEditableLine(line, regions)) return true;
  }
  return false;
}

function activate(context) {
  const generatedDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: colorValue(vscode.workspace.getConfiguration('cubemxUserCodeGuard').get('generatedBackground'))
  });
  const userDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: colorValue(vscode.workspace.getConfiguration('cubemxUserCodeGuard').get('userCodeBackground'))
  });
  const snapshots = new Map();
  const lastWarning = new Map();
  const outlineProvider = new CubeMXOutlineProvider();
  const outlineView = vscode.window.createTreeView('cubemxOutline', { treeDataProvider: outlineProvider });

  const refresh = (editor) => {
    if (!editor || !['c', 'cpp'].includes(editor.document.languageId)) return;
    updateEditor(editor, generatedDecoration, userDecoration);
    snapshots.set(editor.document.uri.toString(), editor.document.getText());
  };

  for (const editor of vscode.window.visibleTextEditors) refresh(editor);
  context.subscriptions.push(
    outlineView,
    outlineProvider._onDidChangeTreeData,
    vscode.commands.registerCommand('cubemxOutline.jumpToSection', async (section) => {
      const document = await vscode.workspace.openTextDocument(section.uri);
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      const targetLine = Math.min(section.line, document.lineCount - 1);
      const position = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      refresh(editor);
      outlineProvider.refresh();
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const editor = vscode.window.visibleTextEditors.find((item) => item.document === doc);
      if (editor) refresh(editor);
      else if (['c', 'cpp'].includes(doc.languageId)) snapshots.set(doc.uri.toString(), doc.getText());
    }),
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      editors.forEach(refresh);
      outlineProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cubemxUserCodeGuard')) {
        vscode.window.visibleTextEditors.forEach(refresh);
      }
    }),
    vscode.workspace.onDidChangeTextDocument(async (event) => {
      const doc = event.document;
      if (!['c', 'cpp'].includes(doc.languageId)) return;
      const key = doc.uri.toString();
      const before = snapshots.get(key) ?? doc.getText();
      const touchedGenerated = event.contentChanges.some((change) => editTouchesGenerated(before, change));
      snapshots.set(key, doc.getText());
      const editor = vscode.window.visibleTextEditors.find((item) => item.document === doc);
      if (editor) updateEditor(editor, generatedDecoration, userDecoration);
      if (editor === vscode.window.activeTextEditor) outlineProvider.refresh();
      if (!touchedGenerated || !vscode.workspace.getConfiguration('cubemxUserCodeGuard', doc).get('enabled', true)) return;

      const now = Date.now();
      const cooldown = vscode.workspace.getConfiguration('cubemxUserCodeGuard', doc).get('warningCooldownMs', 1800);
      if (now - (lastWarning.get(key) || 0) < cooldown) return;
      lastWarning.set(key, now);
      const action = await vscode.window.showWarningMessage(
        'You edited a line outside a CubeMX USER CODE region. CubeMX may overwrite this change when it regenerates code.',
        'Undo'
      );
      if (action === 'Undo') await vscode.commands.executeCommand('undo');
    }),
    { dispose: () => { generatedDecoration.dispose(); userDecoration.dispose(); } }
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
