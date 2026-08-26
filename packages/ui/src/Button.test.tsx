import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { Button } from './Button.js';
import { buttonFixtures } from './Button.fixtures.js';

runFixtureSuite('Button', Button, buttonFixtures);

describe('Button', () => {
  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Start interview
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start interview' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Start interview
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start interview' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onClick when loading', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Start interview
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets aria-busy when loading and swaps in the loading label', () => {
    render(
      <Button variant="primary" loading loadingLabel="Connecting...">
        Start interview
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Connecting...');
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button variant="primary" ref={ref}>
        Start interview
      </Button>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('spreads remaining props onto the root element', () => {
    render(
      <Button variant="primary" data-testid="start-btn">
        Start interview
      </Button>,
    );
    expect(screen.getByTestId('start-btn')).toBeInTheDocument();
  });
});
