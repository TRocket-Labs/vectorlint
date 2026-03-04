# Setting up your workspace

This guide walks you through configuring your local development environment from scratch.

## Installing dependencies

Run the following command from your project root to install all required packages:

```bash
npm install
```

If you're using a monorepo setup, run this from the workspace root instead.

## Configuring Your Database

Before starting the application, you'll need a running database instance. The app connects to PostgreSQL by default.

Set the following environment variables:

- `DATABASE_URL` — full connection string
- `DB_POOL_SIZE` — number of concurrent connections (default: 5)

Restart the application after making changes to these values.

## Running the application

Start the development server with:

```bash
npm run dev
```

The server runs on port 3000 unless overridden by the `PORT` environment variable.

## Troubleshooting Common Errors

If the server fails to start, check that your database is reachable and the environment variables are set correctly. A missing `DATABASE_URL` is the most frequent cause.

For connection timeouts, increase the `DB_POOL_SIZE` value or inspect whether another process is holding open connections.

## Checking logs

Log output is written to stdout by default. To redirect logs to a file:

```bash
npm run dev > app.log 2>&1
```

## Configuring Authentication

The application uses token-based authentication. Tokens are issued on login and expire after 24 hours by default, configurable via `TOKEN_TTL`.

## Deploying to production

Production deployments require a `NODE_ENV=production` environment variable. The build process also requires the `BUILD_SECRET` to be set, which is available in your CI configuration.
