# Developer quickstart

This guide is written for developers integrating the API. Their end customers will interact with the product through the developer's application — not directly.

## Authentication

You authenticate with the API using a bearer token. Generate a token from the dashboard under API Settings. Tokens expire after 30 days.

When your users log into your application, you exchange their session for a scoped token. This keeps your credentials separate from theirs.

## Webhooks

Configure webhooks from the Integrations page. You provide the endpoint URL; we send events to it. Your server must respond with a 200 within 5 seconds, otherwise we retry with exponential backoff.

Webhook payloads use the same GitHub webhook format for event naming conventions. Review the GitHub documentation for field reference.

## Rate limits

Requests are rate-limited per API key. You can check your current usage in the dashboard. If users in your application generate high request volumes, consider caching responses client-side.

## SDKs

We maintain official SDKs for TypeScript, Python, and Go. Each SDK wraps the REST API and handles authentication, retries, and error parsing. Install the SDK via your package manager.

Community SDKs exist for Java and Ruby. We don't maintain those, but we review and link to them in our documentation.
