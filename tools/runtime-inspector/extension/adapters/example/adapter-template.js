/**
 * Runtime Inspector — Universal Application Adapter Template
 * Module: adapters/example/adapter-template.js
 *
 * Copy and customize this template for any new web application
 * (e.g. Restaurant SaaS, AR Fitting, E-commerce, SMS Intake, etc.).
 */

class ExampleAppAdapter {
  constructor() {
    this.id = 'example-app';
    this.name = 'Example Application Adapter';
    this.version = '1.0.0';
  }

  match(location) {
    // Return true if current domain/path belongs to this application
    return location.hostname.includes('example.com') || location.hostname.includes('example-dev');
  }

  getAppInfo() {
    return {
      appId: 'example-app',
      appName: 'Example Web Application',
      url: window.location.href,
      origin: window.location.origin,
      environment: window.location.hostname.includes('localhost') ? 'localhost' : 'production'
    };
  }

  getRuntimeState() {
    // Collect application-specific state (e.g., Redux store, user ID, current route, cart count)
    return {
      route: window.location.pathname,
      cartItemCount: 0,
      isUserLoggedIn: false
    };
  }

  getCustomProbes() {
    // Custom checks (frameworks, canvas, database sync, etc.)
    return {
      framework: window.React ? 'React' : (window.Vue ? 'Vue' : 'Vanilla')
    };
  }

  getActions(eventBus) {
    // Optional event listener attachments for key user workflows
    return null;
  }

  sanitize(data, redactionEngine) {
    // Custom redaction logic if app has unique secret patterns
    return redactionEngine.sanitizeObject(data);
  }

  summarize() {
    // 5-10 lines high-level summary for ChatGPT report
    return {
      APP_STATUS: 'OK',
      CURRENT_ROUTE: window.location.pathname
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ExampleAppAdapter };
} else {
  window.ExampleAppAdapter = ExampleAppAdapter;
}
