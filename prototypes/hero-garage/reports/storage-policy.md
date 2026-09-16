# Asset storage

Original concept references stay in assets/design/hero-targets. Run tools/prepare-references.mjs to copy them for serving; generated public copies are ignored and hashes are recorded. No duplicate authoritative source images.

Source downloads and intermediate source archives stay ignored under art/sources/downloads. Personal-use assets whose terms prohibit redistribution stay under ignored art/sources/local-only; document their source, terms and reacquisition steps without committing the restricted bytes. Do not publish a preview containing restricted assets without checking its terms.

Keep a single current editable Blender source and runtime candidate per accepted correction, with hashes and provenance. Aim to keep tracked prototype asset/source additions below 100 MiB; inspect size before commits. Rejected large candidates can stay ignored locally with report hashes rather than accumulating in git. Evidence clips are short, compressed, real browser recordings; retain the camera/time recipe and report alongside them. Final sources must remain editable; export scripts supplement rather than replace the source.
