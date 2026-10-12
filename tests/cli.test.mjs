import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const cli = resolve('dist/index.js');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'video-cli-'));
  const input = join(root, 'input');
  const output = join(root, 'nested', 'output');
  const bin = join(root, 'bin');
  mkdirSync(input); mkdirSync(bin);
  writeFileSync(join(bin, 'ffmpeg'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FFMPEG_LOG, JSON.stringify(args)+'\\n');
if (process.env.FFMPEG_FAIL) process.exit(3);
if (process.env.FFMPEG_SKIP_WRITE) process.exit(0);
process.stderr.write('x'.repeat(1100000));
const output = args.at(-1);
if (fs.existsSync(output)) process.exit(1);
fs.writeFileSync(output, process.env.FFMPEG_EMPTY ? '' : 'encoded');
`, {mode: 0o755});
  const env = {...process.env, PATH: `${bin}:${process.env.PATH}`, FFMPEG_LOG: join(root, 'calls.jsonl')};
  const run = (extra = {}) => spawnSync(process.execPath, [cli, '--inputDirectory', input, '--outputDirectory', output], {encoding:'utf8', maxBuffer: 16 * 1024 * 1024, env: {...env,...extra}});
  return {root,input,output,env,run,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('usage runs without input or runtime modules', () => {
  const result = spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'});
  assert.equal(result.status,0); assert.match(result.stdout,/Usage:/);
});
test('literal filenames, nested output, streamed progress and unrelated files', () => {
  const f=fixture(); try {
    const name = 'clip space\'";$(touch injected).mp4';
    writeFileSync(join(f.input,name),'source');
    mkdirSync(f.output,{recursive:true}); writeFileSync(join(f.output,'keep.txt'),'keep');
    const result=f.run(); assert.equal(result.status,0,result.stderr.slice(-1000));
    const calls=readFileSync(f.env.FFMPEG_LOG,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.length,4); for(const args of calls) {
      assert.equal(args[args.indexOf('-i')+1],join(f.input,name));
      assert.ok(args.includes('-n')); assert.ok(existsSync(args.at(-1)));
    }
    assert.equal(readFileSync(join(f.output,'keep.txt'),'utf8'),'keep');
    assert.equal(readFileSync(join(f.input,name),'utf8'),'source');
    assert.equal(existsSync(join(f.root,'injected')),false);
    assert.match(result.stdout,/All videos processed successfully/);
    const again=f.run(); assert.equal(again.status,1); assert.match(again.stderr,/1 of 1 videos failed/);
  } finally {f.cleanup();}
});
test('failed conversion reports failure and returns a nonzero status',()=>{
  const f=fixture(); try {writeFileSync(join(f.input,'test.mp4'),'source');const r=f.run({FFMPEG_FAIL:'yes'});assert.equal(r.status,1);assert.match(r.stderr,/exit 3/);assert.doesNotMatch(r.stdout,/All videos processed successfully/);} finally {f.cleanup();}
});
test('existing generated paths fail before starting FFmpeg, including dangling symlinks',()=>{
  const f=fixture();try {
    writeFileSync(join(f.input,'test.mp4'),'source');
    mkdirSync(f.output,{recursive:true});
    const generated=join(f.output,'test-desktop.mp4');
    for(const isSymlink of [false,true]) {
      if(isSymlink) symlinkSync(join(f.root,'missing-target'),generated);
      else writeFileSync(generated,'preserved');
      const r=f.run();assert.equal(r.status,1);assert.match(r.stderr,/Output already exists/);
      assert.match(r.stderr,/1 of 1 videos failed/);assert.equal(existsSync(f.env.FFMPEG_LOG),false);
      if(!isSymlink) assert.equal(readFileSync(generated,'utf8'),'preserved');
      rmSync(generated);
    }
  } finally {f.cleanup();}
});
test('zero FFmpeg exit without a completed output fails the batch',()=>{
  for(const env of [{FFMPEG_SKIP_WRITE:'yes'},{FFMPEG_EMPTY:'yes'}]) {
    const f=fixture();try {
      writeFileSync(join(f.input,'test.mp4'),'source');
      const r=f.run(env);assert.equal(r.status,1);assert.match(r.stderr,/FFmpeg did not create a nonempty output/);
      assert.match(r.stderr,/1 of 1 videos failed/);assert.doesNotMatch(r.stdout,/All videos processed successfully/);
    } finally {f.cleanup();}
  }
});
test('rejects equal, nested and symlink-aliased input/output before conversion',()=>{
  const f=fixture();try {
    writeFileSync(join(f.input,'test.mp4'),'source');
    const alias=join(f.root,'alias');symlinkSync(f.input,alias);
    for(const output of [f.input,join(f.input,'child'),f.root,join(alias,'child')]) {
      const r=spawnSync(process.execPath,[cli,'--inputDirectory',f.input,'--outputDirectory',output],{encoding:'utf8',env:f.env});
      assert.equal(r.status,1);assert.match(r.stderr,/must be separate/);
    }
    assert.equal(readFileSync(join(f.input,'test.mp4'),'utf8'),'source');assert.equal(existsSync(f.env.FFMPEG_LOG),false);
  } finally {f.cleanup();}
});
test('missing input and empty input are actionable failures',()=>{
  const f=fixture();try {
    const empty=f.run();assert.equal(empty.status,1);assert.match(empty.stderr,/No MP4 or MOV/);
    rmSync(f.input,{recursive:true});const missing=f.run();assert.equal(missing.status,1);assert.match(missing.stderr,/ENOENT/);
  } finally {f.cleanup();}
});
test('missing FFmpeg is an actionable failure',()=>{
  const f=fixture();try {
    writeFileSync(join(f.input,'test.mp4'),'source');
    const r=f.run({PATH:join(f.root,'absent')});assert.equal(r.status,1);assert.match(r.stderr,/Unable to start FFmpeg/);
  } finally {f.cleanup();}
});
