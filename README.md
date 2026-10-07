# CubeMX User Code Guard

A small VS Code extension prototype for STM32CubeMX C/C++ files.

- Lines outside paired `USER CODE BEGIN ...` / `USER CODE END ...` markers are shaded gray.
- Lines inside those markers use the editor's normal background by default.
- Editing outside a marked region shows a warning with an **Undo** action.
- The **CubeMXOutline** view in the Explorer lists only marked blocks, for example `User code RTOS_THREADS`. Selecting one takes you to its first editable line in the active C/C++ file.

## Try it in VS Code

1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a CubeMX-generated `.c` or `.h` file in that host.
4. In the Explorer sidebar, find the **CubeMXOutline** section. If it is hidden, use **View → Open View… → CubeMXOutline**.

The extension uses plain JavaScript and the built-in VS Code API; no build step is needed.

## Build and install a VSIX on Windows

1. Run `package-vsix.bat` from this folder. It requires Node.js/npm and uses `@vscode/vsce` to package the current source.
2. In VS Code, open **Extensions → … → Install from VSIX…** and select the generated `.vsix` file.

The `.vscodeignore` file keeps the development launch configuration and packaging script out of the VSIX. If you want VS Code to recognize a packaged build as an update to an already installed version, increase the `version` field in `package.json` first.

## Settings

- `cubemxUserCodeGuard.enabled`: enable or disable highlighting and warnings.
- `cubemxUserCodeGuard.generatedBackground`: generated-line background color.
- `cubemxUserCodeGuard.userCodeBackground`: editable-line background; defaults to `editor.background` so it follows the selected theme.
- `cubemxUserCodeGuard.warningCooldownMs`: warning cooldown per file.

This is an early prototype. It recognizes the standard CubeMX marker text in C/C++ documents; it does not prevent edits or guarantee that a generated file will be preserved by CubeMX.
