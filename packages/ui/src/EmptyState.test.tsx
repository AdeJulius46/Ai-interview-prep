import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { EmptyState } from './EmptyState.js';
import { emptyStateFixtures } from './EmptyState.fixtures.js';

runFixtureSuite('EmptyState', EmptyState, emptyStateFixtures);
