// Framesmith layer over the HyperFrames Studio (injected by the gateway, src/gateway.ts), run before the Studio app.
(function () {
  // The web app's theme: in the URL when the Studio opens (?theme=light|dark), then posted on each switch.
  function applyTheme(theme) {
    if (theme === "light") document.documentElement.dataset.theme = "paper";
    if (theme === "dark") delete document.documentElement.dataset.theme;
  }
  applyTheme(new URLSearchParams(window.location.search).get("theme"));
  window.addEventListener("message", function (event) {
    if (event.source === window.parent && event.data && event.data.type === "framesmith:theme") applyTheme(event.data.theme);
  });

  // Panels Framesmith does elsewhere: renders (render worker) and the online block catalog. The Studio offers no
  // option to leave them out, so their dock tabs are closed as they appear; nothing breaks if the markup changes.
  var CLOSED = ["Renders", "Catalog"];
  function closePanels() {
    document.querySelectorAll(".hf-dock-tab").forEach(function (tab) {
      var label = tab.querySelector(".hf-dock-tab-label");
      var close = tab.querySelector(".hf-dock-tab-close");
      if (label && close && CLOSED.indexOf(label.textContent.trim()) >= 0) close.click();
    });
  }
  new MutationObserver(closePanels).observe(document.documentElement, { childList: true, subtree: true });
})();
