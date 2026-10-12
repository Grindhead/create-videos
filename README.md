# Video Processing Script

This script automates the video encoding process using FFmpeg to create multiple versions of input videos. It includes configurations for H.264, and VP9 (WebM) formats for desktop (16:9) and mobile (4:3).

## Requirements

- [Node.js](https://nodejs.org/) (version 21.2 or higher)
- [FFmpeg](https://www.ffmpeg.org/) installed and available in the system's PATH.

## Installation

```bash
pnpm install

Build & Publish to NPM
Follow these steps to create a build and publish it to NPM:

Step 1: Update the Project
Run: pnpm run update

This updates the project package.json version number using semantic versioning and generates a file documenting changes.

Step 2: Create a Release Pull Request
Create a pull request against the main branch.

Step 3: Automated Deployment
Once the PR is approved, GitHub will create a new release PR. Once the release PR is approved, GitHub will automatically deploy to NPM.

Available Commands
pnpm run build:
Generates a production build in the dist directory.

pnpm run update:
Updates the project using semver and generates a change documentation file. Do this before pushing changes to git. It automatically updates the version number.

pnpm run docs:
Generates documentation in dist/docs.

pnpm run lint:
Runs ESLint over the codebase.

pnpm ci:
Publishes the package to NPM. This task is called by GitHub and should not be invoked directly.
```

## Process videos

Build the checked-out source, then pass separate input and output directories:

```bash
pnpm install
pnpm build
node dist/index.js --inputDirectory "./source videos" --outputDirectory "./encoded/videos"
```

The installed package exposes `process-videos`; run `process-videos --help` for usage.
FFmpeg must be available on PATH. Custom output directories are created recursively.
Existing files are preserved: an existing generated filename fails that conversion.
Choose a fresh output directory to encode another batch. Input and output directories
must not be equal or contain one another, including through symlinks. Failed batches
return a nonzero exit status and retain successfully encoded outputs.
