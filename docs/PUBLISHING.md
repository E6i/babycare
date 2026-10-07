# Repository and publication workflow

The target repository is [E6i/babycare](https://github.com/E6i/babycare), created by the owner. It contains the publication copy of the application, model, English technical documentation, database migrations, and CI configuration once the initial upload completes.

For subsequent changes, clone the repository and use a branch and pull request:

```bash
git clone https://github.com/E6i/babycare.git
cd babycare
git switch -c describe-your-change
```

Run the checks in the README before submitting application changes. Regenerate the exact model/source reference with `python3 ml/inspect_artifact.py` when its inputs change. The GitHub Actions workflow runs frontend dependency installation, Prisma validation, lint, type checking, and a production build.

Uploading this repository does not deploy the application or configure PostgreSQL, Python, FFmpeg, secrets, email delivery, or external chat services. See the README and detailed technical guide for operation.
