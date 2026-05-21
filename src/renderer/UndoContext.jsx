import React from 'react';
import { createUndoStack } from './undo.mjs';

const UndoCtx = React.createContext(null);

export function UndoProvider({ children }) {
  const stack = React.useMemo(() => createUndoStack(), []);
  const [, setVersion] = React.useState(0);

  React.useEffect(() => {
    return stack.subscribe(() => setVersion(v => v + 1));
  }, [stack]);

  return <UndoCtx.Provider value={stack}>{children}</UndoCtx.Provider>;
}

export function useUndo() {
  const stack = React.useContext(UndoCtx);
  if (!stack) {
    throw new Error('useUndo must be used inside <UndoProvider>');
  }
  return stack;
}
