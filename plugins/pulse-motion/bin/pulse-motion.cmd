@echo off
rem pulse-motion – relais pour l'invite de commandes Windows. Node.js : celui du PATH, sinon un emplacement connu (installé
rem à l'instant, avant que l'outil ne le voie : Program Files, AppData, lien de nvm-windows). PM_NODE_EMPLACEMENTS (chemins
rem séparés par « ; ») remplace la liste des emplacements connus (tests). Node absent : message en français, code 3.
setlocal
set "PM_NODE="
for %%X in (node.exe) do set "PM_NODE=%%~$PATH:X"
rem La liste est toujours définie : la ligne suivante la développe à sa lecture (une variable absente y casserait la syntaxe).
if not defined PM_NODE_EMPLACEMENTS set "PM_NODE_EMPLACEMENTS=%ProgramFiles%\nodejs\node.exe;%LOCALAPPDATA%\Programs\nodejs\node.exe;%NVM_SYMLINK%\node.exe"
if not defined PM_NODE for %%C in ("%PM_NODE_EMPLACEMENTS:;=";"%") do if not defined PM_NODE if exist "%%~C" set "PM_NODE=%%~C"
if not defined PM_NODE (
  echo Node.js introuvable : « node » n'est pas installé.
  exit /b 3
)
endlocal & "%PM_NODE%" "%~dp0..\scripts\pm.js" %*
