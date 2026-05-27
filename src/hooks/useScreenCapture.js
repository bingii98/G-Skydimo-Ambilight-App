import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCaptureCanvasSize } from "../lib/screenSync";
import { skydimo } from "../lib/skydimoApi";

const MAX_CAPTURE_EDGE = 1920;

function stopStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function resolveSourceDimensions(source) {
  const nativeWidth = Math.max(1, Math.round(Number(source?.nativeWidth) || 0));
  const nativeHeight = Math.max(1, Math.round(Number(source?.nativeHeight) || 0));
  const logicalWidth = Math.max(1, Math.round(Number(source?.width) || 0));
  const logicalHeight = Math.max(1, Math.round(Number(source?.height) || 0));

  return {
    screenWidth: nativeWidth || logicalWidth || 1920,
    screenHeight: nativeHeight || logicalHeight || 1080,
  };
}

async function startDesktopStream(sourceId, screenWidth, screenHeight) {
  const width = Math.max(1, Math.round(screenWidth || 1920));
  const height = Math.max(1, Math.round(screenHeight || 1080));

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        minWidth: width,
        maxWidth: width,
        minHeight: height,
        maxHeight: height,
      },
    },
  };

  return navigator.mediaDevices.getUserMedia(constraints);
}

export function useScreenCapture({ enabled, sourceId }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const activeSourceRef = useRef(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [sources, setSources] = useState([]);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      setError(null);
      activeSourceRef.current = null;
      canvasSizeRef.current = { width: 0, height: 0 };
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return undefined;
    }

    let cancelled = false;

    async function boot() {
      try {
        const listed = await skydimo.listScreenSources();
        if (cancelled) return;
        setSources(listed);

        const chosenSource =
          listed.find((source) => source.id === sourceId) ||
          listed.find((source) => source.isPrimary) ||
          listed[0];

        if (!chosenSource?.id) {
          setError("No screen source available");
          setReady(false);
          return;
        }

        const { screenWidth, screenHeight } = resolveSourceDimensions(chosenSource);
        activeSourceRef.current = {
          ...chosenSource,
          screenWidth,
          screenHeight,
        };

        stopStream(streamRef.current);
        const stream = await startDesktopStream(chosenSource.id, screenWidth, screenHeight);
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopStream(stream);
          return;
        }

        video.srcObject = stream;
        await video.play();

        if (video.videoWidth > 0 && video.videoHeight > 0) {
          activeSourceRef.current = {
            ...activeSourceRef.current,
            screenWidth: video.videoWidth,
            screenHeight: video.videoHeight,
          };
        }

        setError(null);
        setReady(true);
      } catch (captureError) {
        if (!cancelled) {
          setReady(false);
          setError(captureError?.message || "Could not capture screen");
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      activeSourceRef.current = null;
    };
  }, [enabled, sourceId]);

  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    if (!videoRef.current) {
      videoRef.current = document.createElement("video");
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
    }
  }, []);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const activeSource = activeSourceRef.current;
    if (!ready || !video || !canvas || video.readyState < 2) {
      return null;
    }

    const screenWidth =
      video.videoWidth ||
      activeSource?.screenWidth ||
      activeSource?.nativeWidth ||
      activeSource?.width ||
      1920;
    const screenHeight =
      video.videoHeight ||
      activeSource?.screenHeight ||
      activeSource?.nativeHeight ||
      activeSource?.height ||
      1080;

    const { width: targetWidth, height: targetHeight } = resolveCaptureCanvasSize(
      screenWidth,
      screenHeight,
      MAX_CAPTURE_EDGE
    );

    if (
      canvasSizeRef.current.width !== targetWidth ||
      canvasSizeRef.current.height !== targetHeight
    ) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvasSizeRef.current = { width: targetWidth, height: targetHeight };
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return null;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight);
  }, [ready]);

  return {
    ready,
    error,
    sources,
    captureFrame,
  };
}
