import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Text, Tooltip } from "@mantine/core";
import {
  IconArrowBackUp,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBolt,
  IconCompass,
  IconHandClick,
  IconRotate2,
  IconRotateClockwise,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import { LedLayoutDiagram } from "./LedLayoutDiagram";
import { getLogicalZoneForLedIndex } from "../lib/ledLayout";
import {
  inferOrientationFromCalibration,
} from "../lib/calibrationInfer";
import {
  formatStripCountsSummary,
  getDiagramLayout,
  getLayoutSource,
  getProfileExpectedZeroZone,
  getProfileStripCounts,
  getProfileWirePath,
  inferZoneRotation,
} from "../lib/zoneLayout";
import { toastOrientationCalibrated, toastOrientationInferFailed } from "../lib/appToast";

const ZONE_LABELS = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

const STEP_PROFILE = "profile";
const STEP_DIRECTION = "direction";
const STEP_EDGE = "edge";
const STEP_LENGTH = "length";
const STEP_DONE = "done";

const WIZARD_STEPS = [
  { id: STEP_DIRECTION, label: "Direction" },
  { id: STEP_EDGE, label: "Edge" },
  { id: STEP_LENGTH, label: "Length" },
];

export function OrientationConfig({
  settings,
  ledCount,
  deviceModel,
  zoneRotation,
  connected,
  onSettingsChange,
  onTestZones,
  onFlashZone,
  onRunCalibrationChase,
  onAbortCalibrationPlayback,
  onCalibrationLock,
  onRestoreAfterCalibrate,
}) {
  const [flashing, setFlashing] = useState(false);
  const [chaseRunning, setChaseRunning] = useState(false);
  const [zoneTestActive, setZoneTestActive] = useState(null);
  const [zoneTestIndices, setZoneTestIndices] = useState(null);
  const [testingZones, setTestingZones] = useState(false);
  const chaseRunIdRef = useRef(0);
  const [hoverZone, setHoverZone] = useState(null);
  const [calibDraft, setCalibDraft] = useState({
    direction: null,
    startEdge: null,
    edgeLength: null,
  });

  const orientationConfirmed = Boolean(settings?.orientationConfirmed);
  const layoutSource = getLayoutSource(settings, deviceModel, ledCount);

  const profileWirePath = useMemo(
    () => getProfileWirePath(deviceModel, ledCount),
    [deviceModel, ledCount]
  );
  const profileCounts = useMemo(
    () => getProfileStripCounts(deviceModel, ledCount),
    [deviceModel, ledCount]
  );
  const hasProfile = Boolean(profileWirePath && profileCounts);
  const profileExpectedZone = useMemo(
    () => getProfileExpectedZeroZone(deviceModel, ledCount),
    [deviceModel, ledCount]
  );

  /** Zone containing LED 1 on the wire path (before map rotation). */
  const wireZeroZone = useMemo(
    () => getLogicalZoneForLedIndex(deviceModel, ledCount, 0, settings, 0),
    [deviceModel, ledCount, settings]
  );

  const resolveInitialStep = useCallback(() => {
    if (orientationConfirmed) return STEP_DONE;
    if (hasProfile) return STEP_PROFILE;
    return STEP_DIRECTION;
  }, [orientationConfirmed, hasProfile]);

  const [wizardStep, setWizardStep] = useState(resolveInitialStep);

  useEffect(() => {
    setWizardStep(resolveInitialStep());
  }, [resolveInitialStep]);

  useEffect(() => {
    if (!onCalibrationLock) return;
    const locked =
      wizardStep === STEP_DIRECTION ||
      wizardStep === STEP_EDGE ||
      wizardStep === STEP_LENGTH;
    onCalibrationLock(locked);
  }, [wizardStep, onCalibrationLock]);

  const finishCalibrate = useCallback(async () => {
    if (onRestoreAfterCalibrate) {
      await onRestoreAfterCalibrate();
    }
  }, [onRestoreAfterCalibrate]);

  const runChase = useCallback(async () => {
    if (!connected || !onRunCalibrationChase || chaseRunning) return false;
    const runId = chaseRunIdRef.current + 1;
    chaseRunIdRef.current = runId;
    setChaseRunning(true);
    try {
      const ok = await onRunCalibrationChase({
        cycles: 2,
        tailLength: 3,
      });
      return ok !== false;
    } finally {
      if (chaseRunIdRef.current === runId) {
        setChaseRunning(false);
      }
    }
  }, [connected, onRunCalibrationChase, chaseRunning]);

  const flashStartEdge = useCallback(async () => {
    if (!connected || !onFlashZone || flashing) return false;
    setFlashing(true);
    try {
      const ok = await onFlashZone(null, {
        logicalReference: true,
        persist: true,
        startEdgeOnly: true,
      });
      return ok !== false;
    } finally {
      setFlashing(false);
    }
  }, [connected, onFlashZone, flashing]);

  useEffect(() => {
    if (
      (wizardStep !== STEP_EDGE && wizardStep !== STEP_LENGTH) ||
      !connected ||
      !onFlashZone
    ) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setFlashing(true);
      try {
        await onFlashZone(null, {
          logicalReference: true,
          persist: true,
          startEdgeOnly: true,
        });
      } finally {
        if (!cancelled) setFlashing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wizardStep, connected, onFlashZone]);

  const acceptProfile = useCallback(() => {
    if (!profileWirePath || !profileCounts) return;
    onSettingsChange({
      zoneRotation: 0,
      orientationConfirmed: true,
      stripCounts: profileCounts,
      stripOrigin: profileWirePath.origin,
      stripDirection: profileWirePath.direction,
    });
    toastOrientationCalibrated(0);
    setWizardStep(STEP_DONE);
  }, [profileWirePath, profileCounts, onSettingsChange]);

  const skipToCalibrate = useCallback(() => {
    setCalibDraft({ direction: null, startEdge: null, edgeLength: null });
    setWizardStep(STEP_DIRECTION);
    void runChase();
  }, [runChase]);

  const handleDirectionPick = useCallback(
    (direction) => {
      chaseRunIdRef.current += 1;
      onAbortCalibrationPlayback?.();
      setChaseRunning(false);
      onCalibrationLock?.(true);
      setCalibDraft((prev) => ({ ...prev, direction }));
      onSettingsChange({ stripDirection: direction });
      setWizardStep(STEP_EDGE);
    },
    [onSettingsChange, onCalibrationLock, onAbortCalibrationPlayback]
  );

  const handleEdgePick = useCallback(
    (zoneId) => {
      if (!connected || wizardStep !== STEP_EDGE) return;
      setCalibDraft((prev) => ({ ...prev, startEdge: zoneId }));
      setWizardStep(STEP_LENGTH);
    },
    [connected, wizardStep]
  );

  const handleLengthPick = useCallback(
    async (edgeLength) => {
      if (wizardStep !== STEP_LENGTH) return;

      const nextDraft = { ...calibDraft, edgeLength };
      setCalibDraft(nextDraft);

      if (!nextDraft.direction || !nextDraft.startEdge) return;

      const patch = inferOrientationFromCalibration(
        {
          direction: nextDraft.direction,
          startEdge: nextDraft.startEdge,
          edgeLength,
        },
        deviceModel,
        ledCount,
        settings
      );

      if (!patch) {
        toastOrientationInferFailed();
        return;
      }

      onSettingsChange(patch);
      toastOrientationCalibrated(patch.zoneRotation ?? 0);
      setWizardStep(STEP_DONE);
      await finishCalibrate();
    },
    [wizardStep, calibDraft, deviceModel, ledCount, settings, onSettingsChange, finishCalibrate]
  );

  const handleInspectEdge = useCallback(
    async (zoneId) => {
      if (!connected || wizardStep !== STEP_DONE || !onFlashZone || flashing) return;
      const diagram = getDiagramLayout(settings, deviceModel, ledCount, zoneRotation);
      const zone = diagram?.zones?.find((item) => item.id === zoneId);
      setFlashing(true);
      setZoneTestActive(zoneId);
      setZoneTestIndices(zone?.indices ?? null);
      try {
        await onFlashZone(zoneId);
      } finally {
        setZoneTestActive(null);
        setZoneTestIndices(null);
        setFlashing(false);
      }
    },
    [connected, wizardStep, onFlashZone, flashing, settings, deviceModel, ledCount, zoneRotation]
  );

  const handleTestAllZones = useCallback(async () => {
    if (!connected || !onTestZones || testingZones) return;
    setTestingZones(true);
    setZoneTestActive(null);
    setZoneTestIndices(null);
    try {
      await onTestZones({
        onZoneFlash: (zone) => {
          setZoneTestActive(zone?.wireSide ?? zone?.id ?? null);
          setZoneTestIndices(zone?.indices ?? null);
        },
        onComplete: () => {
          setZoneTestActive(null);
          setZoneTestIndices(null);
        },
      });
    } finally {
      setTestingZones(false);
      setZoneTestActive(null);
      setZoneTestIndices(null);
    }
  }, [connected, onTestZones, testingZones]);

  const handleRecalibrate = () => {
    onSettingsChange({ orientationConfirmed: false });
    setCalibDraft({ direction: null, startEdge: null, edgeLength: null });
    if (hasProfile) {
      setWizardStep(STEP_PROFILE);
    } else {
      setWizardStep(STEP_DIRECTION);
      void runChase();
    }
  };

  const stepIndex = useMemo(() => {
    if (wizardStep === STEP_DIRECTION) return 0;
    if (wizardStep === STEP_EDGE) return 1;
    if (wizardStep === STEP_LENGTH) return 2;
    return WIZARD_STEPS.length;
  }, [wizardStep]);

  const showWizard =
    wizardStep === STEP_DIRECTION || wizardStep === STEP_EDGE || wizardStep === STEP_LENGTH;

  const previewHoverRotation =
    wizardStep === STEP_EDGE && hoverZone && hoverZone !== wireZeroZone
      ? inferZoneRotation(wireZeroZone, hoverZone)
      : null;

  const hint = useMemo(() => {
    if (wizardStep === STEP_DIRECTION) {
      return {
        message: chaseRunning
          ? "Follow the moving light — pick its direction."
          : connected
            ? "Pick the direction you see on your desk."
            : "Connect your device to start.",
        color: chaseRunning ? "teal" : "dimmed",
        fw: chaseRunning ? 600 : undefined,
      };
    }

    if (wizardStep === STEP_EDGE) {
      if (hoverZone) {
        return {
          message: `Tap ${ZONE_LABELS[hoverZone]} if that edge is lit.`,
          color: "teal",
          fw: 600,
        };
      }

      return {
        message: "Tap the lit edge on the frame.",
        color: "teal",
        fw: 600,
      };
    }

    if (wizardStep === STEP_LENGTH) {
      return {
        message: "Is the lit edge short (N) or long (D)?",
        color: "teal",
        fw: 600,
      };
    }

    return null;
  }, [wizardStep, chaseRunning, connected, hoverZone]);

  const travelDirection = settings?.stripDirection === "ccw" ? "ccw" : "cw";
  const TravelDirectionIcon = travelDirection === "ccw" ? IconRotate2 : IconRotateClockwise;

  return (
    <div
      className={[
        "zone-calibration",
        wizardStep === STEP_DONE ? "zone-calibration--ready" : "",
        showWizard ? "zone-calibration--wizard" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="zone-calibration__header">
        <Text size="xs" fw={700} className="zone-calibration__title">
          <IconCompass size={13} stroke={1.75} aria-hidden />
          Orientation
        </Text>
        <div className="zone-calibration__header-meta">
          {wizardStep === STEP_DONE ? (
            <Tooltip
              label={travelDirection === "ccw" ? "Counter-clockwise" : "Clockwise"}
              openDelay={300}
            >
              <span className="zone-calibration__dir-badge" aria-label="Strip direction">
                <TravelDirectionIcon size={12} stroke={1.85} aria-hidden />
              </span>
            </Tooltip>
          ) : null}
          {layoutSource === "custom" ? (
            <span className="zone-calibration__badge">Custom</span>
          ) : null}
        </div>
      </div>

      {showWizard ? (
        <div className="zone-calibration__wizard-progress" aria-label="Orientation setup steps">
          <Text size="xs" c="dimmed" className="zone-calibration__wizard-progress-label">
            Step {stepIndex + 1}/{WIZARD_STEPS.length} · {WIZARD_STEPS[stepIndex]?.label}
          </Text>
          <div className="zone-calibration__wizard-bar" aria-hidden>
            {WIZARD_STEPS.map((step, index) => (
              <span
                key={step.id}
                className={[
                  "zone-calibration__wizard-bar-segment",
                  index <= stepIndex ? "zone-calibration__wizard-bar-segment--filled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
          </div>
        </div>
      ) : null}

      {wizardStep === STEP_PROFILE ? (
        <ProfileSuggestCard
          counts={profileCounts}
          expectedZone={profileExpectedZone}
          onAccept={acceptProfile}
          onCalibrate={skipToCalibrate}
          connected={connected}
        />
      ) : null}

      {hint ? (
        <div
          className={[
            "zone-calibration__hint",
            hint.color === "teal" ? "zone-calibration__hint--active" : "zone-calibration__hint--muted",
          ].join(" ")}
          aria-live="polite"
        >
          <Text
            size="xs"
            c={hint.color === "teal" ? undefined : "dimmed"}
            fw={hint.fw}
            lh={1.45}
            className="zone-calibration__hint-text"
          >
            {hint.message}
          </Text>
        </div>
      ) : null}

      {wizardStep === STEP_EDGE ? (
        <LedLayoutDiagram
          settings={settings}
          ledCount={ledCount}
          deviceModel={deviceModel}
          zoneRotation={0}
          mode="pick"
          hoverZone={hoverZone}
          onZonePick={handleEdgePick}
          onZoneHover={setHoverZone}
          pickPreviewRotation={previewHoverRotation}
          showDots={false}
          showCounts={false}
          showLegend={false}
          compact
        />
      ) : null}

      {wizardStep === STEP_LENGTH && calibDraft.startEdge ? (
        <LedLayoutDiagram
          settings={settings}
          ledCount={ledCount}
          deviceModel={deviceModel}
          zoneRotation={0}
          mode="pick"
          litZone={calibDraft.startEdge}
          showDots={false}
          showCounts
          showLegend={false}
          compact
        />
      ) : null}

      {wizardStep === STEP_DONE ? (
        <LedLayoutDiagram
          settings={settings}
          ledCount={ledCount}
          deviceModel={deviceModel}
          zoneRotation={zoneRotation}
          mode="inspect"
          activeZone={zoneTestActive}
          litZone={zoneTestActive}
          highlightLedIndices={zoneTestIndices}
          hoverZone={hoverZone}
          onZonePreview={handleInspectEdge}
          onZoneHover={setHoverZone}
          showDots
          showCounts
          showLegend={false}
          compact
        />
      ) : null}

      {wizardStep === STEP_DIRECTION ? (
        <div className="zone-calibration__choice-grid zone-calibration__choice-grid--2" role="group" aria-label="Pick travel direction">
          <ChoiceCard
            label="Clockwise"
            icon={IconRotateClockwise}
            active={calibDraft.direction === "cw"}
            disabled={!connected}
            onClick={() => handleDirectionPick("cw")}
          />
          <ChoiceCard
            label="Counter-clockwise"
            icon={IconRotate2}
            active={calibDraft.direction === "ccw"}
            disabled={!connected}
            onClick={() => handleDirectionPick("ccw")}
          />
        </div>
      ) : null}

      {wizardStep === STEP_LENGTH ? (
        <div
          className="zone-calibration__choice-grid zone-calibration__choice-grid--2"
          role="group"
          aria-label="Pick whether the lit edge is the shorter or longer side of your frame"
        >
          <ChoiceCard
            label="Short (N)"
            icon={IconArrowsMinimize}
            active={calibDraft.edgeLength === "short"}
            disabled={flashing}
            onClick={() => void handleLengthPick("short")}
          />
          <ChoiceCard
            label="Long (D)"
            icon={IconArrowsMaximize}
            active={calibDraft.edgeLength === "long"}
            disabled={flashing}
            onClick={() => void handleLengthPick("long")}
          />
        </div>
      ) : null}

      <div className="zone-calibration__actions">
        {wizardStep === STEP_DIRECTION ? (
          <Button
            variant="filled"
            color="teal"
            size="compact-sm"
            leftSection={<IconHandClick size={14} />}
            onClick={() => void runChase()}
            disabled={!connected || chaseRunning}
            loading={chaseRunning}
          >
            Run chase again
          </Button>
        ) : null}

        {wizardStep === STEP_EDGE ? (
          <>
            <Button
              variant="light"
              color="teal"
              size="compact-sm"
              leftSection={<IconBolt size={14} />}
              onClick={() => void flashStartEdge()}
              disabled={!connected || flashing}
              loading={flashing}
            >
              Flash edge again
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={<IconArrowBackUp size={14} />}
              onClick={() => {
                void finishCalibrate();
                setWizardStep(STEP_DIRECTION);
              }}
            >
              Back
            </Button>
          </>
        ) : null}

        {wizardStep === STEP_LENGTH ? (
          <>
            <Button
              variant="light"
              color="teal"
              size="compact-sm"
              leftSection={<IconBolt size={14} />}
              onClick={() => void flashStartEdge()}
              disabled={!connected || flashing}
              loading={flashing}
            >
              Flash edge again
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={<IconArrowBackUp size={14} />}
              onClick={() => setWizardStep(STEP_EDGE)}
            >
              Back
            </Button>
          </>
        ) : null}

        {wizardStep === STEP_DONE ? (
          <>
            <Tooltip label="Flash all four edges in order" openDelay={300}>
              <Button
                variant="light"
                color="teal"
                size="compact-sm"
                leftSection={<IconBolt size={14} />}
                onClick={() => void handleTestAllZones()}
                disabled={!connected || flashing || testingZones}
                loading={testingZones}
              >
                Test all
              </Button>
            </Tooltip>
            <Button variant="subtle" color="gray" size="compact-sm" onClick={handleRecalibrate}>
              Recalibrate
            </Button>
          </>
        ) : null}

        {wizardStep === STEP_DIRECTION && hasProfile ? (
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<IconArrowBackUp size={14} />}
            onClick={() => setWizardStep(STEP_PROFILE)}
          >
            Back
          </Button>
        ) : null}
      </div>

    </div>
  );
}

function ChoiceCard({ label, icon: Icon, active, recommended, disabled, onClick }) {
  return (
    <button
      type="button"
      className={[
        "zone-calibration__choice-card",
        active ? "zone-calibration__choice-card--active" : "",
        recommended ? "zone-calibration__choice-card--recommended" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="zone-calibration__choice-icon" aria-hidden>
        <Icon size={18} stroke={1.75} />
      </span>
      <span className="zone-calibration__choice-label">{label}</span>
    </button>
  );
}

function ProfileSuggestCard({ counts, expectedZone, onAccept, onCalibrate, connected }) {
  return (
    <div className="zone-calibration__profile-card">
      <div className="zone-calibration__profile-head">
        <span className="zone-calibration__profile-icon" aria-hidden>
          <IconWand size={16} stroke={1.75} />
        </span>
        <div className="zone-calibration__profile-text">
          <Text size="xs" fw={700} className="zone-calibration__profile-title">
            Known layout
          </Text>
          {counts ? (
            <Text size="xs" c="dimmed" lh={1.4}>
              {formatStripCountsSummary(counts)}
            </Text>
          ) : null}
        </div>
      </div>

      {expectedZone ? (
        <div className="zone-calibration__profile-hint">
          <span className="zone-calibration__profile-pill">
            LED 1 → {ZONE_LABELS[expectedZone]}
          </span>
        </div>
      ) : null}

      <div className="zone-calibration__profile-actions">
        <Button
          variant="filled"
          color="teal"
          size="compact-sm"
          leftSection={<IconSparkles size={14} />}
          onClick={onAccept}
          disabled={!connected}
        >
          Use this layout
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          leftSection={<IconHandClick size={14} />}
          onClick={onCalibrate}
        >
          Calibrate manually
        </Button>
      </div>
    </div>
  );
}
