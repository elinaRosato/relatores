import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import DelayPanel from './DelayPanel.svelte';
import { delaySeconds, setDelay } from '../lib/stores.js';

beforeEach(() => setDelay(0));
afterEach(() => cleanup());

describe('DelayPanel', () => {
  it('renders the current delay value in the number input', () => {
    setDelay(12.3);
    render(DelayPanel);
    expect(screen.getByLabelText('Delay en segundos').value).toBe('12.3');
  });

  it('updates the store when the slider is moved', async () => {
    render(DelayPanel);
    const slider = screen.getByLabelText('Delay slider');
    await fireEvent.input(slider, { target: { value: '12' } });
    expect(get(delaySeconds)).toBe(12);
  });

  it('highlights the matching preset and clears it when the value no longer matches', async () => {
    render(DelayPanel);
    await fireEvent.click(screen.getByRole('button', { name: '10s' }));
    expect(screen.getByRole('button', { name: '10s' }).classList.contains('active')).toBe(true);

    setDelay(12.3);
    await Promise.resolve();
    expect(screen.getByRole('button', { name: '10s' }).classList.contains('active')).toBe(false);
  });

  it('commits a typed value on blur, clamped and snapped', async () => {
    render(DelayPanel);
    const input = screen.getByLabelText('Delay en segundos');
    await fireEvent.input(input, { target: { value: '8.74' } });
    await fireEvent.blur(input);
    expect(get(delaySeconds)).toBe(8.7);
  });

  it('commits a typed value on Enter', async () => {
    render(DelayPanel);
    const input = screen.getByLabelText('Delay en segundos');
    await fireEvent.input(input, { target: { value: '8' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(get(delaySeconds)).toBe(8);
  });

  it('ignores a non-numeric typed value and reverts the input on blur', async () => {
    setDelay(5);
    render(DelayPanel);
    const input = screen.getByLabelText('Delay en segundos');
    await fireEvent.input(input, { target: { value: 'abc' } });
    await fireEvent.blur(input);
    expect(get(delaySeconds)).toBe(5);
    expect(input.value).toBe('5.0');
  });

  it('disables every control when disabled is true', () => {
    render(DelayPanel, { props: { disabled: true } });
    expect(screen.getByLabelText('Delay slider').disabled).toBe(true);
    expect(screen.getByLabelText('Delay en segundos').disabled).toBe(true);
    expect(screen.getByRole('button', { name: '10s' }).disabled).toBe(true);
  });
});
