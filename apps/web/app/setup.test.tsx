// Component-level coverage for the Setup screen. See frontend.md, "Screens
// > 1. Setup (/)", and testing.md, gate:5.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const createInterviewMock = vi.fn();
vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client');
  return {
    ...actual,
    createInterview: (...args: unknown[]) => createInterviewMock(...args),
  };
});

import Home from './page';

async function fillRole(user: ReturnType<typeof userEvent.setup>) {
  const role = screen.getByLabelText(/role/i);
  await user.type(role, 'Frontend Engineer');
}

async function selectCompetency(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const group = screen.getByRole('group', { name: /competencies/i });
  await user.click(within(group).getByRole('button', { name }));
}

describe('Setup screen (/)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    createInterviewMock.mockReset();
  });

  it('cannot submit with zero competencies selected', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await fillRole(user);

    const submit = screen.getByRole('button', { name: /start setup/i });
    expect(submit).toBeDisabled();

    await user.click(submit);
    expect(createInterviewMock).not.toHaveBeenCalled();
  });

  it('blocks selecting a 6th competency and explains inline', async () => {
    const user = userEvent.setup();
    render(<Home />);

    const group = screen.getByRole('group', { name: /competencies/i });
    const chips = within(group).getAllByRole('button');
    expect(chips).toHaveLength(6);

    for (const chip of chips.slice(0, 5)) {
      await user.click(chip);
    }
    for (const chip of chips.slice(0, 5)) {
      expect(chip).toHaveAttribute('aria-pressed', 'true');
    }

    const sixth = chips[5];
    await user.click(sixth);

    expect(sixth).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/up to 5/i)).toBeInTheDocument();
  });

  it('submits the right body and routes to /interview/<id>', async () => {
    createInterviewMock.mockResolvedValueOnce({
      id: 'abc-123',
      role: 'Frontend Engineer',
      seniority: 'STAFF',
      competencies: ['OWNERSHIP', 'CONFLICT'],
      questionCount: 3,
      timeLimitSecs: 180,
      interviewerName: 'John',
      status: 'CREATED',
      createdAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
    });

    const user = userEvent.setup();
    render(<Home />);

    await fillRole(user);
    await user.click(screen.getByRole('button', { name: /^staff$/i }));
    await selectCompetency(user, /ownership/i);
    await selectCompetency(user, /handling conflict/i);

    await user.click(screen.getByRole('button', { name: /start setup/i }));

    expect(createInterviewMock).toHaveBeenCalledTimes(1);
    expect(createInterviewMock).toHaveBeenCalledWith({
      role: 'Frontend Engineer',
      seniority: 'STAFF',
      competencies: ['OWNERSHIP', 'CONFLICT'],
      questionCount: 3,
    });

    expect(pushMock).toHaveBeenCalledWith('/interview/abc-123');
  });

  it('renders the server 400 message, not a generic one', async () => {
    createInterviewMock.mockRejectedValueOnce({
      statusCode: 400,
      error: 'InterviewNotFound',
      message: 'Role must be at least 2 characters long.',
    });

    const user = userEvent.setup();
    render(<Home />);

    await fillRole(user);
    await selectCompetency(user, /ownership/i);
    await user.click(screen.getByRole('button', { name: /start setup/i }));

    expect(await screen.findByText('Role must be at least 2 characters long.')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
