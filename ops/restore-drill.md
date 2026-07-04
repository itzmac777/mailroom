# Restore Drill

Run this monthly on a staging VPS, not on production.

1. Provision a clean Ubuntu LTS host.
2. Install Docker and Docker Compose.
3. Copy the latest encrypted backup to the host.
4. Decrypt it with the offline backup key.
5. Restore the portal `data/` directory and Mailu root directory.
6. Start Mailu and the portal with staging hostnames.
7. Confirm an existing mailbox can log in and old mail is present.
8. Send one internal test email and one external test email.
9. Record the restore duration and any manual steps.
