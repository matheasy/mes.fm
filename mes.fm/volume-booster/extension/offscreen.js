/* MES Volume Booster: the offscreen document. It receives a tab's audio (chrome.tabCapture), runs it through a gain node and plays it back, so
   the tab sounds louder. One entry per boosted tab. */
(function () {
  'use strict';
  var V = MESVB, tabs = {};   // tabId -> { ctx, stream, graph, level }

  function stop(tabId) {
    var t = tabs[tabId];
    if (!t) return;
    delete tabs[tabId];
    try { t.stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) { /* ignore */ }
    try { t.ctx.close(); } catch (e) { /* ignore */ }
    try { chrome.runtime.sendMessage({ target: 'background', type: 'stopped', tabId: tabId }); } catch (e) { /* ignore */ }
  }

  async function start(m) {
    if (tabs[m.tabId]) { set(m); return; }
    var stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: m.streamId } }, video: false });
    var ctx = new AudioContext();
    var source = ctx.createMediaStreamSource(stream);
    var graph = V.buildGraph(ctx, source, m.level, m.limiter);
    tabs[m.tabId] = { ctx: ctx, stream: stream, graph: graph, level: m.level };
    // the tab was closed or the capture was ended by the browser
    stream.getAudioTracks().forEach(function (tr) { tr.addEventListener('ended', function () { stop(m.tabId); }); });
    if (ctx.state === 'suspended') ctx.resume();
  }

  function set(m) {
    var t = tabs[m.tabId];
    if (!t) return;
    if (typeof m.level === 'number') { t.level = m.level; t.graph.setLevel(m.level); }
    if (typeof m.limiter === 'boolean') t.graph.setLimiter(m.limiter);
  }

  chrome.runtime.onMessage.addListener(function (m, sender, send) {
    if (!m || m.target !== 'offscreen') return;
    if (m.type === 'start') { start(m).then(function () { send({ ok: true }); }, function (e) { send({ ok: false, error: String(e && e.message || e) }); }); return true; }
    if (m.type === 'set') { set(m); send({ ok: true }); }
    else if (m.type === 'stop') { stop(m.tabId); send({ ok: true }); }
    else if (m.type === 'get') { var t = tabs[m.tabId]; send({ active: !!t, level: t ? t.level : 100 }); }
    else if (m.type === 'all') { send({ tabs: Object.keys(tabs).map(function (k) { return { tabId: Number(k), level: tabs[k].level }; }) }); }
  });
})();
