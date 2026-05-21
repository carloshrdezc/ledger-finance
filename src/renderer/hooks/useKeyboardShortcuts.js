import React from 'react';

function isEditable(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

export default function useKeyboardShortcuts({ enabled = true, bindings = [] }) {
  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  React.useEffect(() => {
    const onKey = (e) => {
      if (!enabledRef.current) return;
      const editable = isEditable(e.target);
      for (const b of bindingsRef.current) {
        if (b.keys !== e.key) continue;
        if (editable && !b.allowInInput) continue;
        e.preventDefault();
        b.handler(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
