# Monitoring and alerting

This guide covers how alerts are triggered, routed, and resolved in our infrastructure.

## How alerts are triggered

Alerts are triggered by threshold violations in our metrics pipeline. When CPU usage exceeds 90% for more than 5 minutes, an alert fires. When memory usage crosses the configured limit, the alert system notifies the on-call engineer.

Alerts are routed based on team ownership defined in the service catalog. Each service is owned by exactly one team.

## Log storage

Logs are stored in object storage and retained for 90 days. After 90 days, logs are archived to cold storage automatically. Archived logs are accessible on request.

## Certificate renewal

TLS certificates are renewed automatically by the platform 30 days before expiry. If renewal fails, an alert is sent to the platform team. Certificates issued before 2023 are not covered by automatic renewal and must be rotated manually.

## Build artifacts

Build artifacts are stored in the artifact registry after each successful CI run. Artifacts older than 60 days are deleted by the cleanup job. Artifacts marked as release candidates are retained indefinitely.

## Database backups

Backups are taken every 6 hours and stored in a separate region. Point-in-time recovery is supported for the last 7 days. Older backups are retained in cold storage for compliance purposes.
