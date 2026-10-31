# Security

There is no released reader or hosted service yet. Do not put real credentials or private books into experimental integrations.

For a vulnerability, use GitHub's private vulnerability reporting on this repository when available. Do not publish secrets or exploit details in public issues. If private reporting is unavailable, open a minimal issue asking maintainers to arrange a private channel without including the vulnerability details. Maintainers should confirm the channel before sensitive material is sent.

Future imports must be treated as untrusted data: constrain archive extraction, sandbox document rendering, disable unsolicited network/script execution, and validate all native bridges. Book text must never become agent instructions. Provider secrets must not be exposed to document WebViews or logs. These are requirements, not claims that a parser or integration already enforces them.
