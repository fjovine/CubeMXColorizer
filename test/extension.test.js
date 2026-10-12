const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const vscode = {
  window: {},
  workspace: { getConfiguration: () => ({ get: () => true }) },
  EventEmitter: class { constructor() { this.event = () => {}; } },
  TreeItem: class { constructor(label) { this.label = label; } },
  TreeItemCollapsibleState: { None: 0 },
  ThemeIcon: class {},
  Range: class { constructor(line) { this.line = line; } }
};
const context = vm.createContext({
  require: () => vscode,
  module: { exports: {} }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8'), context);
const { parseUserRegions, editTouchesGenerated, updateEditor, CubeMXOutlineProvider } =
  vm.runInContext('({ parseUserRegions, editTouchesGenerated, updateEditor, CubeMXOutlineProvider })', context);

function editorFor(text, languageId = 'c') {
  const decorations = new Map();
  return {
    document: { getText: () => text, languageId, uri: 'file:///source.c' },
    setDecorations: (type, ranges) => decorations.set(type, ranges),
    decorations
  };
}

test('ordinary C/C++ source and headers are undecorated and freely editable', () => {
  for (const languageId of ['c', 'cpp']) {
    const text = '#pragma once\nint value;\n';
    assert.equal(parseUserRegions(text).isCubeMX, false);
    assert.equal(editTouchesGenerated(text, { range: { start: { line: 0 }, end: { line: 2 } } }), false);
    const editor = editorFor(text, languageId);
    updateEditor(editor, 'generated', 'user');
    assert.equal(editor.decorations.get('generated').length, 0);
    assert.equal(editor.decorations.get('user').length, 0);
    vscode.window.activeTextEditor = editor;
    const provider = new CubeMXOutlineProvider();
    const children = provider.getChildren();
    assert.equal(children.length, 1);
    const item = provider.getTreeItem(children[0]);
    assert.equal(item.label, 'Not CubeMX file');
    assert.equal(item.command, undefined);
  }
});

test('CubeMX files retain generated-line protection and navigable regions', () => {
  const text = 'int generated;\n/* USER CODE BEGIN 0 */\nint editable;\n/* USER CODE END 0 */';
  assert.equal(parseUserRegions(text).isCubeMX, true);
  for (const [line, expected] of [[0, true], [1, true], [2, false], [3, true]]) {
    assert.equal(editTouchesGenerated(text, { range: { start: { line }, end: { line } } }), expected);
  }
  const editor = editorFor(text);
  updateEditor(editor, 'generated', 'user');
  assert.equal(editor.decorations.get('generated').length, 3);
  assert.equal(editor.decorations.get('user').length, 1);
  vscode.window.activeTextEditor = editor;
  const provider = new CubeMXOutlineProvider();
  assert.equal(provider.getTreeItem(provider.getChildren()[0]).command.command, 'cubemxOutline.jumpToSection');
  editor.document.getText = () => 'int ordinary;';
  updateEditor(editor, 'generated', 'user');
  assert.equal(editor.decorations.get('generated').length, 0);
  assert.equal(editor.decorations.get('user').length, 0);
});

test('unpaired CubeMX markers still identify a generated file', () => {
  for (const text of ['/* USER CODE BEGIN 0 */', '/* USER CODE END 0 */']) {
    assert.equal(parseUserRegions(text).isCubeMX, true);
    assert.equal(editTouchesGenerated(text, { range: { start: { line: 0 }, end: { line: 0 } } }), true);
  }
});
