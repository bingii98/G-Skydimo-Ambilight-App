import { useEffect, useId, useRef, useState } from "react";
import { Popover, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconSend, IconSparkles, IconX } from "@tabler/icons-react";

function createMessage(role, content, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ...extra,
  };
}

export function AiColorAssistant({
  label = "AI colors",
  title = "AI Color Assistant",
  contextLabel,
  disabled = false,
  disabledTitle,
  hasApiKey = false,
  loading = false,
  onSend,
  welcomeMessage,
  placeholder = "Describe the colors you want…",
  suggestions = [],
  blendLabel = "Keep edge colors",
  showBlend = false,
}) {
  const [opened, { open, close, toggle }] = useDisclosure(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(null);
  const listboxId = useId();

  const handleToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  };

  useEffect(() => {
    if (!opened) return;
    setMessages((current) => {
      if (current.length > 0) return current;
      return [
        createMessage(
          "assistant",
          welcomeMessage ||
            "Describe the palette you want and I'll apply it to your current effect."
        ),
      ];
    });
  }, [opened, welcomeMessage]);

  useEffect(() => {
    if (!opened || !messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [opened, messages, loading]);

  const triggerTitle =
    disabledTitle ||
    (disabled
      ? "Select an effect first"
      : !hasApiKey
        ? "Add OpenAI API key in Settings"
        : "Open AI color assistant");

  const pushMessage = (message) => {
    setMessages((current) => [...current, message]);
  };

  const runPrompt = async (text, options = {}) => {
    const trimmed = text.trim();
    if (!trimmed && options.mode !== "blend") return;
    if (loading || disabled) return;

    if (options.mode === "blend" && !trimmed) {
      pushMessage(createMessage("user", blendLabel));
    } else if (trimmed) {
      pushMessage(createMessage("user", trimmed));
      setDraft("");
    }

    const result = await onSend?.(trimmed, options);
    if (result?.ok) {
      pushMessage(
        createMessage("assistant", result.message || "Colors applied to your effect.")
      );
      return;
    }

    if (result?.error) {
      pushMessage(createMessage("assistant", result.error, { tone: "error" }));
    }
  };

  const submitDraft = async (event) => {
    event?.preventDefault();
    await runPrompt(draft);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitDraft(event);
    }
  };

  const handleSuggestion = (text) => {
    if (loading || disabled) return;
    setDraft(text);
  };

  return (
    <Popover
      opened={opened}
      onChange={(next) => (next ? open() : close())}
      position="bottom-end"
      offset={10}
      width={360}
      trapFocus
      withinPortal
      floatingStrategy="fixed"
      zIndex={1200}
      classNames={{ dropdown: "ai-botbox-popover" }}
    >
      <Popover.Target>
        <button
          type="button"
          className={`ai-assist-btn ${loading ? "ai-assist-btn--loading" : ""} ${opened ? "ai-assist-btn--open" : ""}`}
          disabled={loading}
          aria-label={label}
          aria-expanded={opened}
          aria-controls={opened ? listboxId : undefined}
          aria-haspopup="dialog"
          title={triggerTitle}
          onClick={handleToggle}
        >
          <span className="ai-assist-btn__icon" aria-hidden>
            {loading ? (
              <span className="ai-assist-btn__spinner" />
            ) : (
              <IconSparkles size={15} stroke={1.75} />
            )}
          </span>
          <span className="ai-assist-btn__label">{label}</span>
        </button>
      </Popover.Target>

      <Popover.Dropdown
        p={0}
        className="ai-botbox-popover"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ai-botbox" role="dialog" aria-label={title}>
          <header className="ai-botbox__header">
            <div className="ai-botbox__identity">
              <span className="ai-botbox__avatar" aria-hidden>
                <IconSparkles size={16} stroke={1.75} />
              </span>
              <div className="ai-botbox__titles">
                <Text fw={700} size="sm" className="ai-botbox__title">
                  {title}
                </Text>
                {contextLabel ? (
                  <Text size="xs" c="dimmed" className="ai-botbox__context">
                    {contextLabel}
                  </Text>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="ai-botbox__close"
              onClick={close}
              aria-label="Close assistant"
            >
              <IconX size={16} stroke={1.75} />
            </button>
          </header>

          <div
            id={listboxId}
            ref={messagesRef}
            className="ai-botbox__messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-botbox__bubble ai-botbox__bubble--${message.role} ${message.tone === "error" ? "ai-botbox__bubble--error" : ""}`}
              >
                {message.role === "assistant" ? (
                  <span className="ai-botbox__bubble-avatar" aria-hidden>
                    <IconSparkles size={12} stroke={1.75} />
                  </span>
                ) : null}
                <div className="ai-botbox__bubble-body">
                  <Text size="sm" lh={1.45}>
                    {message.content}
                  </Text>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="ai-botbox__bubble ai-botbox__bubble--assistant ai-botbox__bubble--typing">
                <span className="ai-botbox__bubble-avatar" aria-hidden>
                  <IconSparkles size={12} stroke={1.75} />
                </span>
                <div className="ai-botbox__bubble-body">
                  <span className="ai-botbox__typing" aria-label="Assistant is thinking">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {suggestions.length > 0 ? (
            <div className="ai-botbox__suggestions" aria-label="Suggestions">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="ai-botbox__suggestion"
                  disabled={loading || disabled || !hasApiKey}
                  onClick={() => handleSuggestion(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}

          {showBlend ? (
            <div className="ai-botbox__actions">
              <button
                type="button"
                className="ai-botbox__action"
                disabled={loading || disabled || !hasApiKey}
                onClick={() => runPrompt("", { mode: "blend" })}
              >
                {blendLabel}
              </button>
            </div>
          ) : null}

          <form className="ai-botbox__composer" onSubmit={submitDraft}>
            <textarea
              className="ai-botbox__input"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                disabled
                  ? disabledTitle || "Select an effect first…"
                  : hasApiKey
                    ? placeholder
                    : "Add OpenAI API key in Settings…"
              }
              rows={2}
              disabled={loading || disabled || !hasApiKey}
              aria-label="Message AI color assistant"
            />
            <button
              type="submit"
              className="ai-botbox__send"
              disabled={loading || disabled || !hasApiKey || !draft.trim()}
              aria-label="Send message"
              title={
                disabled
                  ? disabledTitle || "Select an effect first"
                  : hasApiKey
                    ? "Send (Enter)"
                    : "Add OpenAI API key in Settings"
              }
            >
              {loading ? (
                <span className="ai-botbox__send-spinner" aria-hidden />
              ) : (
                <IconSend size={17} stroke={1.85} aria-hidden />
              )}
            </button>
          </form>

          {!hasApiKey ? (
            <Text size="xs" c="dimmed" lh={1.45} className="ai-botbox__key-hint">
              Add your OpenAI API key in Settings to chat with the assistant.
            </Text>
          ) : null}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
