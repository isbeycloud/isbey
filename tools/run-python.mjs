import { spawnSync } from 'node:child_process';

// Windows may expose a Store alias as python3. Use an installed interpreter
// and keep UTF-8 enabled in subprocesses as well as the contract test itself.
const candidates = process.platform === 'win32'
  ? [['python', []], ['py', ['-3']], ['python3', []]]
  : [['python3', []], ['python', []]];
const env = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
const interpreter = candidates.find(([command, prefix]) =>
  spawnSync(command, [...prefix, '--version'], { env, stdio: 'ignore' }).status === 0);

if (!interpreter) {
  console.error('Python 3 bulunamadı. Python 3 kurup yeniden deneyin.');
  process.exitCode = 1;
} else {
  const [command, prefix] = interpreter;
  const result = spawnSync(command, [...prefix, '-X', 'utf8', ...process.argv.slice(2)], {
    env, stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
