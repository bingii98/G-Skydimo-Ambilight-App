import { useEffect, useState } from "react";
import { ColorPicker, Popover, Text, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ensureHex, normalizeHex } from "../lib/colorUtils";

function ColorPickerPanel({ hex, hexDraft, onHexDraftChange, onCommitHexDraft, onChange }) {
  return (
    <div className="inline-color-picker inline-color-picker--popup">
      <ColorPicker
        format="hex"
        value={ensureHex(hex)}
        onChange={(value) => {
          const raw = typeof value === "string" ? value : value?.hex;
          onChange(raw);
        }}
        fullWidth
        size="lg"
        classNames={{
          wrapper: "inline-color-picker__surface",
          saturation: "inline-color-picker__saturation",
          body: "inline-color-picker__body",
          sliders: "inline-color-picker__sliders",
          slider: "inline-color-picker__slider",
          thumb: "inline-color-picker__thumb",
        }}
      />
      <TextInput
        value={hexDraft.replace(/^#/, "")}
        onChange={onHexDraftChange}
        onBlur={onCommitHexDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        leftSection={
          <Text ff="monospace" size="sm" c="dimmed" fw={600}>
            #
          </Text>
        }
        placeholder="FF8800"
        size="sm"
        radius="sm"
        classNames={{ input: "inline-color-picker__hex-input" }}
        aria-label="Hex color code"
      />
    </div>
  );
}

export function ColorPickerPopover({
  hex,
  onChange,
  ariaLabel = "Edit color",
  triggerClassName = "",
  triggerStyle,
  onOpen,
}) {
  const hexUpper = ensureHex(hex).toUpperCase();
  const [hexDraft, setHexDraft] = useState(hexUpper);
  const [opened, { open, close, toggle }] = useDisclosure(false);

  useEffect(() => {
    setHexDraft(hexUpper);
  }, [hexUpper]);

  const applyColor = (nextHex) => {
    const normalized = normalizeHex(nextHex);
    if (normalized) {
      onChange(normalized);
      setHexDraft(normalized);
    }
  };

  const handleHexDraftChange = (event) => {
    let raw = event.currentTarget.value.toUpperCase().replace(/[^0-9A-F#]/g, "");
    if (raw && !raw.startsWith("#")) {
      raw = `#${raw}`;
    }
    setHexDraft(raw.slice(0, 7));
  };

  const commitHexDraft = () => {
    const normalized = normalizeHex(hexDraft);
    if (normalized) {
      applyColor(normalized);
      return;
    }
    setHexDraft(hexUpper);
  };

  const handleToggle = (event) => {
    event.stopPropagation();
    if (!opened) {
      onOpen?.();
    }
    toggle();
  };

  return (
    <Popover
      opened={opened}
      onChange={(next) => (next ? open() : close())}
      position="bottom-start"
      width={280}
      shadow="md"
      radius="sm"
      trapFocus
      withinPortal
      floatingStrategy="fixed"
      zIndex={1100}
    >
      <Popover.Target>
        <button
          type="button"
          className={`color-swatch-trigger ${triggerClassName} ${opened ? "color-swatch-trigger--open" : ""}`.trim()}
          style={triggerStyle}
          aria-expanded={opened}
          aria-label={ariaLabel}
          onClick={handleToggle}
        />
      </Popover.Target>

      <Popover.Dropdown className="color-picker-popover" onClick={(event) => event.stopPropagation()}>
        <ColorPickerPanel
          hex={hex}
          hexDraft={hexDraft}
          onHexDraftChange={handleHexDraftChange}
          onCommitHexDraft={commitHexDraft}
          onChange={applyColor}
        />
        <button type="button" className="color-picker-popover__done" onClick={close}>
          Done
        </button>
      </Popover.Dropdown>
    </Popover>
  );
}
