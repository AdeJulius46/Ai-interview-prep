import { runFixtureSuite } from './test-utils/run-fixture-suite';
import { StatusDot } from './StatusDot';
import { statusDotFixtures } from './StatusDot.fixtures';

runFixtureSuite('StatusDot', StatusDot, statusDotFixtures);
