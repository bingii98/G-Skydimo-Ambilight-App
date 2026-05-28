import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconHandClick,
  IconPlayerPlay,
  IconRotate2,
  IconRotateClockwise,
} from "@tabler/icons-react";

const STEP_DIRECTION = "direction";
const STEP_EDGE = "edge";
const STEP_LENGTH = "length";

const AUTO_ADVANCE_MS = 4200;

function TourDemo({ variant, edge = "top" }) {
  if (variant === "connect") {
    return (
      <div className="calib-tour-demo calib-tour-demo--connect" aria-hidden>
        <span className="calib-tour-demo__plug" />
        <span className="calib-tour-demo__cable" />
        <span className="calib-tour-demo__device">USB</span>
      </div>
    );
  }

  if (variant === "chase") {
    return (
      <div className="calib-tour-demo calib-tour-demo--chase" aria-hidden>
        <div className="calib-tour-demo__frame">
          <span className="calib-tour-demo__dot" />
        </div>
        <span className="calib-tour-demo__caption">Moving light</span>
      </div>
    );
  }

  if (variant === "direction-pick") {
    return (
      <div className="calib-tour-demo calib-tour-demo--direction-pick" aria-hidden>
        <div className="calib-tour-demo__frame">
          <span className="calib-tour-demo__dot calib-tour-demo__dot--guided" />
        </div>
        <div className="calib-tour-demo__direction-grid">
          <span className="calib-tour-demo__direction-choice calib-tour-demo__direction-choice--cw">
            <IconRotateClockwise size={14} stroke={1.75} />
            <span>Clockwise</span>
          </span>
          <span className="calib-tour-demo__direction-choice calib-tour-demo__direction-choice--ccw">
            <IconRotate2 size={14} stroke={1.75} />
            <span>Counter-clockwise</span>
          </span>
          <span className="calib-tour-demo__direction-cursor">
            <IconHandClick size={14} stroke={1.75} />
          </span>
        </div>
        <span className="calib-tour-demo__caption">Match the chase direction</span>
      </div>
    );
  }

  if (variant === "edge-glow") {
    return (
      <div className={`calib-tour-demo calib-tour-demo--edge-glow calib-tour-demo--edge-${edge}`} aria-hidden>
        <div className="calib-tour-demo__frame">
          <span className="calib-tour-demo__edge calib-tour-demo__edge--top" />
          <span className="calib-tour-demo__edge calib-tour-demo__edge--right" />
          <span className="calib-tour-demo__edge calib-tour-demo__edge--bottom" />
          <span className="calib-tour-demo__edge calib-tour-demo__edge--left" />
        </div>
        <span className="calib-tour-demo__caption">Lit edge on desk</span>
      </div>
    );
  }

  if (variant === "edge-tap") {
    return (
      <div className="calib-tour-demo calib-tour-demo--edge-tap" aria-hidden>
        <div className="calib-tour-demo__frame">
          <span className="calib-tour-demo__tap-edge" />
          <span className="calib-tour-demo__cursor">
            <IconHandClick size={16} stroke={1.75} />
          </span>
        </div>
        <span className="calib-tour-demo__caption">Tap matching edge</span>
      </div>
    );
  }

  if (variant === "length") {
    return (
      <div className="calib-tour-demo calib-tour-demo--length" aria-hidden>
        <div className="calib-tour-demo__length-card calib-tour-demo__length-card--short">
          <span className="calib-tour-demo__length-bar" />
          <span>Short (N)</span>
        </div>
        <div className="calib-tour-demo__length-card calib-tour-demo__length-card--long">
          <span className="calib-tour-demo__length-bar" />
          <span>Long (D)</span>
        </div>
      </div>
    );
  }

  return null;
}

function buildTourBeats(
  wizardStep,
  { connected, chaseRunning, hoverZoneLabel, hoverZoneId, startEdgeLabel }
) {
  if (wizardStep === STEP_DIRECTION) {
    if (!connected) {
      return [
        {
          id: "connect",
          target: null,
          title: "Connect first",
          body: "Plug in Skydimo via USB and wait until the device shows as connected.",
          demo: "connect",
        },
      ];
    }

    if (chaseRunning) {
      return [
        {
          id: "watch",
          target: "direction-choices",
          title: "Follow the moving light",
          body: "Watch which way the chase travels along your strip.",
          demo: "chase",
        },
        {
          id: "match",
          target: "direction-choices",
          title: "Pick the same direction",
          body: "Tap Clockwise or Counter-clockwise to match what you see on your desk.",
          demo: "direction-pick",
        },
      ];
    }

    return [
      {
        id: "run-chase",
        target: "direction-action",
        title: "Start the chase",
        body: 'Tap "Run chase again" so the LEDs animate along the strip.',
        demo: "chase",
      },
      {
        id: "pick-direction",
        target: "direction-choices",
        title: "Then pick a direction",
        body: "Watch which way the light travels, then tap the matching button below.",
        demo: "direction-pick",
      },
    ];
  }

  if (wizardStep === STEP_EDGE) {
    const edge = hoverZoneId || "top";
    return [
      {
        id: "find-edge",
        target: "edge-diagram",
        title: "Find the lit edge",
        body: "Look at your desk — one edge of the strip should be highlighted (LED 1 / start).",
        demo: "edge-glow",
        edge,
      },
      {
        id: "tap-edge",
        target: "edge-diagram",
        title: "Tap it on the frame",
        body: hoverZoneLabel
          ? `If ${hoverZoneLabel} is lit on your monitor, tap ${hoverZoneLabel} on the diagram below.`
          : "Tap Top, Right, Bottom, or Left to match the lit edge on your frame.",
        demo: "edge-tap",
        edge,
      },
    ];
  }

  if (wizardStep === STEP_LENGTH) {
    const edgeLabel = startEdgeLabel || "Lit edge";

    return [
      {
        id: "compare",
        target: "length-choices",
        title: "Compare to your frame",
        body: `Is the ${edgeLabel} edge the narrow or wide side of your monitor?`,
        demo: "length",
      },
      {
        id: "choose-length",
        target: "length-choices",
        title: "Choose Short or Long",
        body: "Short (N) = narrow side · Long (D) = wide side. Calibration saves when you pick one.",
        demo: "length",
      },
    ];
  }

  return [];
}

export function CalibrationStepTour({
  wizardStep,
  connected,
  chaseRunning,
  hoverZoneLabel,
  hoverZoneId,
  startEdgeLabel,
  onSpotlight,
}) {
  const beats = useMemo(
    () =>
      buildTourBeats(wizardStep, {
        connected,
        chaseRunning,
        hoverZoneLabel,
        hoverZoneId,
        startEdgeLabel,
      }),
    [wizardStep, connected, chaseRunning, hoverZoneLabel, hoverZoneId, startEdgeLabel]
  );

  const [beatIndex, setBeatIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const beat = beats[beatIndex] ?? beats[0] ?? null;
  const beatCount = beats.length;

  useEffect(() => {
    setBeatIndex(0);
  }, [wizardStep, beatCount]);

  useEffect(() => {
    onSpotlight?.(beat?.target ?? null);
  }, [beat?.target, onSpotlight]);

  useEffect(() => {
    if (!beat || beatCount <= 1 || paused) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setBeatIndex((current) => (current + 1) % beatCount);
    }, AUTO_ADVANCE_MS);

    return () => window.clearTimeout(timer);
  }, [beat, beatCount, beatIndex, paused]);

  const goPrev = useCallback(() => {
    setBeatIndex((current) => (current - 1 + beatCount) % beatCount);
  }, [beatCount]);

  const goNext = useCallback(() => {
    setBeatIndex((current) => (current + 1) % beatCount);
  }, [beatCount]);

  if (!beat) {
    return null;
  }

  return (
    <div
      className="calib-tour"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-live="polite"
    >
      <div className="calib-tour__demo-wrap">
        <TourDemo variant={beat.demo} edge={beat.edge} />
      </div>

      <div className="calib-tour__copy">
        <Text size="xs" fw={700} className="calib-tour__title">
          {beat.title}
        </Text>
        <Text size="xs" c="dimmed" lh={1.45} className="calib-tour__body">
          {beat.body}
        </Text>
      </div>

      <div className="calib-tour__footer">
        <div className="calib-tour__dots" role="tablist" aria-label="Tour steps">
          {beats.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className={`calib-tour__dot ${index === beatIndex ? "calib-tour__dot--active" : ""}`}
              aria-selected={index === beatIndex}
              aria-label={`Tip ${index + 1}: ${item.title}`}
              onClick={() => setBeatIndex(index)}
            />
          ))}
        </div>

        {beatCount > 1 ? (
          <div className="calib-tour__nav">
            <button type="button" className="calib-tour__nav-btn" onClick={goPrev} aria-label="Previous tip">
              <IconArrowLeft size={14} stroke={1.75} />
            </button>
            <button type="button" className="calib-tour__nav-btn" onClick={goNext} aria-label="Next tip">
              <IconArrowRight size={14} stroke={1.75} />
            </button>
          </div>
        ) : (
          <span className="calib-tour__auto" aria-hidden>
            <IconPlayerPlay size={12} stroke={1.75} />
          </span>
        )}
      </div>
    </div>
  );
}

export function calibTourSpotlightClass(target, spotlight) {
  return target && spotlight === target ? "calib-tour-spotlight" : "";
}
