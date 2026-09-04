# App Adapter Authoring Guide

Runtime Inspector Core knows nothing about specific application domains. Custom domain knowledge lives entirely inside adapters.

## Adapter Interface

An adapter is a JavaScript class implementing the canonical interface:

```javascript
class MyNewAppAdapter {
  constructor() {
    this.id = 'my-app';
    this.name = 'My App Adapter';
    this.version = '1.0.0';
  }

  // Returns true if current domain belongs to this app
  match(location) {
    return location.hostname.includes('myapp.com');
  }

  // Universal app metadata
  getAppInfo() {
    return {
      appId: 'my-app',
      appName: 'My Application',
      url: window.location.href,
      environment: 'production'
    };
  }

  // Domain-specific state inspection
  getRuntimeState() {
    return {
      userRole: window.currentUser?.role,
      cartTotal: window.store?.cart?.total
    };
  }

  // Diagnostic summary for ChatGPT report
  summarize() {
    return {
      USER_LOGGED_IN: Boolean(window.currentUser),
      ACTIVE_TAB: window.currentTab
    };
  }
}
```
