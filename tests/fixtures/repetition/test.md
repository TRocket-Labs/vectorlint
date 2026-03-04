# Deploying your application

This guide covers the deployment workflow, configuration, and common failure scenarios.

## Before you begin

Before deploying, you should make sure your environment variables are correctly set. You can verify this by running the health check endpoint. Users can configure deployment settings in the dashboard, but you need admin access to trigger a production release.

Make sure you check the deployment checklist before you deploy. You should also make sure that your team has reviewed the changeset. Additionally, be sure to make sure the staging environment has passed all tests before proceeding.

## Rollback procedure

If a deployment fails, the deployment should be rolled back immediately. If a deployment fails, the on-call engineer is responsible for initiating the rollback. Rollbacks can be triggered from the dashboard.

When a deployment fails, you should check the logs. Check the logs to understand what went wrong. Logs are available in the observability dashboard, where you can review the logs from the last 30 deployments.

## Configuration management

Configuration is stored in environment variables. Configuration is updated via the CLI. If configuration is missing, the application will fail to start. Changes to configuration require a restart to take effect. Configuration values are validated at startup.

## Error handling

Errors during deployment are logged automatically. Most errors are caused by misconfigured environment variables or connectivity issues with downstream services.
