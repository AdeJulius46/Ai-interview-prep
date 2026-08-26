import { runFixtureSuite } from './test-utils/run-fixture-suite.js';
import { StatusDot } from './StatusDot.js';
import { statusDotFixtures } from './StatusDot.fixtures.js';

runFixtureSuite('StatusDot', StatusDot, statusDotFixtures);
