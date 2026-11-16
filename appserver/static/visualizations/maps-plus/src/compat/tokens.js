'use strict'

// Set dashboard tokens. Classic dashboards expose the splunkjs global; Dashboard Studio
// sandboxes the viz in an iframe without it, so fall back to a FIELD_VALUE_DRILLDOWN that
// Studio maps with drilldown.setToken (key: "row.<token>.value").
// deps = { splunkjs, FIELD_VALUE_DRILLDOWN } is supplied by the caller (keeps this testable).
function setTokens(viz, tokens, originalEvent, deps) {
    deps = deps || {}
    var sjs = deps.splunkjs
    if (sjs && sjs.mvc && sjs.mvc.Components) {
        ;['default', 'submitted'].forEach(function (name) {
            var model = sjs.mvc.Components.get(name)
            if (model) {
                Object.keys(tokens).forEach(function (k) { model.set(k, tokens[k]) })
            }
        })
        return 'splunkjs'
    }
    if (viz && typeof viz.drilldown === 'function') {
        try {
            // No DOM event is passed (same as the marker drilldown path): Studio relays the
            // drilldown across the iframe boundary and a MouseEvent can't be cloned.
            viz.drilldown({ action: deps.FIELD_VALUE_DRILLDOWN, data: tokens })
        } catch (err) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('Maps+: token drilldown failed', err)
            }
        }
        return 'drilldown'
    }
    return 'none'
}

module.exports = { setTokens: setTokens }
