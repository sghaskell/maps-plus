/*
 * This is a temporary file to expose the current theme on splunk. Once the function is
 * exposed via Splunk Enterprise, we will remove and replace it.
 */
define([], function () {

    var defaultTheme = 'light';

    // Resolution order:
    //  1. window.__splunk_page_theme__ (set on classic Splunk pages)
    //  2. <meta name="color-scheme"> (present in the Dashboard Studio iframe head)
    //  3. requirejs script path containing /custom_viz/dark/ (Dashboard Studio)
    //  4. defaultTheme
    var getCurrentTheme = function() {
      try {
        if (window.__splunk_page_theme__) {
          return window.__splunk_page_theme__;
        }
      } catch (e) { /* ignore */ }

      try {
        var meta = document.querySelector('meta[name="color-scheme"]');
        var scheme = meta && meta.getAttribute('content');
        if (scheme === 'dark' || scheme === 'light') {
          return scheme;
        }
      } catch (e) { /* ignore */ }

      try {
        var metas = document.querySelectorAll('meta[name="custom-viz-requirejs-script"]');
        for (var i = 0; i < metas.length; i++) {
          var content = metas[i].getAttribute('content') || '';
          if (content.indexOf('/custom_viz/dark/') !== -1) {
            return 'dark';
          }
        }
      } catch (e) { /* ignore */ }

      return defaultTheme;
    };

    return {
      getCurrentTheme: getCurrentTheme
    };
});