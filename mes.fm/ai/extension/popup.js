"use strict";
document.getElementById("v").textContent = chrome.runtime.getManifest().version;
const on = document.getElementById("on");
chrome.storage.local.get("on", (s) => { on.checked = s.on !== false; });
on.addEventListener("change", () => chrome.storage.local.set({ on: on.checked }));
document.getElementById("stop").addEventListener("click", () => { chrome.runtime.sendMessage({ fromPopup: "stop" }); window.close(); });
