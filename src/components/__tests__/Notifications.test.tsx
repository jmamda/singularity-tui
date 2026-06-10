import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Notifications } from '../Notifications.js';
import { store } from '../../store.js';

describe('<Notifications />', () => {
  it('renders nothing when there are no notifications', () => {
    const { lastFrame } = render(<Notifications />);
    expect(lastFrame()).toBe('');
  });

  it('renders the most recent notifications with level prefixes', () => {
    store.notify('info', 'deploy finished');
    store.notify('error', 'pane 3 faulted');
    const { lastFrame } = render(<Notifications />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('deploy finished');
    expect(frame).toContain('✗ pane 3 faulted');
  });
});
