'use strict'

// Set dashboard tokens.
// - Classic dashboards: the viz runs in the page, so set them on the SplunkJS MVC token models.
// - Dashboard Studio: the viz runs in a sandboxed srcdoc iframe (origin "null"). Studio puts a
//   stand-in `splunkjs.mvc.Components` there that only carries tokens INTO the frame; setting
//   tokens on it never reaches the dashboard. The only way out is a FIELD_VALUE_DRILLDOWN,
//   which Studio maps to `row.<token>.value` for drilldown.setToken handlers.
// deps = { splunkjs, sandboxed, FIELD_VALUE_DRILLDOWN } is supplied by the caller (keeps this
// testable); tokenDeps() builds it from the current window.

// True inside a sandboxed (null-origin) frame, i.e. Dashboard Studio's custom-viz iframe.
function isSandboxedFrame(win) {
    try {
        var loc = (win || window).location
        return loc.origin === 'null' || loc.protocol === 'about:'
    } catch (e) {
        return true
    }
}

function tokenDeps(FIELD_VALUE_DRILLDOWN, win) {
    win = win || (typeof window !== 'undefined' ? window : undefined)
    var sandboxed = win ? isSandboxedFrame(win) : false
    return {
        // Studio's stand-in is ignored: in a sandboxed frame tokens must go out as a drilldown.
        splunkjs: (!sandboxed && win && win.splunkjs) ? win.splunkjs : undefined,
        sandboxed: sandboxed,
        FIELD_VALUE_DRILLDOWN: FIELD_VALUE_DRILLDOWN
    }
}

// True when setTokens() will emit a drilldown rather than set SplunkJS models.
function usesDrilldown(deps) {
    var sjs = deps && !deps.sandboxed ? deps.splunkjs : undefined
    return !(sjs && sjs.mvc && sjs.mvc.Components)
}

function setTokens(viz, tokens, originalEvent, deps) {
    deps = deps || {}
    var sjs = deps.sandboxed ? undefined : deps.splunkjs
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

module.exports = { setTokens: setTokens, tokenDeps: tokenDeps, usesDrilldown: usesDrilldown, isSandboxedFrame: isSandboxedFrame }
