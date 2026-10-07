# Architecture

The `frontend` directory contains both the React interface and server-side Next.js route handlers. PostgreSQL persists accounts, child profiles, conversations, care records, reminders, reports and audit events through Prisma.

Authentication uses bcrypt password hashes and signed JWT sessions in HTTP-only cookies. Route handlers obtain the current user before accessing account-scoped records. These mechanisms are not a substitute for a dedicated security review before a public production deployment.

Audio requests pass through `/api/analyze` and invoke `scripts/infer_cry.py` using `PYTHON_BIN`. The Python process loads the repository's Keras model and returns classification information. The risk engine is separate application logic; it is not evidence of clinical validation.

Chat can call DeepSeek when configured. Email can call Resend when configured. Review these integrations and applicable user consent before sending real personal information to external providers.

Database migrations live in `frontend/prisma/migrations`. The repository contains structure and migration logic only, with no production database export.
