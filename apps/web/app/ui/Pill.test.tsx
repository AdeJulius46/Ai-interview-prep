import { runFixtureSuite } from './test-utils/run-fixture-suite';
import { Pill } from './Pill';
import { pillFixtures } from './Pill.fixtures';

runFixtureSuite('Pill', Pill, pillFixtures);
