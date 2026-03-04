# Platform capabilities

This document describes what our platform supports and how we've scaled it over time.

## Scale and reliability

We processed over 12 million API requests last month across all regions. Our uptime was 99.97% in Q1, measured against our published SLA. We support 60+ integrations with third-party tools.

Our infrastructure team reduced average incident response time from 18 minutes to 6 minutes over the past year by investing in better alerting and runbook automation.

## Supported file formats

The platform accepts CSV, JSON, NDJSON, and Parquet. We added Parquet support in version 3.2 in response to customer requests from data engineering teams.

## How we handle security

We completed our SOC 2 Type II audit in November 2024. Our penetration test report is available to enterprise customers under NDA. We rotate all service credentials every 90 days as part of our key management policy.

## Pricing model

Our pricing is based on monthly active users and storage consumed. We offer a flat-rate plan for teams under 10 seats and a usage-based plan for larger organizations. Detailed pricing is available on our website.

## Integration ecosystem

We maintain official SDKs for Python, TypeScript, and Go. Community-maintained SDKs exist for Ruby and Java, though we don't provide support for those directly.
