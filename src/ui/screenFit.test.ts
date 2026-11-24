// The installed iPhone app must fill the whole screen on every phone.
//
// iOS 26 bug: with the see-through status bar, the installed app gets a window shorter than the
// screen by the status bar's height, and draws nothing below it (a dark band over the home bar).
// Measured on an iPhone 16 Pro: making html and body 100lvh tall makes iOS hand over the whole
// screen. lvh is filled in by each phone for itself, so no sizes live in the code.
// jsdom can't lay out a page, so these tests check the stylesheet rules; the real check is a PR
// preview on the phone.
import { describe, expect, it } from 'vitest'
import appCss from './app.css?raw'
import themesCss from './themes.css?raw'
import mainTsx from '../main.tsx?raw'

const css = appCss.replace(/\/\*[\s\S]*?\*\//g, '') // comments can't count as rules

// The body of every `@media (display-mode: standalone) { ... }` block (braces matched).
function standaloneBlocks(text: string): string[] {
  const blocks: string[] = []
  const re = /@media\s*\(\s*display-mode:\s*standalone\s*\)\s*\{/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 1
    let i = re.lastIndex
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
    }
    blocks.push(text.slice(re.lastIndex, i - 1))
  }
  return blocks
}

describe('the installed app fills the screen', () => {
  it('sets html and body to 100lvh tall in the installed app', () => {
    const rule = standaloneBlocks(css)
      .flatMap((block) => [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)])
      .find(([, selector]) => /^\s*html\s*,\s*body\s*$/.test(selector))
    expect(rule, 'an html, body rule inside @media (display-mode: standalone)').toBeDefined()
    expect(rule![2]).toMatch(/(^|;|\s)height:\s*100lvh\s*(;|$)/)
  })

  it('uses 100lvh only in the installed app, so a Safari tab is unchanged', () => {
    const outside = standaloneBlocks(css).reduce((text, block) => text.replace(block, ''), css)
    expect(standaloneBlocks(css).join('')).toContain('100lvh')
    expect(outside).not.toContain('100lvh')
  })

  it('drops the old stretch (--fit-gap) everywhere', () => {
    expect(appCss).not.toContain('--fit-gap')
    expect(themesCss).not.toContain('--fit-gap')
    expect(mainTsx).not.toContain('fitToScreen')
  })
})
