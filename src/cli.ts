#!/usr/bin/env node
import { main } from './index';

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
