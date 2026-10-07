@echo off
setlocal

cd /d "%~dp0"

if not exist package.json (
    echo ERROR: package.json was not found. Run this script from the extension source folder.
    exit /b 1
)

where npx >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js and npm are required. Install Node.js, then run this script again.
    exit /b 1
)

echo Packaging the VS Code extension...
call npx --yes @vscode/vsce package
if errorlevel 1 (
    echo.
    echo ERROR: VSIX packaging failed. Check the messages above.
    exit /b 1
)

echo.
echo VSIX created in the current folder.
exit /b 0
