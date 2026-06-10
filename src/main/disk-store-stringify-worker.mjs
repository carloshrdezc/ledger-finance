// CAR-245: lightweight worker_threads worker that moves JSON.stringify off the
// main process event loop. One worker is spawned per disk store (see
// disk-store.mjs) and reused across writes. It receives a state object and
// posts back the serialized single-line JSON string.
//
// Kept intentionally minimal — no pretty-printing (the file is machine-read).
import { parentPort } from 'worker_threads';

if (parentPort) {
  parentPort.on('message', state => {
    parentPort.postMessage(JSON.stringify(state));
  });
}
