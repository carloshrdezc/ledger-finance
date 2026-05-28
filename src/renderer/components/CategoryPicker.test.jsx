// @vitest-environment jsdom
// CAR-189 follow-up: integration tests for <CategoryPicker> covering the
// pre-fill flow (rule auto-fill writes a nested path → picker displays the
// full breadcrumb), keyboard navigation, and auto-flip direction.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CategoryPicker from './CategoryPicker';

afterEach(() => {
  cleanup();
});

const TREE = {
  food: {
    label: 'FOOD',
    glyph: '🍎',
    children: {
      produce: { label: 'PRODUCE' },
      cafe: { label: 'CAFÉ' },
    },
  },
  transport: { label: 'TRANSPORT' },
};

describe('CategoryPicker — rule pre-fill (the CAR-189 motivator)', () => {
  it('renders the full breadcrumb when value is a nested path', () => {
    // Simulates: rule auto-fill writes path=['food','produce'], picker
    // surfaces FOOD › PRODUCE on the trigger so the user sees the
    // subcategory before saving (the pre-CAR-189 chip row only highlighted
    // the top-level FOOD chip and silently dropped the subcategory).
    render(<CategoryPicker tree={TREE} value={['food', 'produce']} onChange={() => {}} />);
    const trigger = screen.getByRole('button');
    expect(trigger.textContent).toContain('FOOD');
    expect(trigger.textContent).toContain('PRODUCE');
  });

  it('renders just the leaf when value is a top-level path', () => {
    render(<CategoryPicker tree={TREE} value={['food']} onChange={() => {}} />);
    const trigger = screen.getByRole('button');
    expect(trigger.textContent).toContain('FOOD');
    expect(trigger.textContent).not.toContain('PRODUCE');
  });

  it('renders the placeholder when no value is set', () => {
    render(<CategoryPicker tree={TREE} value={null} onChange={() => {}} placeholder="DINING" />);
    expect(screen.getByRole('button').textContent).toContain('DINING');
  });
});

describe('CategoryPicker — selection writes the full path', () => {
  it('clicking a nested entry calls onChange with the leaf path (not just top-level)', () => {
    const onChange = vi.fn();
    render(<CategoryPicker tree={TREE} value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button')); // open
    // Find the FOOD › PRODUCE option by its breadcrumb text.
    const options = screen.getAllByRole('option');
    const produceOpt = options.find((o) => o.textContent.includes('PRODUCE'));
    expect(produceOpt).toBeTruthy();
    fireEvent.click(produceOpt);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['food', 'produce']);
  });
});

describe('CategoryPicker — keyboard navigation', () => {
  it('ArrowDown then Enter selects the next entry', () => {
    const onChange = vi.fn();
    render(<CategoryPicker tree={TREE} value={['food']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button')); // open

    // Initial highlight is on the current value (food). ArrowDown moves to next.
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    // After FOOD comes FOOD › PRODUCE in tree-walk order.
    expect(onChange).toHaveBeenCalledWith(['food', 'produce']);
  });

  it('Escape closes the picker without firing onChange', () => {
    const onChange = vi.fn();
    render(<CategoryPicker tree={TREE} value={['food']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button')); // open
    expect(screen.queryByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeFalsy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Home jumps to first entry, End jumps to last', () => {
    const onChange = vi.fn();
    render(<CategoryPicker tree={TREE} value={['food', 'produce']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: 'Enter' });
    // Last entry in the depth-first walk is TRANSPORT.
    expect(onChange).toHaveBeenLastCalledWith(['transport']);

    fireEvent.click(screen.getByRole('button')); // reopen
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'Enter' });
    // First entry is FOOD.
    expect(onChange).toHaveBeenLastCalledWith(['food']);
  });
});

describe('CategoryPicker — empty-tree fallback', () => {
  it('shows "No categories" when tree is empty', () => {
    render(<CategoryPicker tree={{}} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/no categories/i)).toBeTruthy();
  });

  it('shows "No categories" when tree is undefined', () => {
    render(<CategoryPicker tree={undefined} value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/no categories/i)).toBeTruthy();
  });
});
