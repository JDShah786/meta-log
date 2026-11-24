// THROWAWAY: measures the installed iPhone app's window. Never merged.
;(function () {
  // Markers: red = bottom of a fixed inset:0 box; cyan = bottom of a 100lvh box; yellow = .stage bottom.
  function marker(css, color) {
    var d = document.createElement('div')
    d.style.cssText = 'position:fixed;left:0;right:0;height:6px;z-index:99999;pointer-events:none;background:' + color + ';' + css
    document.body.appendChild(d)
    return d
  }
  function probe(css) {
    var d = document.createElement('div')
    d.style.cssText = 'position:fixed;left:0;width:1px;visibility:hidden;pointer-events:none;' + css
    document.body.appendChild(d)
    return d
  }
  function start() {
    marker('bottom:0', 'red')
    marker('top:calc(100lvh - 6px)', 'cyan')
    var stageMark = marker('top:0', 'yellow')
    var vh = probe('top:0;height:100vh')
    var dvh = probe('top:0;height:100dvh')
    var svh = probe('top:0;height:100svh')
    var lvh = probe('top:0;height:100lvh')
    var inset = probe('top:0;bottom:0')
    var safe = probe('top:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);height:0')
    var box = document.createElement('pre')
    box.style.cssText =
      'position:fixed;left:8px;right:8px;top:38%;z-index:99999;margin:0;padding:10px;pointer-events:none;' +
      'background:#fff;color:#000;font:13px/1.35 ui-monospace,Menlo,monospace;border:3px solid red;white-space:pre-wrap'
    document.body.appendChild(box)
    function h(el) { return Math.round(el.getBoundingClientRect().height * 10) / 10 }
    function update() {
      var stage = document.querySelector('.stage')
      var sr = stage ? stage.getBoundingClientRect() : null
      if (sr) stageMark.style.top = sr.bottom - 6 + 'px'
      var cs = getComputedStyle(safe)
      var vv = window.visualViewport
      box.textContent = [
        'FIT PROBE (throwaway)',
        'standalone: ' + navigator.standalone + '  display-mode standalone: ' + matchMedia('(display-mode: standalone)').matches,
        'inner: ' + innerWidth + ' x ' + innerHeight + '  outer: ' + outerWidth + ' x ' + outerHeight,
        'screen: ' + screen.width + ' x ' + screen.height + '  avail: ' + screen.availWidth + ' x ' + screen.availHeight,
        'docEl client: ' + document.documentElement.clientWidth + ' x ' + document.documentElement.clientHeight,
        'visualViewport: ' + (vv ? vv.width + ' x ' + vv.height + ' top ' + vv.offsetTop : 'none'),
        'vh ' + h(vh) + '  dvh ' + h(dvh) + '  svh ' + h(svh) + '  lvh ' + h(lvh) + '  inset0 ' + h(inset),
        'safe top ' + cs.paddingTop + '  bottom ' + cs.paddingBottom,
        '--fit-gap: "' + document.documentElement.style.getPropertyValue('--fit-gap') + '"',
        'stage: ' + (sr ? 'top ' + Math.round(sr.top) + ' bottom ' + Math.round(sr.bottom) + ' h ' + Math.round(sr.height) : 'none'),
        'dpr ' + devicePixelRatio,
        'markers: red=fixed bottom:0  cyan=100lvh  yellow=stage bottom',
      ].join('\n')
    }
    update()
    setInterval(update, 500)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
