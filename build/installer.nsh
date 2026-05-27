!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install G Skydimo Ambilight App"
  !define MUI_WELCOMEPAGE_TEXT "This setup will install G Skydimo Ambilight App on your computer.$\r$\n$\r$\nWhat you get:$\r$\n  • Real-time screen ambilight$\r$\n  • Solid colors, gradients, and animations$\r$\n  • USB auto-connect for Skydimo LED strips$\r$\n  • Zone calibration and system tray support$\r$\n$\r$\nBefore connecting your strip, close the official SkyDimo.exe app — it locks the COM port.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_FINISHPAGE_RUN_TEXT "Launch G Skydimo Ambilight App"
  !endif

  !define MUI_FINISHPAGE_TITLE "Installation Complete"
  !define MUI_FINISHPAGE_TEXT "G Skydimo Ambilight App has been installed successfully.$\r$\n$\r$\nNext steps:$\r$\n  1. Connect your Skydimo LED strip via USB$\r$\n  2. Make sure SkyDimo.exe is closed$\r$\n  3. Open the app and click Scan$\r$\n$\r$\nClick Finish to close this wizard."
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Uninstall G Skydimo Ambilight App"
  !define MUI_UNWELCOMEPAGE_TEXT "This will remove G Skydimo Ambilight App and its Start Menu / Desktop shortcuts from your computer.$\r$\n$\r$\nYour saved settings inside the app may remain until you delete app data manually.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
