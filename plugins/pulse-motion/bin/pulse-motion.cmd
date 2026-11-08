@echo off
rem pulse-motion – relais pour l'invite de commandes Windows. Node absent : message en français, code 1.
setlocal
set "PM_NODE="
for %%X in (node.exe) do set "PM_NODE=%%~$PATH:X"
if not defined PM_NODE (
  echo Node.js introuvable : « node » n'est pas installé.
  exit /b 1
)
endlocal & node "%~dp0..\scripts\pm.js" %*
