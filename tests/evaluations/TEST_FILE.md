# Welcome to ReadMe

Welcome to your new developer hub—AI-powered, Git-backed, and built to help your docs evolve with your product.

You’re looking at a starter page we included to help you get started. Feel free to treat this as your first doc by hitting **Edit** at the top to make it your own, or delete it to start fresh.

***

## ✍️ Write Docs with Components & Guides

Start by creating <Anchor label="**Guides**" target="_blank" href="https://docs.readme.com/main/docs/creating-and-managing-guides">**Guides**</Anchor> - your API's instruction manual where you can walk users through key concepts, tutorials, or best practices.

With ReadMe's MDX editor, you can combine Markdown and custom JSX components like `<Card>`, `<Tab>`, and `<Accordion>` for richer content and better structure.

You can even [build your own custom **Components**](/docs/getting-started#/settings/custom-components/start) to reuse across your docs.

<Cards columns={3}>
  <Card title="Explore the Component Marketplace" href="https://github.com/readmeio/marketplace/tree/main/components" icon="fa-store" target="_blank">
    Drop in and customize components.
  </Card>

  <Card title="MDX (Markdown + JSX)" href="https://docs.readme.com/main/docs/mdx" icon="fa-code">
    Learn more about MDX to build interactive components.
  </Card>

  <Card title="Custom MDX Components" href="https://docs.readme.com/main/docs/building-custom-mdx-components" icon="fa-wrench">
    Build your own components to reuse anywhere.
  </Card>
</Cards>

Looking for a branded entry point? Enable a <Anchor label="Landing Page" target="_blank" href="https://docs.readme.com/main/docs/landing-page">Landing Page</Anchor> to welcome your developers and direct them to key docs.

***

## 🤖 Add AI to Your Dev Hub

AI is built into ReadMe to help you and your users move faster. Slide the panel open by hitting **:sparkles:AI** in your top navigation bar.

* **AI Agent**
  Our built-in AI agent is your sidekick for drafting documentation, translating pages, and applying style guides.
* **MCP Server**
  Generate an **MCP** server to convert your API documentation into a structured resource that AI assistants can understand and interact with programmatically.
* **AI-Powered Search**
  Enable AI Search to help developers ask questions about your product and instantly receive an answer.
* **Open in Other AI Services**
  Let your developers open your docs in tools like ChatGPT, Claude, or other LLMs, using context from your API and `llms.txt` configuration.

***

## 🌿 Edit, Preview, and Publish in Branches

<Anchor label="Branches" target="_blank" href="https://docs.readme.com/main/docs/branches">Branches</Anchor> bring Git-style workflows to your documentation process. Use them to:

* Draft changes across multiple pages without publishing immediately
* Review and preview updates before they go live
* Share edits with teammates for feedback
* Safely iterate without disrupting your production docs

You can create a branch directly from the Versions & Branches menu, save edits into a new branch, or sync with GitHub and automatically reflect branches across both platforms.

Once you're ready, merge the branch back into a live version. Enterprise plans can control who has merge access, and you’ll always get a conflict check before merging.

***

## 🔁 Sync with Git

Whether you write docs in ReadMe's editor or your local dev environment, ReadMe fits into your workflow:

* [Bi-Directional Sync with GitHub](https://docs.readme.com/main/docs/bi-directional-sync)
  Connect a GitHub repo to your project and work in branches. Changes in Git or ReadMe will stay in sync—perfect for staging and code review workflows.
* **Sync Your OpenAPI Files**
  Use [`rdme`](https://docs.readme.com/docs/rdme#upload) or the ReadMe API to push your OpenAPI spec and keep your API Reference up to date automatically.

***

## 👀 Understand Your Developers

Want to know how developers are actually using your API and docs?

* <Anchor label="My Developers" target="_blank" href="https://docs.readme.com/main/docs/developer-dashboard">My Developers</Anchor> gives you real-time visibility into who is visiting your docs, what endpoints they’re using, and where they’re getting stuck.
* Segment usage by key users or cohorts to monitor engagement and spot issues before they turn into support tickets.
* To set up My Developers, you'll first authenticate logged-in users with the <Anchor label="Personalized Docs Webhook" target="_blank" href="https://docs.readme.com/main/docs/personalized-docs-webhook">Personalized Docs Webhook</Anchor>, then integrate the [Metrics SDK](https://docs.readme.com/main/docs/sending-api-logs) to send API logs to ReadMe.

***

## 🚀 Next Steps

* Start writing: create your first Guide or sync in your OAS file.
* [Connect GitHub for bi-directional sync](/docs/getting-started#/settings/git-connection/github).
* Set up your <Anchor label="MCP server" target="_blank" href="https://docs.readme.com/main/docs/mcp-servers">MCP server</Anchor>.
* Visit **My Developers** in the top navigation bar to start understanding your audience.

***

<Callout icon="💼" theme="default">
  Need support for multiple products, advanced permissions, or deeper customization?\
  Our enterprise features are built for teams managing business-critical APIs at scale. [Let's talk.](mailto:growth@readme.io)
</Callout>

## 💬 Need Help?

Our team is here to support you. If you get stuck, [email us](mailto:support@readme.io) or open the Intercom widget on any page to chat with someone from our team. We've also got a <Anchor label="Slack community" target="_blank" href="https://readme.com/slack">Slack community</Anchor> if you want to say hi to the team and connect with other ReadMe users!