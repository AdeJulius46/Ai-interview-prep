import { runFixtureSuite } from './test-utils/run-fixture-suite';
import { EmptyState } from './EmptyState';
import { emptyStateFixtures } from './EmptyState.fixtures';

runFixtureSuite('EmptyState', EmptyState, emptyStateFixtures);
