// @vitest-environment jsdom
// CAR-346: smoke test for the shared note + receipt/photo attachments control.
// The DOM-bound image processing (canvas/FileReader/Image) is mocked so the
// test exercises the component's wiring: adding/removing attachments, the note
// textarea, the count cap, and the oversized/wrong-type error path (image is
// NOT stored when processImageFile throws).
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// Mock the DOM orchestration module. Pure caps are re-exported through it.
vi.mock('../attachments.js', async () => {
  const pure = await vi.importActual('../attachments.mjs');
  return {
    ...pure,
    processImageFile: vi.fn(),
    attachmentCountError: (n) =>
      n >= pure.MAX_ATTACHMENTS_PER_TX
        ? `You can attach at most ${pure.MAX_ATTACHMENTS_PER_TX} images per transaction.`
        : null,
  };
});

import AttachmentsField from './AttachmentsField';
import { processImageFile } from '../attachments.js';

const THEME = { accent: '#1f6b3a' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeAtt(id) {
  return {
    id, dataUrl: 'data:image/jpeg;base64,AAAA', name: id + '.jpg',
    mime: 'image/jpeg', w: 100, h: 100, bytes: 3, addedAt: '2026-06-01T00:00:00Z',
  };
}

// A controlled harness mirroring how the add forms drive the field.
function Harness({ initialAtts = [] }) {
  const [note, setNote] = React.useState('');
  const [atts, setAtts] = React.useState(initialAtts);
  return (
    <div>
      <div data-testid="note-value">{note}</div>
      <div data-testid="att-count">{atts.length}</div>
      <AttachmentsField
        t={THEME}
        note={note}
        onNoteChange={setNote}
        attachments={atts}
        onAddAttachment={a => setAtts(prev => [...prev, a])}
        onRemoveAttachment={id => setAtts(prev => prev.filter(x => x.id !== id))}
      />
    </div>
  );
}

function pickFile(name = 'r.jpg', type = 'image/jpeg') {
  const input = document.querySelector('input[type=file]');
  const file = new File(['x'], name, { type });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe('AttachmentsField', () => {
  it('writes the note through the controlled callback', () => {
    render(<Harness />);
    const textarea = screen.getByPlaceholderText(/work lunch/i);
    fireEvent.change(textarea, { target: { value: 'reimbursable' } });
    expect(screen.getByTestId('note-value').textContent).toBe('reimbursable');
  });

  it('adds an attachment and renders a thumbnail + count', async () => {
    processImageFile.mockResolvedValueOnce(makeAtt('a1'));
    render(<Harness />);
    pickFile();
    await waitFor(() => expect(screen.getByTestId('att-count').textContent).toBe('1'));
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1/5')).toBeTruthy();
  });

  it('removes an attachment via the remove button', async () => {
    render(<Harness initialAtts={[makeAtt('a1')]} />);
    expect(screen.getByTestId('att-count').textContent).toBe('1');
    fireEvent.click(screen.getByLabelText(/Remove attachment/i));
    expect(screen.getByTestId('att-count').textContent).toBe('0');
  });

  it('shows an error and does NOT store an oversized / wrong-type image', async () => {
    processImageFile.mockRejectedValueOnce(new Error('Image is too large after compression (limit 2 MB).'));
    render(<Harness />);
    pickFile();
    await waitFor(() => expect(screen.getByText(/too large/i)).toBeTruthy());
    expect(screen.getByTestId('att-count').textContent).toBe('0'); // not stored
  });

  it('enforces the per-tx count cap and shows LIMIT REACHED', () => {
    const five = ['a','b','c','d','e'].map(makeAtt);
    render(<Harness initialAtts={five} />);
    expect(screen.getByTestId('att-count').textContent).toBe('5');
    expect(screen.getByText('5/5')).toBeTruthy();
    expect(screen.getByText(/LIMIT REACHED/i)).toBeTruthy();
  });
});
