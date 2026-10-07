# Preparation checks

The publication copy passed ESLint, TypeScript checking, Prisma schema validation, and a Next.js production build using webpack. These checks reused the existing local dependency installation; a clean dependency installation is delegated to the included GitHub Actions workflow, which has not yet run.

The source export excludes local environment files, database backups, runtime logs, recordings and virtual environments. Text was checked for common credential patterns; files were also checked against sensitive values in the original local environment, without printing those values. No matches were found. These checks do not guarantee the absence of every kind of sensitive information.

No live database migration, external provider request, end-to-end account flow, or model accuracy evaluation was performed. At the time of those preparation checks, no GitHub repository had been created.

## Documentation and artifact verification — 8 October 2026 (Cairo)

The English technical guide was checked against the actual inference script, analysis route, risk engine, authentication, chat, reminders, report sharing, Prisma schema and the Keras artifact. The generated implementation reference includes the complete saved layer settings and all API method declarations. Model bytes were not changed.

The artifact was successfully loaded using the existing local Python 3.10.12 environment with TensorFlow 2.17.1, Keras 3.12.2 and librosa 0.10.0. This is a compatibility check using an existing installation, not a fresh Python dependency installation.

Observed model input/output shapes were `(None, 128, 128, 3)` and `(None, 5)`. Parameter counts were 2,827,077 total, 2,291,781 trainable and 535,296 non-trainable.

A synthetic three-second, 440 Hz sine wave with amplitude 0.1 produced a `(128, 128, 3)` feature tensor with values spanning 0–1. Three calls on the same tensor with `training=False` produced identical score vectors in this runtime (maximum difference 0.0). This observation does not prove determinism for every runtime or training mode. The synthetic tone received a high class score despite not being an infant cry, illustrating why softmax confidence must not be interpreted as validated real-world reliability.

The CLI silence smoke check passed using a generated three-second silent WAV: `background`, confidence `1.0`, signal quality `low`. This confirms the amplitude-gate behavior, not classifier accuracy. Regenerating the implementation reference produced identical bytes, documentation file links resolved, and `git diff --check` passed. No real child recording or external service was used for these checks.

## GitHub publication verification

The initial publication to [E6i/babycare](https://github.com/E6i/babycare) was fetched back from GitHub and compared with the local publication copy. All 132 files matched, including the model blob.

[GitHub Actions run 37694134722](https://github.com/E6i/babycare/actions/runs/37694134722) could not start its job because GitHub reported an account billing lock. No CI steps executed. This is an account-level blocker, not a passing or failing application test result. The local preparation and model checks described above remain the available verification evidence.
