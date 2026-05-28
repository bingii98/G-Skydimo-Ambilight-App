const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { APP_NAME } = require("./appInfo");

const WINDOWS_STARTUP_TASK_NAME = "G Skydimo Ambilight App Startup";
const STARTUP_LAUNCH_ARG = "--startup-launch";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildStartupTaskXml(exePath, args) {
  const argumentsValue = args.join(" ");

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${escapeXml(`${APP_NAME} auto-start`)}</Description>
    <URI>\\${escapeXml(WINDOWS_STARTUP_TASK_NAME)}</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT0S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>1</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(exePath)}</Command>
      <Arguments>${escapeXml(argumentsValue)}</Arguments>
    </Exec>
  </Actions>
</Task>`;
}

function runSchtasks(args) {
  try {
    execSync(`schtasks ${args}`, { stdio: "pipe", windowsHide: true });
  } catch (err) {
    const stderr = err?.stderr ? String(err.stderr).trim() : "";
    const stdout = err?.stdout ? String(err.stdout).trim() : "";
    const detail = stderr || stdout || err?.message || "schtasks failed";
    const wrapped = new Error(`schtasks failed: ${detail}`);
    wrapped.code = err?.status ?? null;
    wrapped.stderr = stderr;
    wrapped.stdout = stdout;
    throw wrapped;
  }
}

function isTaskNotFoundError(err) {
  const haystack = `${err?.stderr || ""} ${err?.stdout || ""} ${err?.message || ""}`.toLowerCase();
  return (
    haystack.includes("cannot find the file") ||
    haystack.includes("does not exist") ||
    haystack.includes("the system cannot find") ||
    haystack.includes("not exist in the system")
  );
}

function removeWindowsStartupTask() {
  try {
    runSchtasks(`/Delete /TN "${WINDOWS_STARTUP_TASK_NAME}" /F`);
  } catch (err) {
    if (isTaskNotFoundError(err)) {
      return;
    }
    throw err;
  }
}

function queryWindowsStartupTask() {
  if (process.platform !== "win32") {
    return { exists: false };
  }
  try {
    execSync(`schtasks /Query /TN "${WINDOWS_STARTUP_TASK_NAME}"`, {
      stdio: "pipe",
      windowsHide: true,
    });
    return { exists: true };
  } catch {
    return { exists: false };
  }
}

function registerWindowsStartupTask(exePath, extraArgs = []) {
  const args = [STARTUP_LAUNCH_ARG, ...extraArgs];
  const tempPath = path.join(os.tmpdir(), "gskydimo-startup-task.xml");
  const xml = buildStartupTaskXml(exePath, args);
  fs.writeFileSync(tempPath, Buffer.from(`\ufeff${xml}`, "utf16le"));

  try {
    removeWindowsStartupTask();
    runSchtasks(`/Create /TN "${WINDOWS_STARTUP_TASK_NAME}" /XML "${tempPath}" /F`);
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore temp cleanup errors.
    }
  }
}

function applyWindowsStartupRegistration({ enabled, exePath, startInTrayArg }) {
  removeWindowsStartupTask();

  if (!enabled) {
    return;
  }

  const extraArgs = startInTrayArg ? [startInTrayArg] : [];
  registerWindowsStartupTask(exePath, extraArgs);
}

function applyStartupProcessPriority() {
  if (process.platform !== "win32") {
    return;
  }

  if (!process.argv.includes(STARTUP_LAUNCH_ARG)) {
    return;
  }

  try {
    if (typeof process.setPriority === "function") {
      process.setPriority("above normal");
      return;
    }

    if (os.setPriority && os.constants?.priority?.PRIORITY_ABOVE_NORMAL) {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
    }
  } catch {
    // Best effort only — some environments restrict priority changes.
  }
}

module.exports = {
  STARTUP_LAUNCH_ARG,
  WINDOWS_STARTUP_TASK_NAME,
  applyStartupProcessPriority,
  applyWindowsStartupRegistration,
  removeWindowsStartupTask,
  queryWindowsStartupTask,
};
