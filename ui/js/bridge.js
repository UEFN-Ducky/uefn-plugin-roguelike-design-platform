/* sandbox-safe host bridge (prefs + backend RPC) */
var RGD_BRIDGE_CHANNEL = "uefn-plugin-ui";
var rgdBridgePending = {};
window.addEventListener("message", function (ev) {
  var d = ev.data;
  if (!d || d.channel !== RGD_BRIDGE_CHANNEL) return;
  if (d.id && rgdBridgePending[d.id]) {
    var pending = rgdBridgePending[d.id];
    delete rgdBridgePending[d.id];
    if (d.ok) pending.resolve(d.result);
    else pending.reject(new Error(d.error || "bridge error"));
  }
});
function rgdBridgeCall(method, params, timeoutMs) {
  var id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
  var ms = (typeof timeoutMs === "number" && timeoutMs > 0) ? timeoutMs : 8000;
  return new Promise(function (resolve, reject) {
    rgdBridgePending[id] = { resolve: resolve, reject: reject };
    try {
      parent.postMessage({ channel: RGD_BRIDGE_CHANNEL, id: id, method: method, params: params || {} }, "*");
    } catch (e) {
      delete rgdBridgePending[id];
      reject(e);
      return;
    }
    setTimeout(function () {
      if (rgdBridgePending[id]) {
        delete rgdBridgePending[id];
        reject(new Error("bridge timeout"));
      }
    }, ms);
  });
}
function rgdRpc(method, params, timeoutMs) {
  return rgdBridgeCall("plugin.call", { method: method, params: params || {} }, timeoutMs);
}
