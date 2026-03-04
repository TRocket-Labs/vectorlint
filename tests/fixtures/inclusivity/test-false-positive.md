# Managing your team

This guide covers how to onboard new members, set expectations, and handle escalations.

## Onboarding a new engineer

Our CTO, Maria, leads all new engineer onboarding. She runs a two-hour session on the first day covering architecture, tooling, and team norms. Her sessions are recorded and available for async review.

For engineers who join remotely, they should complete the self-paced setup checklist before their first standup. Each person on the team is paired with a buddy for their first two weeks.

## Support team structure

Our support team includes on-call engineers, incident coordinators, and a rotating escalation lead. Staffing is managed through PagerDuty.

If no one is available in the primary rotation, the backup coordinator receives the page.

## Working with managed services

When using managed Kubernetes or managed PostgreSQL, the underlying infrastructure is handled automatically. You don't need to provision or patch the nodes directly.

The platform is designed to be operated by a small team without specialized infrastructure expertise.

## Escalation policy

When an incident is escalated, the on-call engineer is responsible for the incident channel until resolution. Every engineer on the team is expected to be reachable during their shift.

Humanity-wide reliability standards don't apply here — we aim for 99.9% uptime across all environments.
