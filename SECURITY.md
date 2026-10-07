# Security and private data

Never commit `.env`, service credentials, database backups, user records, child recordings, or production logs. `.env.example` contains placeholders only. `.gitignore` is preventive and does not remove secrets from existing Git history.

Before each push, inspect staged changes and run a secret scanner. If a credential has been exposed, revoke or rotate it with its provider; deleting the file is insufficient.

Do not report vulnerabilities through public issues containing credentials or personal data. Use GitHub private vulnerability reporting if the repository owner enables it, or contact the owner privately.

This educational application has not undergone a full security or clinical audit. Use synthetic records for demonstrations and screenshots.
