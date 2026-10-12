import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Default FFmpeg executable, resolved from PATH.
 */
export const DEFAULT_FFMPEG_PATH = 'ffmpeg';

/**
 * Allowed video file extensions.
 *
 * @remarks
 * Default value: ['.mp4', '.mov'].
 */
export const VIDEO_EXTENSIONS: string[] = ['.mp4', '.mov'];

/**
 * FFmpeg options for H.264 codec.
 *
 * @remarks
 * Default value: ['-c:v', 'libx264', '-c:a', 'aac', '-b:a', '192k'].
 */
const h264Options: string[] = [
  '-c:v',
  'libx264',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-vf',
  'scale=1920:1080' // 16:9 aspect ratio
];

/**
 * FFmpeg options for VP9 codec (WebM format).
 *
 * @remarks
 * Default value: ['-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-b:a', '192k', '-vf', 'scale=1920:1080'].
 */
const vp9Options: string[] = [
  '-c:v',
  'libvpx-vp9',
  '-crf',
  '20',
  '-b:v',
  '0',
  '-b:a',
  '192k',
  '-vf',
  'scale=1920:1080' // 16:9 aspect ratio
];

/**
 * FFmpeg options for mobile version with 4:3 aspect ratio.
 */
const mobileOptions: string[] = [
  '-vf',
  'scale=640:480' // 4:3 aspect ratio for mobile
];

/**
 * The outputs generated for every input video.
 */
export const OUTPUT_VARIANTS: { suffix: string; label: string; options: string[] }[] = [
  { suffix: '-desktop.mp4', label: 'H.264 - Desktop', options: h264Options },
  { suffix: '-desktop.webm', label: 'VP9 - Desktop', options: vp9Options },
  {
    suffix: '-mobile.mp4',
    label: 'H.264 - Mobile',
    options: [...h264Options, ...mobileOptions]
  },
  {
    suffix: '-mobile.webm',
    label: 'VP9 - Mobile',
    options: [...vp9Options, ...mobileOptions]
  }
];

export const USAGE = `Usage: create-videos --inputDirectory <dir> --outputDirectory <dir> [options]

Encodes every ${VIDEO_EXTENSIONS.join('/')} file in the input directory into
desktop (16:9) and mobile (4:3) H.264 MP4 and VP9 WebM versions.

Options:
  --inputDirectory <dir>   Directory containing the source videos (required)
  --outputDirectory <dir>  Directory for the encoded videos; created if missing (required)
  --clean                  Delete everything inside the output directory before encoding.
                           Without it, only the generated files are overwritten.
  --ffmpegPath <path>      FFmpeg executable to use (default: ffmpeg on PATH)
  --help                   Show this message`;

const useColor = (): boolean =>
  Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);

const paint =
  (code: number) =>
  (text: string): string =>
    useColor() ? `\x1b[${code}m${text}\x1b[39m` : text;

const green = paint(32);
const red = paint(31);

/**
 * Options accepted by the CLI.
 */
export interface CliOptions {
  inputDirectory?: string;
  outputDirectory?: string;
  ffmpegPath: string;
  clean: boolean;
  help: boolean;
}

/**
 * An error whose message is meant to be shown to the user as-is.
 */
export class UsageError extends Error {}

/**
 * Parse command-line arguments (without the node executable and script path).
 *
 * @param argv - The arguments to parse.
 * @returns The parsed options.
 */
export const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    ffmpegPath: DEFAULT_FFMPEG_PATH,
    clean: false,
    help: false
  };

  const valueFor = (index: number, name: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value === '') {
      throw new UsageError(`Missing value for ${name}.`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--inputDirectory':
        options.inputDirectory = valueFor(i++, arg);
        break;
      case '--outputDirectory':
        options.outputDirectory = valueFor(i++, arg);
        break;
      case '--ffmpegPath':
        options.ffmpegPath = valueFor(i++, arg);
        break;
      case '--clean':
        options.clean = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  return options;
};

const realpathIfExists = (dir: string): string => {
  try {
    return fs.realpathSync(dir);
  } catch {
    return dir;
  }
};

const isSameOrInside = (child: string, parent: string): boolean => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
};

/**
 * Resolve and validate the input and output directories.
 *
 * @remarks
 * Rejects a missing or unreadable input directory, and an output directory
 * that is the input directory or contains it, before anything is written or
 * deleted.
 *
 * @param inputDirectory - The input directory as given by the user.
 * @param outputDirectory - The output directory as given by the user.
 * @returns Absolute paths for both directories.
 */
export const resolveDirectories = (
  inputDirectory: string,
  outputDirectory: string
): { input: string; output: string } => {
  const input = path.resolve(inputDirectory);
  const output = path.resolve(outputDirectory);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(input);
  } catch {
    throw new UsageError(`Input directory does not exist: ${input}`);
  }
  if (!stat.isDirectory()) {
    throw new UsageError(`Input path is not a directory: ${input}`);
  }

  const realInput = realpathIfExists(input);
  const realOutput = realpathIfExists(output);
  if (
    isSameOrInside(input, output) ||
    isSameOrInside(realInput, realOutput)
  ) {
    throw new UsageError(
      `Output directory must not be the input directory or contain it (input: ${input}, output: ${output}).`
    );
  }

  return { input, output };
};

/**
 * Create the output directory (recursively) and optionally empty it.
 *
 * @param output - Absolute output directory, already validated.
 * @param clean - Whether to delete the existing contents first.
 */
export const prepareOutputDirectory = (output: string, clean: boolean): void => {
  if (fs.existsSync(output) && !fs.statSync(output).isDirectory()) {
    throw new UsageError(`Output path is not a directory: ${output}`);
  }
  fs.mkdirSync(output, { recursive: true });
  if (clean) {
    for (const entry of fs.readdirSync(output)) {
      fs.rmSync(path.join(output, entry), { recursive: true, force: true });
    }
  }
};

/**
 * List the video files to process in a directory.
 *
 * @param input - The input directory.
 * @returns The sorted file names with an allowed extension.
 */
export const listVideoFiles = (input: string): string[] => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(input, { withFileTypes: true });
  } catch (error) {
    throw new UsageError(
      `Cannot read input directory ${input}: ${(error as Error).message}`
    );
  }
  return entries
    .filter(
      (entry) =>
        !entry.isDirectory() && VIDEO_EXTENSIONS.includes(path.extname(entry.name))
    )
    .map((entry) => entry.name)
    .sort();
};

const STDERR_TAIL_BYTES = 4096;

/**
 * Run FFmpeg with an argument array (no shell), streaming its output to the
 * console.
 *
 * @param ffmpegPath - The FFmpeg executable.
 * @param args - The arguments passed verbatim to FFmpeg.
 * @param quiet - Discard FFmpeg's output instead of streaming it.
 * @returns A Promise that resolves when FFmpeg exits successfully.
 */
export const runFfmpeg = (
  ffmpegPath: string,
  args: string[],
  quiet = false
): Promise<void> =>
  new Promise((resolve, reject) => {
    // stdin is ignored so FFmpeg can never block waiting for a prompt answer.
    const child = spawn(ffmpegPath, args, {
      shell: false,
      stdio: ['ignore', quiet ? 'ignore' : 'inherit', 'pipe'],
      windowsHide: true
    });

    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      if (!quiet) {
        process.stderr.write(chunk);
      }
      stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_BYTES);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(
          new UsageError(
            `FFmpeg was not found at "${ffmpegPath}". Install FFmpeg and add it to PATH, or pass --ffmpegPath.`
          )
        );
      } else {
        reject(new Error(`Failed to start FFmpeg (${ffmpegPath}): ${error.message}`));
      }
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      const lastLine = stderrTail.trim().split(/\r?\n/).pop() ?? '';
      reject(new Error(`FFmpeg failed with ${reason}${lastLine ? `: ${lastLine}` : ''}`));
    });
  });

/**
 * Build the FFmpeg arguments for a single encode.
 *
 * @param inputFilePath - Absolute input file path.
 * @param outputFilePath - Absolute output file path.
 * @param options - Encoder options.
 * @returns The argument array.
 */
export const buildFfmpegArgs = (
  inputFilePath: string,
  outputFilePath: string,
  options: string[]
): string[] => ['-y', '-i', inputFilePath, ...options, outputFilePath];

/**
 * A single output that could not be produced.
 */
export interface EncodeFailure {
  input: string;
  output: string;
  error: string;
}

/**
 * The outcome of a batch.
 */
export interface BatchResult {
  succeeded: string[];
  failed: EncodeFailure[];
}

/**
 * Encode every video in the input directory into every output variant.
 *
 * @param input - Absolute input directory.
 * @param output - Absolute output directory (must exist).
 * @param ffmpegPath - The FFmpeg executable.
 * @returns The produced outputs and the failures.
 */
export const processAllVideos = async (
  input: string,
  output: string,
  ffmpegPath: string
): Promise<BatchResult> => {
  const videoFiles = listVideoFiles(input);
  const result: BatchResult = { succeeded: [], failed: [] };

  for (const [index, videoFile] of videoFiles.entries()) {
    const inputFilePath = path.join(input, videoFile);
    const baseOutputFileName = path.join(output, videoFile.replace(/\.[^.]+$/, ''));

    for (const variant of OUTPUT_VARIANTS) {
      const outputFilePath = `${baseOutputFileName}${variant.suffix}`;
      console.log(
        `${index + 1} of ${videoFiles.length}: ${videoFile} (${variant.label}) -> ${outputFilePath}`
      );
      try {
        await runFfmpeg(
          ffmpegPath,
          buildFfmpegArgs(inputFilePath, outputFilePath, variant.options)
        );
        result.succeeded.push(outputFilePath);
      } catch (error) {
        if (error instanceof UsageError) {
          throw error;
        }
        result.failed.push({
          input: inputFilePath,
          output: outputFilePath,
          error: (error as Error).message
        });
        console.error(red(`Failed: ${outputFilePath}: ${(error as Error).message}`));
      }
    }
  }

  return result;
};

/**
 * Run the CLI.
 *
 * @param argv - Arguments without the node executable and script path.
 * @returns The process exit code: 0 when every output was produced, 1 otherwise.
 */
export const main = async (argv: string[]): Promise<number> => {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(USAGE);
      return 0;
    }
    if (!options.inputDirectory || !options.outputDirectory) {
      throw new UsageError('Input and output directories must be provided.');
    }

    const { input, output } = resolveDirectories(
      options.inputDirectory,
      options.outputDirectory
    );

    const videoFiles = listVideoFiles(input);
    if (videoFiles.length === 0) {
      throw new UsageError(
        `No ${VIDEO_EXTENSIONS.join('/')} files found in ${input}.`
      );
    }

    // Fail fast, before touching the output directory, if FFmpeg is missing.
    await runFfmpeg(options.ffmpegPath, ['-version'], true);

    prepareOutputDirectory(output, options.clean);

    const result = await processAllVideos(input, output, options.ffmpegPath);

    if (result.failed.length > 0) {
      console.error(
        red(
          `${result.failed.length} of ${
            result.failed.length + result.succeeded.length
          } outputs failed:`
        )
      );
      for (const failure of result.failed) {
        console.error(red(`  ${failure.output}: ${failure.error}`));
      }
      return 1;
    }

    console.log(green(`All ${result.succeeded.length} outputs created successfully.`));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(red(`Error: ${error.message}`));
      console.error(USAGE);
    } else {
      console.error(red(`Error: ${(error as Error).stack ?? error}`));
    }
    return 1;
  }
};
