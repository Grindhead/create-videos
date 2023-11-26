import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import * as rimraf from "rimraf";
import { exec } from "child_process";

/**
 * The directory containing input video files.
 */
const inputDirectory = "./src/Resources/Videos";

/**
 * The directory where processed videos will be saved.
 */
const outputDirectory = "./dist/videos";

/**
 * Path to the FFmpeg executable.
 */
const ffmpegPath = "ffmpeg";

/**
 * Allowed video file extensions.
 */
const VIDEO_EXTENSIONS = [".mp4", ".mov"];

/**
 * FFmpeg options for H.264 codec.
 */
const h264Options = ["-c:v", "libx264", "-c:a", "aac", "-b:a", "192k"];

/**
 * FFmpeg options for H.264 codec (Desktop version).
 */
const h264OptionsDesktop = [...h264Options];

/**
 * FFmpeg options for H.264 codec (Mobile version with 4:3 aspect ratio).
 */
const h264OptionsMobile = [...h264Options, "-vf", "scale=1920:1440"];

/**
 * FFmpeg options for VP9 codec (WebM format).
 */
const vp9Options = [
  "-c:v",
  "libvpx-vp9",
  "-crf",
  "20",
  "-b:v",
  "0",
  "-b:a",
  "192k",
  "-vf",
  "scale=1920:1080",
];

/**
 * Log a message with a specified color using chalk.
 * @param {string} message - The message to be logged.
 * @param {Function} color - The chalk color function to be applied to the message.
 */
const logMessage = (message, color) => {
  console.log(color(message));
};

/**
 * Create a directory at a given path if it does not exist.
 * @param {string} dir - The path of the directory to be created.
 */
const createDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
};

/**
 * Encode a video with FFmpeg and track progress using a Promise.
 * @param {string} inputFilePath - The path to the input video file.
 * @param {string} outputFilePath - The path to the output video file.
 * @param {string[]} options - Additional FFmpeg options.
 * @returns {Promise<void>} A Promise that resolves when the encoding is complete.
 */
const encodeVideoWithProgress = async (
  inputFilePath,
  outputFilePath,
  options
) => {
  const command = [
    ffmpegPath.replace(/\\/g, "/"),
    "-i",
    inputFilePath.replace(/\\/g, "/"),
    ...options,
    outputFilePath.replace(/\\/g, "/"),
  ].join(" ");

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`FFmpeg Error: ${error.message}`);
        console.error(`FFmpeg Output: ${stderr}`);
        reject(error.message);
      } else {
        console.log(`FFmpeg Output: ${stdout}`);
        resolve();
      }
    });
  });
};

/**
 * Encode all versions (H.264 desktop, H.264 mobile, VP9) of a given video file.
 * @param {string} videoFile - The name of the video file.
 * @returns {Promise<void>} A Promise that resolves when all versions are encoded.
 */
const encodeAllVersions = async (videoFile) => {
  const inputFilePath = path.join(inputDirectory, videoFile);
  const baseOutputFileName = path.join(
    outputDirectory,
    videoFile.replace(/\.[^.]+$/, "")
  );

  const tasks = [];

  // Create H.264 version for desktop (MP4) - 16:9 aspect ratio
  tasks.push(
    encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-h264-desktop.mp4`,
      h264OptionsDesktop
    )
  );

  // Create H.264 version for mobile (MP4) - 4:3 aspect ratio
  tasks.push(
    encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-h264-mobile.mp4`,
      h264OptionsMobile
    )
  );

  // Create VP9 version (WebM) - 16:9 aspect ratio (same as desktop) with improved quality
  tasks.push(
    encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-vp9.webm`,
      vp9Options
    )
  );

  try {
    await Promise.all(tasks);
    logMessage(`All versions created for ${videoFile}`, chalk.green);
  } catch (error) {
    logMessage(`Error creating versions for ${videoFile}: ${error}`, chalk.red);
  }
};

/**
 * Process all video files in the input directory by encoding all versions for each file.
 * @returns {Promise<void>} A Promise that resolves when all videos are processed.
 */
const processAllVideos = async () => {
  const videoFiles = fs
    .readdirSync(inputDirectory)
    .filter((file) => VIDEO_EXTENSIONS.includes(path.extname(file)));

  const tasks = videoFiles.map((videoFile) => encodeAllVersions(videoFile));

  try {
    await Promise.all(tasks);
    logMessage("All videos processed successfully!", chalk.green);
  } catch (error) {
    logMessage(`Error processing videos: ${error}`, chalk.red);
  }
};

/**
 * Run the video processing script.
 */
const run = () => {
  rimraf.sync(outputDirectory);

  createDir("./dist");
  createDir("./dist/videos");

  processAllVideos();
};

run();
