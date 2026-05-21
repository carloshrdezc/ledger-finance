import React from 'react';

const PREFIX_TIMEOUT_MS = 1500;

function isEditable(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

function splitKeys(keys) {
  const parts = keys.split(' ');
  return parts.length === 2 ? parts : null;
}

export default function useKeyboardShortcuts({ enabled = true, bindings = [] }) {
  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  const prefixRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    const clearPrefix = () => {
      prefixRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const findBinding = (keys, editable) => {
      for (const b of bindingsRef.current) {
        if (b.keys !== keys) continue;
        if (editable && !b.allowInInput) continue;
        return b;
      }
      return null;
    };

    const isPrefix = (key) => {
      for (const b of bindingsRef.current) {
        const pair = splitKeys(b.keys);
        if (pair && pair[0] === key) return true;
      }
      return false;
    };

    const onKey = (e) => {
      if (!enabledRef.current) {
        clearPrefix();
        return;
      }
      const editable = isEditable(e.target);

      if (prefixRef.current) {
        const combined = prefixRef.current + ' ' + e.key;
        const match = findBinding(combined, editable);
        clearPrefix();
        if (match) {
          e.preventDefault();
          match.handler(e);
          return;
        }
      }

      const single = findBinding(e.key, editable);
      if (single) {
        e.preventDefault();
        single.handler(e);
        return;
      }

      if (!editable && isPrefix(e.key)) {
        prefixRef.current = e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(clearPrefix, PREFIX_TIMEOUT_MS);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearPrefix();
    };
  }, []);
}
