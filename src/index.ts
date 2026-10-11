#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * The directory containing input video files.
 */
let inputDirectory: string | undefined;

/**
 * The directory where processed videos will be saved.
 */
let outputDirectory: string | undefined;

/**
 * Path to the FFmpeg executable.
 *
 * @remarks
 * Default value: 'ffmpeg'.
 */
const ffmpegPath = 'ffmpeg';

/**
 * Allowed video file extensions.
 *
 * @remarks
 * Default value: ['.mp4', '.mov'].
 */
const VIDEO_EXTENSIONS: string[] = ['.mp4', '.mov'];

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
 * Log a message with a specified color using chalk.
 *
 * @param message - The message to be logged.
 * @param color - The chalk color function to be applied to the message.
 */
const logMessage = (message: string): void => {
  console.log(message);
};

/**
 * Create a directory at a given path if it does not exist.
 *
 * @param dir - The path of the directory to be created.
 */
const createDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/**
 * Run the video processing script.
 *
 * @remarks
 * This function is the entry point of the script.
 */
const run = async (): Promise<void> => {
  // Ensure inputDirectory and outputDirectory are set
  if (!inputDirectory || !outputDirectory) {
    throw new Error('Input and output directories must be provided.');
  }

  const input = fs.realpathSync(inputDirectory);
  const requestedOutput = path.resolve(outputDirectory);
  // Resolve existing ancestors so a symlink cannot conceal overlapping paths.
  let ancestor = requestedOutput;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const output = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, requestedOutput));
  const contains = (parent: string, child: string): boolean => {
    const relative = path.relative(parent, child);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  };
  if (contains(input, output) || contains(output, input)) {
    throw new Error('Input and output directories must be separate and must not contain one another.');
  }
  if (!fs.statSync(input).isDirectory()) throw new Error('Input must be a directory.');
  inputDirectory = input;
  outputDirectory = output;
  createDir(output);
  await processAllVideos();
};

/**
 * Parse command-line options.
 */
process.argv.forEach((arg, index, array) => {
  if (arg === '--inputDirectory' && array[index + 1]) {
    inputDirectory = array[index + 1];
  } else if (arg === '--outputDirectory' && array[index + 1]) {
    outputDirectory = array[index + 1];
  }
});

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
 * Encode H.264 (MP4) and VP9 (WebM) versions of a given video file.
 *
 * @param videoFile - The name of the video file.
 * @param index - The index of the video file in the list of all video files.
 * @param totalVideos - The total number of videos to process.
 * @returns A Promise that resolves when both versions are encoded.
 */
const processSingleVideo = async (
  videoFile: string,
  index: number,
  totalVideos: number
): Promise<void> => {
  const inputFilePath = path.join(inputDirectory as string, videoFile);
  const baseOutputFileName = path.join(
    outputDirectory as string,
    videoFile.replace(/\.[^.]+$/, '')
  );

  const h264OptionsDesktop = [...h264Options];
  const vp9OptionsDesktop = [...vp9Options];
  const h264OptionsMobile = [...h264Options, ...mobileOptions];
  const vp9OptionsMobile = [...vp9Options, ...mobileOptions];

  try {
    // Create H.264 version (MP4) - 16:9 aspect ratio for desktop
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-desktop.mp4`,
      h264OptionsDesktop,
      `${baseOutputFileName} ${
        index + 1
      } of ${totalVideos}: ${videoFile} (H.264 - Desktop)`
    );

    // Create VP9 version (WebM) - 16:9 aspect ratio for desktop
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-desktop.webm`,
      vp9OptionsDesktop,
      `${baseOutputFileName} ${
        index + 1
      } of ${totalVideos}: ${videoFile} (VP9 - Desktop)`
    );

    // Create H.264 version (MP4) - 4:3 aspect ratio for mobile
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-mobile.mp4`,
      h264OptionsMobile,
      `${baseOutputFileName} ${
        index + 1
      } of ${totalVideos}: ${videoFile} (H.264 - Mobile)`
    );

    // Create VP9 version (WebM) - 4:3 aspect ratio for mobile
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-mobile.webm`,
      vp9OptionsMobile,
      `${baseOutputFileName} ${
        index + 1
      } of ${totalVideos}: ${videoFile} (VP9 - Mobile)`
    );

    logMessage(`Versions created for ${videoFile}`);
  } catch (error) {
    throw new Error(`Error creating versions for ${videoFile}: ${String(error)}`);
  }
};

/**
 * Encode a video with FFmpeg and track progress using a Promise.
 *
 * @param inputFilePath - The path to the input video file.
 * @param outputFilePath - The path to the output video file.
 * @param options - Additional FFmpeg options.
 * @param progressMessage - The progress message to display.
 * @returns A Promise that resolves when the encoding is complete.
 */
const encodeVideoWithProgress = async (
  inputFilePath: string,
  outputFilePath: string,
  options: string[],
  progressMessage: string
): Promise<void> => {
  console.log(progressMessage);
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-nostdin', '-n', '-i', inputFilePath, ...options, outputFilePath], {
      shell: false,
      stdio: ['ignore', 'inherit', 'inherit']
    });
    child.once('error', (error) => reject(new Error(`Unable to start FFmpeg: ${error.message}`)));
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (${signal ?? `exit ${code}`}) for ${inputFilePath}`));
    });
  });
};

/**
 * Process all video files in the input directory by encoding H.264 and VP9 versions for each file.
 *
 * @returns A Promise that resolves when all videos are processed.
 */
const processAllVideos = async (): Promise<void> => {
  const videoFiles = fs
    .readdirSync(inputDirectory as string)
    .filter((file) => VIDEO_EXTENSIONS.includes(path.extname(file).toLowerCase()) && fs.statSync(path.join(inputDirectory as string, file)).isFile());

  const totalVideos = videoFiles.length;

  if (!totalVideos) throw new Error('No MP4 or MOV input videos found.');
  const failures: string[] = [];
  for (let i = 0; i < totalVideos; i++) {
    const videoFile = videoFiles[i] as string;
    try {
      await processSingleVideo(videoFile, i, totalVideos);
    } catch (error) {
      failures.push(String(error));
      console.error(String(error));
    }
  }

  if (failures.length) throw new Error(`${failures.length} of ${totalVideos} videos failed; completed outputs have been preserved.`);
  logMessage('All videos processed successfully!');
};

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: process-videos --inputDirectory <directory> --outputDirectory <directory>\nRequires FFmpeg on PATH. Existing output files are preserved; choose a new output directory for another run.');
} else {
  void run().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
