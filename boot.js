// Loaded last (before ui.js): every module has registered its hooks, so draw the page once,
// then pick up anything handed over from another page.
renderAll();
handleArrivals();
if (typeof applyPendingVendor === "function") applyPendingVendor();
