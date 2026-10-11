#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_child_process = require("child_process");
var inputDirectory;
var outputDirectory;
var ffmpegPath = "ffmpeg";
var VIDEO_EXTENSIONS = [".mp4", ".mov"];
var h264Options = [
  "-c:v",
  "libx264",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-vf",
  "scale=1920:1080"
  // 16:9 aspect ratio
];
var logMessage = (message) => {
  console.log(message);
};
var createDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
var run = async () => {
  if (!inputDirectory || !outputDirectory) {
    throw new Error("Input and output directories must be provided.");
  }
  const input = fs.realpathSync(inputDirectory);
  const requestedOutput = path.resolve(outputDirectory);
  let ancestor = requestedOutput;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const output = path.resolve(fs.realpathSync(ancestor), path.relative(ancestor, requestedOutput));
  const contains = (parent, child) => {
    const relative2 = path.relative(parent, child);
    return relative2 === "" || !relative2.startsWith(`..${path.sep}`) && relative2 !== ".." && !path.isAbsolute(relative2);
  };
  if (contains(input, output) || contains(output, input)) {
    throw new Error("Input and output directories must be separate and must not contain one another.");
  }
  if (!fs.statSync(input).isDirectory()) throw new Error("Input must be a directory.");
  inputDirectory = input;
  outputDirectory = output;
  createDir(output);
  await processAllVideos();
};
process.argv.forEach((arg, index, array) => {
  if (arg === "--inputDirectory" && array[index + 1]) {
    inputDirectory = array[index + 1];
  } else if (arg === "--outputDirectory" && array[index + 1]) {
    outputDirectory = array[index + 1];
  }
});
var vp9Options = [
  "-c:v",
  "libvpx-vp9",
  "-crf",
  "20",
  "-b:v",
  "0",
  "-b:a",
  "192k",
  "-vf",
  "scale=1920:1080"
  // 16:9 aspect ratio
];
var mobileOptions = [
  "-vf",
  "scale=640:480"
  // 4:3 aspect ratio for mobile
];
var processSingleVideo = async (videoFile, index, totalVideos) => {
  const inputFilePath = path.join(inputDirectory, videoFile);
  const baseOutputFileName = path.join(
    outputDirectory,
    videoFile.replace(/\.[^.]+$/, "")
  );
  const h264OptionsDesktop = [...h264Options];
  const vp9OptionsDesktop = [...vp9Options];
  const h264OptionsMobile = [...h264Options, ...mobileOptions];
  const vp9OptionsMobile = [...vp9Options, ...mobileOptions];
  try {
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-desktop.mp4`,
      h264OptionsDesktop,
      `${baseOutputFileName} ${index + 1} of ${totalVideos}: ${videoFile} (H.264 - Desktop)`
    );
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-desktop.webm`,
      vp9OptionsDesktop,
      `${baseOutputFileName} ${index + 1} of ${totalVideos}: ${videoFile} (VP9 - Desktop)`
    );
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-mobile.mp4`,
      h264OptionsMobile,
      `${baseOutputFileName} ${index + 1} of ${totalVideos}: ${videoFile} (H.264 - Mobile)`
    );
    await encodeVideoWithProgress(
      inputFilePath,
      `${baseOutputFileName}-mobile.webm`,
      vp9OptionsMobile,
      `${baseOutputFileName} ${index + 1} of ${totalVideos}: ${videoFile} (VP9 - Mobile)`
    );
    logMessage(`Versions created for ${videoFile}`);
  } catch (error) {
    throw new Error(`Error creating versions for ${videoFile}: ${String(error)}`);
  }
};
var encodeVideoWithProgress = async (inputFilePath, outputFilePath, options, progressMessage) => {
  console.log(progressMessage);
  return new Promise((resolve2, reject) => {
    const child = (0, import_child_process.spawn)(ffmpegPath, ["-nostdin", "-n", "-i", inputFilePath, ...options, outputFilePath], {
      shell: false,
      stdio: ["ignore", "inherit", "inherit"]
    });
    child.once("error", (error) => reject(new Error(`Unable to start FFmpeg: ${error.message}`)));
    child.once("close", (code, signal) => {
      if (code === 0) resolve2();
      else reject(new Error(`FFmpeg failed (${signal ?? `exit ${code}`}) for ${inputFilePath}`));
    });
  });
};
var processAllVideos = async () => {
  const videoFiles = fs.readdirSync(inputDirectory).filter((file) => VIDEO_EXTENSIONS.includes(path.extname(file).toLowerCase()) && fs.statSync(path.join(inputDirectory, file)).isFile());
  const totalVideos = videoFiles.length;
  if (!totalVideos) throw new Error("No MP4 or MOV input videos found.");
  const failures = [];
  for (let i = 0; i < totalVideos; i++) {
    const videoFile = videoFiles[i];
    try {
      await processSingleVideo(videoFile, i, totalVideos);
    } catch (error) {
      failures.push(String(error));
      console.error(String(error));
    }
  }
  if (failures.length) throw new Error(`${failures.length} of ${totalVideos} videos failed; completed outputs have been preserved.`);
  logMessage("All videos processed successfully!");
};
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: process-videos --inputDirectory <directory> --outputDirectory <directory>\nRequires FFmpeg on PATH. Existing output files are preserved; choose a new output directory for another run.");
} else {
  void run().catch((error) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
