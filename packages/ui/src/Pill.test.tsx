import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { Pill } from './Pill.js';
import { pillFixtures } from './Pill.fixtures.js';

runFixtureSuite('Pill', Pill, pillFixtures);
