/// <reference types="jest" />
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  main,
  parseArgs,
  resolveDirectories,
  prepareOutputDirectory,
  OUTPUT_VARIANTS,
  UsageError
} from '../index';

/**
 * A stand-in for FFmpeg: logs its argv as JSON, writes the output file, and
 * fails for inputs whose name contains "broken".
 */
const FAKE_FFMPEG = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('-version')) process.exit(0);
fs.appendFileSync(process.env.FAKE_FFMPEG_LOG, JSON.stringify(args) + '\\n');
const input = args[args.indexOf('-i') + 1];
if (input.includes('broken')) {
  fs.writeSync(2, 'x'.repeat(2 * 1024 * 1024) + '\\nInvalid data found when processing input\\n');
  process.exit(1);
}
fs.writeFileSync(args[args.length - 1], 'encoded');
`;

let root: string;
let fakeFfmpeg: string;
let logFile: string;

const tmp = (...parts: string[]): string => path.join(root, ...parts);

const loggedCalls = (): string[][] =>
  fs.existsSync(logFile)
    ? fs
        .readFileSync(logFile, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log;
  const error = console.error;
  const write = process.stderr.write;
  console.log = () => undefined;
  console.error = () => undefined;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    return await fn();
  } finally {
    console.log = log;
    console.error = error;
    process.stderr.write = write;
  }
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-videos-'));
  fakeFfmpeg = path.join(root, 'fake ffmpeg.js');
  fs.writeFileSync(fakeFfmpeg, FAKE_FFMPEG, { mode: 0o755 });
  logFile = path.join(root, 'calls.log');
  process.env.FAKE_FFMPEG_LOG = logFile;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('parseArgs', () => {
  it('parses directories, --clean and --ffmpegPath', () => {
    const options = parseArgs([
      '--inputDirectory',
      'in dir',
      '--outputDirectory',
      'out',
      '--clean',
      '--ffmpegPath',
      '/opt/ffmpeg'
    ]);
    assert.strictEqual(options.inputDirectory, 'in dir');
    assert.strictEqual(options.outputDirectory, 'out');
    assert.strictEqual(options.clean, true);
    assert.strictEqual(options.ffmpegPath, '/opt/ffmpeg');
  });

  it('rejects unknown arguments and missing values', () => {
    assert.throws(() => parseArgs(['--bogus']), UsageError);
    assert.throws(() => parseArgs(['--inputDirectory']), UsageError);
  });
});

describe('resolveDirectories', () => {
  it('rejects an output equal to or containing the input', () => {
    fs.mkdirSync(tmp('a', 'videos'), { recursive: true });
    assert.throws(() => resolveDirectories(tmp('a', 'videos'), tmp('a', 'videos')), UsageError);
    assert.throws(() => resolveDirectories(tmp('a', 'videos'), tmp('a')), UsageError);
    assert.throws(() => resolveDirectories(tmp('a', 'videos'), tmp('a', 'videos', '..')), UsageError);
  });

  it('allows an output nested inside the input', () => {
    fs.mkdirSync(tmp('a'), { recursive: true });
    const { output } = resolveDirectories(tmp('a'), tmp('a', 'encoded'));
    assert.strictEqual(output, tmp('a', 'encoded'));
  });

  it('rejects a missing input directory', () => {
    assert.throws(() => resolveDirectories(tmp('missing'), tmp('out')), /does not exist/);
  });
});

describe('prepareOutputDirectory', () => {
  it('creates nested directories and keeps existing files by default', () => {
    prepareOutputDirectory(tmp('x', 'y', 'z'), false);
    assert.ok(fs.statSync(tmp('x', 'y', 'z')).isDirectory());
    fs.writeFileSync(tmp('x', 'y', 'z', 'keep.txt'), 'keep');
    prepareOutputDirectory(tmp('x', 'y', 'z'), false);
    assert.strictEqual(fs.readFileSync(tmp('x', 'y', 'z', 'keep.txt'), 'utf8'), 'keep');
  });

  it('empties the directory only with clean', () => {
    fs.mkdirSync(tmp('out'));
    fs.writeFileSync(tmp('out', 'old.txt'), 'old');
    prepareOutputDirectory(tmp('out'), true);
    assert.deepStrictEqual(fs.readdirSync(tmp('out')), []);
  });
});

describe('main', () => {
  it('encodes files with spaces, quotes and shell metacharacters as literal paths into a new nested output directory', async () => {
    const input = tmp('in $(touch PWNED) dir');
    const output = tmp('out; touch PWNED2', 'nested "deep"');
    const name = `clip 'a' "b" $(touch PWNED3) & ; | \`x\`.mp4`;
    fs.mkdirSync(input);
    fs.writeFileSync(path.join(input, name), 'video');
    fs.mkdirSync(tmp('out; touch PWNED2'));
    fs.writeFileSync(tmp('out; touch PWNED2', 'unrelated.txt'), 'keep');

    const code = await quietly(() =>
      main(['--inputDirectory', input, '--outputDirectory', output, '--ffmpegPath', fakeFfmpeg])
    );

    assert.strictEqual(code, 0);
    const calls = loggedCalls();
    assert.strictEqual(calls.length, OUTPUT_VARIANTS.length);
    for (const [i, call] of calls.entries()) {
      assert.strictEqual(call[call.indexOf('-i') + 1], path.join(input, name));
      const expected = path.join(output, name.replace(/\.mp4$/, '') + OUTPUT_VARIANTS[i]?.suffix);
      assert.strictEqual(call[call.length - 1], expected);
      assert.ok(fs.existsSync(expected));
    }
    assert.strictEqual(fs.readFileSync(tmp('out; touch PWNED2', 'unrelated.txt'), 'utf8'), 'keep');
    for (const dir of [process.cwd(), root, input]) {
      for (const marker of ['PWNED', 'PWNED2', 'PWNED3']) {
        assert.ok(!fs.existsSync(path.join(dir, marker)), `${marker} created in ${dir}`);
      }
    }
  }, 30000);

  it('returns 1 with a summary when an encode fails, even with large FFmpeg output, and still encodes other files', async () => {
    fs.mkdirSync(tmp('in'));
    fs.writeFileSync(tmp('in', 'broken.mov'), 'video');
    fs.writeFileSync(tmp('in', 'good.mp4'), 'video');
    const errors: string[] = [];
    const error = console.error;

    const code = await quietly(async () => {
      console.error = (...args: unknown[]) => errors.push(args.join(' '));
      try {
        return await main([
          '--inputDirectory',
          tmp('in'),
          '--outputDirectory',
          tmp('out'),
          '--ffmpegPath',
          fakeFfmpeg
        ]);
      } finally {
        console.error = error;
      }
    });

    assert.strictEqual(code, 1);
    assert.ok(errors.some((line) => line.includes(`4 of 8 outputs failed`)), errors.join('\n'));
    assert.ok(errors.some((line) => line.includes('Invalid data found when processing input')));
    assert.ok(fs.existsSync(tmp('out', 'good-mobile.webm')));
  }, 30000);

  it('reports a missing FFmpeg without touching the output directory', async () => {
    fs.mkdirSync(tmp('in'));
    fs.writeFileSync(tmp('in', 'a.mp4'), 'video');
    const errors: string[] = [];
    const code = await quietly(async () => {
      const error = console.error;
      console.error = (...args: unknown[]) => errors.push(args.join(' '));
      try {
        return await main([
          '--inputDirectory',
          tmp('in'),
          '--outputDirectory',
          tmp('out'),
          '--ffmpegPath',
          tmp('no-such-ffmpeg')
        ]);
      } finally {
        console.error = error;
      }
    });
    assert.strictEqual(code, 1);
    assert.ok(errors.some((line) => line.includes('FFmpeg was not found')));
    assert.ok(!fs.existsSync(tmp('out')));
  });

  it('refuses to use the input directory as output and leaves the videos intact', async () => {
    fs.mkdirSync(tmp('in'));
    fs.writeFileSync(tmp('in', 'a.mp4'), 'video');
    const code = await quietly(() =>
      main(['--inputDirectory', tmp('in'), '--outputDirectory', tmp('in'), '--clean', '--ffmpegPath', fakeFfmpeg])
    );
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(fs.readdirSync(tmp('in')), ['a.mp4']);
    assert.deepStrictEqual(loggedCalls(), []);
  });

  it('fails when the input directory has no videos', async () => {
    fs.mkdirSync(tmp('in'));
    const code = await quietly(() =>
      main(['--inputDirectory', tmp('in'), '--outputDirectory', tmp('out'), '--ffmpegPath', fakeFfmpeg])
    );
    assert.strictEqual(code, 1);
  });

  it('prints usage with --help', async () => {
    const code = await quietly(() => main(['--help']));
    assert.strictEqual(code, 0);
  });
});
