"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const rimraf = __importStar(require("rimraf"));
const child_process_1 = require("child_process");
const inputDirectory = './src/Resources/Videos';
const outputDirectory = './dist/videos';
const ffmpegPath = 'ffmpeg';
const VIDEO_EXTENSIONS = ['.mp4', '.mov'];
const h264Options = [
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-b:a',
    '192k'
];
const h264OptionsDesktop = [...h264Options];
const h264OptionsMobile = [...h264Options, '-vf', 'scale=1920:1440'];
const vp9Options = [
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '20',
    '-b:v',
    '0',
    '-b:a',
    '192k',
    '-vf',
    'scale=1920:1080'
];
const logMessage = (message, color) => {
    console.log(color(message));
};
const createDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
};
const encodeVideoWithProgress = async (inputFilePath, outputFilePath, options) => {
    const command = [
        ffmpegPath.replace(/\\/g, '/'),
        '-i',
        inputFilePath.replace(/\\/g, '/'),
        ...options,
        outputFilePath.replace(/\\/g, '/')
    ].join(' ');
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`FFmpeg Error: ${error.message}`);
                console.error(`FFmpeg Output: ${stderr}`);
                reject(error.message);
            }
            else {
                console.log(`FFmpeg Output: ${stdout}`);
                resolve();
            }
        });
    });
};
const encodeAllVersions = async (videoFile) => {
    const inputFilePath = path.join(inputDirectory, videoFile);
    const baseOutputFileName = path.join(outputDirectory, videoFile.replace(/\.[^.]+$/, ''));
    const tasks = [];
    tasks.push(encodeVideoWithProgress(inputFilePath, `${baseOutputFileName}-h264-desktop.mp4`, h264OptionsDesktop));
    tasks.push(encodeVideoWithProgress(inputFilePath, `${baseOutputFileName}-h264-mobile.mp4`, h264OptionsMobile));
    tasks.push(encodeVideoWithProgress(inputFilePath, `${baseOutputFileName}-vp9.webm`, vp9Options));
    tasks.push(encodeVideoWithProgress(inputFilePath, `${baseOutputFileName}-mp4-mobile.mp4`, h264OptionsMobile));
    try {
        await Promise.all(tasks);
        logMessage(`All versions created for ${videoFile}`, chalk_1.default.green);
    }
    catch (error) {
        logMessage(`Error creating versions for ${videoFile}: ${error}`, chalk_1.default.red);
    }
};
const processAllVideos = async () => {
    const videoFiles = fs
        .readdirSync(inputDirectory)
        .filter((file) => VIDEO_EXTENSIONS.includes(path.extname(file)));
    const tasks = videoFiles.map((videoFile) => encodeAllVersions(videoFile));
    try {
        await Promise.all(tasks);
        logMessage('All videos processed successfully!', chalk_1.default.green);
    }
    catch (error) {
        logMessage(`Error processing videos: ${error}`, chalk_1.default.red);
    }
};
const run = () => {
    rimraf.sync(outputDirectory);
    createDir('./dist');
    createDir('./dist/videos');
    processAllVideos();
};
run();
//# sourceMappingURL=index.js.map