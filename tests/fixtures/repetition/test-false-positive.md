# Components reference

This reference documents all available components in the design system.

## Button component

The Button component is the primary interactive element. Use the Button component when you need users to trigger an action. The Button component supports three sizes: small, medium, and large.

Each Button variant maps to a semantic purpose:
- **Primary** — for the main call to action
- **Secondary** — for supporting actions
- **Destructive** — for irreversible actions like deletion

## Modal component

The Modal component overlays content on top of the current view. Use the Modal component for confirmations, forms, and alerts that require user attention before continuing.

## Form component

The Form component wraps input fields and handles validation state. Use the Form component to group related inputs and manage submission logic.

## API connection behavior

When the client connects, the server validates the token. If validation fails, the server closes the connection and returns a 401. If validation succeeds, the server issues a session and the client proceeds.

The connection lifecycle is managed automatically. You don't need to manually handle reconnection unless you're implementing a custom transport layer.
