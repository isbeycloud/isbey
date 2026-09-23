import fs from 'node:fs';

/** Windows scanners can briefly lock the destination of an atomic rename. */
export function replaceFileWithRetry(source: string, destination: string): void {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(code || '')) throw error;
      // Bounded total delay of 150 ms; original file remains intact until rename succeeds.
      Atomics.wait(sleeper, 0, 0, 10 * 2 ** attempt);
    }
  }
}
