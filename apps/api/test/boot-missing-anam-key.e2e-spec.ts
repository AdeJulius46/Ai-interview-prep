// Gate 0: "A test asserts the app fails to boot when ANAM_API_KEY is absent.
// Missing config must crash at startup, not at request time." See
// testing.md, gate:0, and backend.md's Boot-time guarantees.
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
// Simulate a deployment missing ANAM_API_KEY. dotenv.config() never
// overwrites a variable already present in process.env, so on repeat runs
// within the same worker this delete is what puts the env back in the
// "missing" state before AppModule is constructed below.
delete process.env.ANAM_API_KEY;

import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('Boot (missing ANAM_API_KEY)', () => {
  it('fails to compile/boot the app rather than surfacing a 500 at request time', async () => {
    await expect(
      Test.createTestingModule({
        imports: [AppModule],
      }).compile(),
    ).rejects.toThrow(/ANAM_API_KEY/);
  });
});
