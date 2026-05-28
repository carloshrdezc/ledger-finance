export function shouldCheckForUpdates({ isPackaged, isOnline }) {
  return Boolean(isPackaged && isOnline);
}
