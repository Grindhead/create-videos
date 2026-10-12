---
'create-videos': major
---

Run FFmpeg without a shell so paths with spaces and shell metacharacters are passed literally; create the output directory recursively and no longer delete it (use `--clean` to empty it); reject an output directory that equals or contains the input; exit with code 1 and a failure summary when an encode fails; add a `create-videos` bin and drop the chalk/rimraf runtime imports.
