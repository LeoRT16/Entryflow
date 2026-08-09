"use client";

import { useEffect } from "react";

type KeyboardShortcutBinding = {
  id: string;
  shortcut: string;
  handler: (event: KeyboardEvent) => void;
  priority?: number;
  allowInInputs?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
};

type ShortcutStep = {
  key: string;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  mod: boolean;
};

type RegisteredBinding = KeyboardShortcutBinding & {
  steps: ShortcutStep[];
};

const registry = new Map<string, RegisteredBinding>();
let listenerAttached = false;
let sequenceBuffer: string[] = [];
let sequenceTimestamp = 0;
const SEQUENCE_TIMEOUT_MS = 900;

function normalizeKey(key: string) {
  const value = key.trim().toLowerCase();

  if (value === "esc") return "escape";
  if (value === "cmd" || value === "command" || value === "meta") return "meta";
  if (value === "ctrl" || value === "control") return "ctrl";
  if (value === "option") return "alt";
  if (value === "mod") return "mod";
  if (value === " ") return "space";

  return value;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function parseShortcut(shortcut: string): ShortcutStep[] {
  return shortcut
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((step) => {
      const parsed: ShortcutStep = {
        key: "",
        meta: false,
        ctrl: false,
        shift: false,
        alt: false,
        mod: false,
      };

      for (const part of step.split("+").map((item) => item.trim()).filter(Boolean)) {
        const key = normalizeKey(part);

        if (key === "meta") {
          parsed.meta = true;
        } else if (key === "ctrl") {
          parsed.ctrl = true;
        } else if (key === "shift") {
          parsed.shift = true;
        } else if (key === "alt") {
          parsed.alt = true;
        } else if (key === "mod") {
          parsed.mod = true;
        } else {
          parsed.key = key;
        }
      }

      return parsed;
    });
}

function keyFromEvent(event: KeyboardEvent) {
  return normalizeKey(event.key);
}

function stepMatchesEvent(event: KeyboardEvent, step: ShortcutStep) {
  const key = keyFromEvent(event);

  if (step.mod && !(event.metaKey || event.ctrlKey)) {
    return false;
  }

  if (step.meta && !event.metaKey) {
    return false;
  }

  if (step.ctrl && !event.ctrlKey) {
    return false;
  }

  if (step.shift && !event.shiftKey) {
    return false;
  }

  if (step.alt && !event.altKey) {
    return false;
  }

  if (step.key === "space") {
    return event.key === " " || key === "space";
  }

  return key === step.key;
}

function sequenceMatches(steps: ShortcutStep[], buffer: string[]) {
  if (steps.length !== buffer.length) {
    return false;
  }

  return steps.every((step, index) => {
    const current = buffer[index];
    return current === step.key && !step.meta && !step.ctrl && !step.shift && !step.alt && !step.mod;
  });
}

function sequenceHasPrefix(steps: ShortcutStep[], buffer: string[]) {
  if (buffer.length > steps.length) {
    return false;
  }

  return buffer.every((key, index) => {
    const current = steps[index];
    return current && current.key === key && !current.meta && !current.ctrl && !current.shift && !current.alt && !current.mod;
  });
}

function handleKeyDown(event: KeyboardEvent) {
  const editableTarget = isEditableTarget(event.target);
  const key = keyFromEvent(event);
  const isModifierKey = key === "shift" || key === "meta" || key === "ctrl" || key === "alt";

  if (Date.now() - sequenceTimestamp > SEQUENCE_TIMEOUT_MS) {
    sequenceBuffer = [];
  }

  const bindings = [...registry.values()].filter((binding) => binding.enabled !== false);
  const activeBindings = bindings.filter((binding) => !editableTarget || binding.allowInInputs);
  const sequenceBindings = activeBindings.filter((binding) => binding.steps.length > 1);

  const singleKeyMatches = activeBindings
    .filter((binding) => binding.steps.length === 1)
    .filter((binding) => stepMatchesEvent(event, binding.steps[0]))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const shouldConsiderSequence = !event.metaKey && !event.ctrlKey && !event.altKey && !isModifierKey;

  if (sequenceBuffer.length > 0) {
    if (!shouldConsiderSequence) {
      sequenceBuffer = [];
      return;
    }

    const nextBuffer = [...sequenceBuffer, key].slice(-4);
    const matchedSequence = sequenceBindings
      .filter((binding) => sequenceMatches(binding.steps, nextBuffer))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];

    if (matchedSequence) {
      if (matchedSequence.preventDefault !== false) {
        event.preventDefault();
      }

      if (matchedSequence.stopPropagation) {
        event.stopPropagation();
      }

      matchedSequence.handler(event);
      sequenceBuffer = [];
      sequenceTimestamp = 0;
      return;
    }

    if (sequenceBindings.some((binding) => sequenceHasPrefix(binding.steps, nextBuffer))) {
      sequenceBuffer = nextBuffer;
      sequenceTimestamp = Date.now();
      return;
    }

    sequenceBuffer = [];
    sequenceTimestamp = 0;
    return;
  }

  if (shouldConsiderSequence) {
    const matchesPrefix = sequenceBindings.some((binding) => {
      const first = binding.steps[0];
      return first.key === key && !first.meta && !first.ctrl && !first.shift && !first.alt && !first.mod;
    });

    if (matchesPrefix) {
      sequenceBuffer = [key];
      sequenceTimestamp = Date.now();
      return;
    }
  }

  const match = singleKeyMatches[0];

  if (!match) {
    return;
  }

  if (match.preventDefault !== false) {
    event.preventDefault();
  }

  if (match.stopPropagation) {
    event.stopPropagation();
  }

  match.handler(event);
}

function ensureListener() {
  if (listenerAttached || typeof window === "undefined") {
    return;
  }

  window.addEventListener("keydown", handleKeyDown, true);
  listenerAttached = true;
}

function cleanupListener() {
  if (!listenerAttached || typeof window === "undefined" || registry.size > 0) {
    return;
  }

  window.removeEventListener("keydown", handleKeyDown, true);
  listenerAttached = false;
  sequenceBuffer = [];
  sequenceTimestamp = 0;
}

export function useKeyboardShortcuts(bindings: KeyboardShortcutBinding[]) {
  useEffect(() => {
    if (!bindings.length) {
      return;
    }

    bindings.forEach((binding) => {
      registry.set(binding.id, {
        ...binding,
        steps: parseShortcut(binding.shortcut),
      });
    });

    ensureListener();

    return () => {
      bindings.forEach((binding) => {
        registry.delete(binding.id);
      });

      cleanupListener();
    };
  }, [bindings]);
}

export function focusFirstShortcutSearchInput() {
  if (typeof document === "undefined") {
    return;
  }

  const candidates = Array.from(document.querySelectorAll<HTMLInputElement>("[data-shortcut-search='true']"));
  const target = candidates.find((input) => !input.disabled && input.offsetParent !== null);

  target?.focus();
  target?.select?.();
}
