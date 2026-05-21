// Shared browser-download helpers. Used by BackupSection (JSON), WebReports
// (CSV), and the Cmd-K command palette's "Backup now" action.

export function downloadFile(name, contents, mime = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contents], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
