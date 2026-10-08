import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  clampChromaToGamut,
  computeAppTokens,
  contrastRatio,
  formatOklch,
  hexToOklch,
  isInGamut,
  missingFontDependency,
  parseOklch,
  renderWebappCss,
  renderWebsiteCss,
  renderWebsiteFontImport,
  repositoryRoot,
  runTheme,
  validateThemeConfig,
} from './theme.mjs'

/* -------------------------------------------------------------------------------------------- */
/* Color math: known fixtures.                                                                   */
/* -------------------------------------------------------------------------------------------- */

describe('color math', () => {
  test('hexToOklch reads pure black and white as achromatic extremes', () => {
    const white = hexToOklch('#ffffff')
    expect(white.l).toBeCloseTo(1, 2)
    expect(white.c).toBeCloseTo(0, 2)

    const black = hexToOklch('#000000')
    expect(black.l).toBeCloseTo(0, 2)
    expect(black.c).toBeCloseTo(0, 2)
  })

  test('rejects a value that is not a 6-digit hex color', () => {
    expect(() => hexToOklch('#fff')).toThrow()
    expect(() => hexToOklch('blue')).toThrow()
  })

  test('contrastRatio of black on white is 21:1, and is symmetric', () => {
    const black = hexToOklch('#000000')
    const white = hexToOklch('#ffffff')
    expect(contrastRatio(black, white)).toBeCloseTo(21, 0)
    expect(contrastRatio(white, black)).toBeCloseTo(21, 0)
  })

  test('contrastRatio of #767676 on white matches the commonly cited WCAG AA boundary gray (~4.54:1)', () => {
    expect(contrastRatio(hexToOklch('#767676'), hexToOklch('#ffffff'))).toBeCloseTo(4.54, 1)
  })

  test('clampChromaToGamut desaturates an out-of-gamut color without moving its lightness or hue', () => {
    const outOfGamut = { l: 0.5, c: 1, h: 0 }
    expect(isInGamut(outOfGamut)).toBe(false)

    const clamped = clampChromaToGamut(outOfGamut)
    expect(clamped.l).toBe(outOfGamut.l)
    expect(clamped.h).toBe(outOfGamut.h)
    expect(clamped.c).toBeLessThan(outOfGamut.c)
    expect(isInGamut(clamped)).toBe(true)
  })

  test('clampChromaToGamut leaves an in-gamut color unchanged', () => {
    const gray = { l: 0.5, c: 0, h: 0 }
    expect(clampChromaToGamut(gray)).toEqual(gray)
  })

  test('formatOklch round-trips the achromatic literal tokens already committed in the theme files', () => {
    for (const literal of ['oklch(0.205 0 0)', 'oklch(0.985 0 0)', 'oklch(1 0 0)', 'oklch(0.06 0 0)']) {
      expect(formatOklch(parseOklch(literal))).toBe(literal)
    }
  })

  test('formatOklch keeps a marginally out-of-gamut literal close to its original chroma, in gamut', () => {
    // The template's own `--destructive` value is a hair outside sRGB (a common side effect of
    // hand-picking OKLCH colors); formatOklch is not used to emit it (it is copied through as a
    // fixed literal, never brand-derived), but it must still degrade gracefully if it were.
    const original = parseOklch('oklch(0.505 0.213 27.518)')
    expect(isInGamut(original)).toBe(false)
    const safe = parseOklch(formatOklch(original))
    expect(isInGamut(safe)).toBe(true)
    expect(safe.c).toBeCloseTo(original.c, 1)
  })

  test('parseOklch ignores an alpha suffix', () => {
    expect(parseOklch('oklch(1 0 0 / 10%)')).toEqual({ l: 1, c: 0, h: 0 })
  })
})

/* -------------------------------------------------------------------------------------------- */
/* theme.json validation.                                                                        */
/* -------------------------------------------------------------------------------------------- */

function validConfig() {
  return {
    webapp: { brand: null, radius: 0.625, font: { family: "'Figtree Variable'", package: '@fontsource-variable/figtree' } },
    website: {
      brand: '#4f46e5',
      radius: 0.75,
      font: { family: "'Helvetica Neue', Helvetica, Arial, 'Inter Variable'", package: '@fontsource-variable/inter' },
    },
  }
}

describe('validateThemeConfig', () => {
  test('accepts a well-formed config', () => {
    expect(validateThemeConfig(validConfig())).toEqual([])
  })

  test('rejects a non-object', () => {
    expect(validateThemeConfig(null).length).toBeGreaterThan(0)
    expect(validateThemeConfig('theme').length).toBeGreaterThan(0)
    expect(validateThemeConfig([]).length).toBeGreaterThan(0)
  })

  test('rejects an unexpected top-level key', () => {
    const config = { ...validConfig(), mobile: {} }
    expect(validateThemeConfig(config).some((error) => error.includes('"mobile"'))).toBe(true)
  })

  test('requires both apps', () => {
    const config = validConfig()
    delete config.website
    expect(validateThemeConfig(config).some((error) => error.includes('missing "website"'))).toBe(true)
  })

  test('rejects an unexpected key inside an app', () => {
    const config = validConfig()
    config.webapp.extra = true
    expect(validateThemeConfig(config).some((error) => error.includes('"extra"'))).toBe(true)
  })

  test('rejects a brand that is not null or a hex color', () => {
    for (const brand of ['blue', '#fff', '#gggggg', 123]) {
      const config = validConfig()
      config.webapp.brand = brand
      expect(validateThemeConfig(config).some((error) => error.includes('webapp.brand'))).toBe(true)
    }
  })

  test('accepts a null brand', () => {
    const config = validConfig()
    config.website.brand = null
    expect(validateThemeConfig(config)).toEqual([])
  })

  test('rejects a radius that is not a positive number within range', () => {
    for (const radius of [0, -1, 5, Number.NaN, '0.625']) {
      const config = validConfig()
      config.webapp.radius = radius
      expect(validateThemeConfig(config).some((error) => error.includes('webapp.radius'))).toBe(true)
    }
  })

  test('rejects a font that is missing, empty, or not a @fontsource package', () => {
    const missingFont = validConfig()
    delete missingFont.webapp.font
    expect(validateThemeConfig(missingFont).some((error) => error.includes('webapp.font'))).toBe(true)

    const emptyFamily = validConfig()
    emptyFamily.webapp.font.family = '  '
    expect(validateThemeConfig(emptyFamily).some((error) => error.includes('webapp.font.family'))).toBe(true)

    const badPackage = validConfig()
    badPackage.webapp.font.package = 'figtree'
    expect(validateThemeConfig(badPackage).some((error) => error.includes('webapp.font.package'))).toBe(true)
  })

  test('rejects an unexpected key inside font', () => {
    const config = validConfig()
    config.webapp.font.weight = 400
    expect(validateThemeConfig(config).some((error) => error.includes('"weight"'))).toBe(true)
  })
})

describe('missingFontDependency', () => {
  test('is false when the package is a direct dependency', () => {
    expect(missingFontDependency({ dependencies: { '@fontsource-variable/figtree': '^5.3.0' } }, '@fontsource-variable/figtree')).toBe(false)
  })

  test('is false when the package is a dev dependency', () => {
    expect(missingFontDependency({ devDependencies: { '@fontsource-variable/figtree': '^5.3.0' } }, '@fontsource-variable/figtree')).toBe(false)
  })

  test('is true when the package is absent', () => {
    expect(missingFontDependency({ dependencies: {} }, '@fontsource-variable/figtree')).toBe(true)
  })
})

/* -------------------------------------------------------------------------------------------- */
/* Palette invariants across a spread of brand colors.                                           */
/* -------------------------------------------------------------------------------------------- */

const BRAND_SPREAD = ['#f4c20d', '#0000ff', '#fdfdfd', '#0a0a0a', '#e11d2f']
const BACKGROUND_BY_MODE = {
  webapp: { light: 'oklch(1 0 0)', dark: 'oklch(0.145 0 0)' },
  website: { dark: 'oklch(0.06 0 0)' },
}
const OKLCH_STRING = /^oklch\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)$/

describe('brand palette invariants', () => {
  const cases = [
    ...BRAND_SPREAD.map((brand) => ['webapp', 'light', brand]),
    ...BRAND_SPREAD.map((brand) => ['webapp', 'dark', brand]),
    ...BRAND_SPREAD.map((brand) => ['website', 'dark', brand]),
  ]

  for (const [app, mode, brand] of cases) {
    test(`${app} ${mode} theme with brand ${brand} meets WCAG AA and stays in gamut`, () => {
      const tokens = computeAppTokens(app, mode, brand)
      const background = parseOklch(BACKGROUND_BY_MODE[app][mode])
      const primary = parseOklch(tokens.primary)
      const primaryForeground = parseOklch(tokens['primary-foreground'])
      const ring = parseOklch(tokens.ring)

      expect(contrastRatio(primary, primaryForeground)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(primary, background)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(ring, background)).toBeGreaterThanOrEqual(3)

      expect(tokens['sidebar-primary']).toBe(tokens.primary)
      expect(tokens['sidebar-primary-foreground']).toBe(tokens['primary-foreground'])
      expect(tokens['sidebar-ring']).toBe(tokens.ring)

      if (app === 'website') {
        expect(tokens.brand).toBe(tokens.primary)
        expect(tokens['brand-foreground']).toBe(tokens['primary-foreground'])
      }

      for (const name of ['primary', 'ring', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']) {
        const match = OKLCH_STRING.exec(tokens[name])
        expect(match, `${name} should be a formatted oklch(...) string, got ${tokens[name]}`).not.toBeNull()
        const l = Number(match[1])
        expect(l).toBeGreaterThanOrEqual(0)
        expect(l).toBeLessThanOrEqual(1)
        expect(isInGamut(parseOklch(tokens[name]))).toBe(true)
      }
    })
  }

  test('a brand color that already meets contrast is left at its own lightness', () => {
    // A mid-lightness, legible brand in light mode already clears both thresholds against a
    // white background and white text, so the search should stop at step zero.
    const brandL = hexToOklch('#4f46e5').l
    const tokens = computeAppTokens('webapp', 'light', '#4f46e5')
    expect(parseOklch(tokens.primary).l).toBeCloseTo(brandL, 2)
  })
})

/* -------------------------------------------------------------------------------------------- */
/* brand: null reproduces the template's neutral theme.                                          */
/* -------------------------------------------------------------------------------------------- */

describe('neutral theme (brand: null)', () => {
  test('webapp dark sidebar-primary mirrors primary instead of the template\'s stray chromatic value', () => {
    const tokens = computeAppTokens('webapp', 'dark', null)
    expect(tokens['sidebar-primary']).toBe(tokens.primary)
    expect(tokens['sidebar-primary-foreground']).toBe(tokens['primary-foreground'])
    expect(tokens['sidebar-primary']).toBe('oklch(0.922 0 0)')
  })

  test('webapp light sidebar-primary already mirrored primary and still does', () => {
    const tokens = computeAppTokens('webapp', 'light', null)
    expect(tokens['sidebar-primary']).toBe(tokens.primary)
    expect(tokens['sidebar-primary']).toBe('oklch(0.205 0 0)')
  })

  test('website brand/brand-foreground mirror primary/primary-foreground', () => {
    const tokens = computeAppTokens('website', 'dark', null)
    expect(tokens.brand).toBe(tokens.primary)
    expect(tokens['brand-foreground']).toBe(tokens['primary-foreground'])
  })
})

/* -------------------------------------------------------------------------------------------- */
/* Per-token overrides (theme.json "tokens") and the added highlight/brand tokens.              */
/* -------------------------------------------------------------------------------------------- */

// Generator output from before `tokens` existed, for the two configs that must not change.
const OUTPUT_BEFORE_OVERRIDES = {
  'null|webapp|light': {
    primary: 'oklch(0.205 0 0)',
    'primary-foreground': 'oklch(0.985 0 0)',
    ring: 'oklch(0.708 0 0)',
    'sidebar-primary': 'oklch(0.205 0 0)',
    'chart-1': 'oklch(0.87 0 0)',
    'chart-2': 'oklch(0.556 0 0)',
    'chart-3': 'oklch(0.439 0 0)',
    'chart-4': 'oklch(0.371 0 0)',
    'chart-5': 'oklch(0.269 0 0)',
    destructive: 'oklch(0.505 0.213 27.518)',
  },
  'null|webapp|dark': {
    primary: 'oklch(0.922 0 0)',
    'primary-foreground': 'oklch(0.205 0 0)',
    ring: 'oklch(0.556 0 0)',
    'sidebar-primary': 'oklch(0.922 0 0)',
    'chart-1': 'oklch(0.87 0 0)',
    'chart-2': 'oklch(0.556 0 0)',
    'chart-3': 'oklch(0.439 0 0)',
    'chart-4': 'oklch(0.371 0 0)',
    'chart-5': 'oklch(0.269 0 0)',
    destructive: 'oklch(0.704 0.191 22.216)',
  },
  'null|website|dark': {
    primary: 'oklch(1 0 0)',
    'primary-foreground': 'oklch(0.06 0 0)',
    ring: 'oklch(0.85 0 0)',
    'sidebar-primary': 'oklch(1 0 0)',
    'chart-1': 'oklch(0.97 0 0)',
    'chart-2': 'oklch(0.8 0 0)',
    'chart-3': 'oklch(0.63 0 0)',
    'chart-4': 'oklch(0.46 0 0)',
    'chart-5': 'oklch(0.3 0 0)',
    destructive: 'oklch(0.704 0.191 22.216)',
    brand: 'oklch(1 0 0)',
  },
  '#c97b3a|webapp|light': {
    primary: 'oklch(0.563 0.125 57.627)',
    'primary-foreground': 'oklch(0.985 0 0)',
    ring: 'oklch(0.655 0.125 57.627)',
    'sidebar-primary': 'oklch(0.563 0.125 57.627)',
    'chart-1': 'oklch(0.87 0.083 57.627)',
    'chart-2': 'oklch(0.556 0.125 57.627)',
    'chart-3': 'oklch(0.439 0.105 57.627)',
    'chart-4': 'oklch(0.371 0.089 57.627)',
    'chart-5': 'oklch(0.269 0.065 57.627)',
    destructive: 'oklch(0.505 0.213 27.518)',
  },
  '#c97b3a|webapp|dark': {
    primary: 'oklch(0.655 0.125 57.627)',
    'primary-foreground': 'oklch(0.205 0 0)',
    ring: 'oklch(0.655 0.125 57.627)',
    'sidebar-primary': 'oklch(0.655 0.125 57.627)',
    'chart-1': 'oklch(0.87 0.083 57.627)',
    'chart-2': 'oklch(0.556 0.125 57.627)',
    'chart-3': 'oklch(0.439 0.105 57.627)',
    'chart-4': 'oklch(0.371 0.089 57.627)',
    'chart-5': 'oklch(0.269 0.065 57.627)',
    destructive: 'oklch(0.704 0.191 22.216)',
  },
  '#c97b3a|website|dark': {
    primary: 'oklch(0.655 0.125 57.627)',
    'primary-foreground': 'oklch(0.06 0 0)',
    ring: 'oklch(0.655 0.125 57.627)',
    'sidebar-primary': 'oklch(0.655 0.125 57.627)',
    'chart-1': 'oklch(0.97 0.017 57.627)',
    'chart-2': 'oklch(0.8 0.125 57.627)',
    'chart-3': 'oklch(0.63 0.125 57.627)',
    'chart-4': 'oklch(0.46 0.11 57.627)',
    'chart-5': 'oklch(0.3 0.072 57.627)',
    destructive: 'oklch(0.704 0.191 22.216)',
    brand: 'oklch(0.655 0.125 57.627)',
  },
}

describe('without tokens the output is what it was before', () => {
  for (const [key, expected] of Object.entries(OUTPUT_BEFORE_OVERRIDES)) {
    test(key, () => {
      const [brand, app, mode] = key.split('|')
      const tokens = computeAppTokens(app, mode, brand === 'null' ? null : brand)
      for (const [name, value] of Object.entries(expected)) expect(tokens[name]).toBe(value)
    })
  }

  test('highlight is the mode destructive and brand is primary when nothing overrides them', () => {
    for (const [app, mode] of [['webapp', 'light'], ['webapp', 'dark'], ['website', 'dark']]) {
      const tokens = computeAppTokens(app, mode, '#c97b3a')
      expect(tokens.highlight).toBe(tokens.destructive)
      expect(tokens.brand).toBe(tokens.primary)
      expect(tokens['brand-foreground']).toBe(tokens['primary-foreground'])
      expect(tokens['highlight-foreground']).toMatch(OKLCH_STRING)
    }
  })
})

describe('token overrides', () => {
  test('an override replaces the computed token and is written as OKLCH', () => {
    const tokens = computeAppTokens('webapp', 'light', '#c97b3a', { primary: '#00313C', highlight: '#E04E39' })
    expect(tokens.primary).toBe(formatOklch(hexToOklch('#00313C')))
    expect(tokens.highlight).toBe(formatOklch(hexToOklch('#E04E39')))
    expect(tokens.ring).toBe(computeAppTokens('webapp', 'light', '#c97b3a').ring)
  })

  test('accepts the new and existing names, for the modes each app has', () => {
    const config = validConfig()
    config.webapp.tokens = {
      light: { highlight: '#E04E39', 'highlight-foreground': '#FFFFFF', brand: '#008C95', 'brand-foreground': '#FFFFFF', 'sidebar-ring': '#77E2C3' },
      dark: { background: '#00313C' },
    }
    config.website.tokens = { dark: { brand: '#008C95', highlight: '#E04E39' } }
    expect(validateThemeConfig(config)).toEqual([])
  })

  const rejected = [
    ['webapp', { light: { nope: '#ffffff' } }, 'nope'],
    ['webapp', { light: { radius: '#ffffff' } }, 'radius'],
    ['webapp', { sepia: { primary: '#ffffff' } }, 'sepia'],
    ['website', { light: { primary: '#ffffff' } }, 'light'],
    ['webapp', { light: { primary: 'blue' } }, 'primary'],
    ['webapp', { light: { primary: '#fff' } }, 'primary'],
    ['webapp', 'light', 'tokens'],
  ]
  for (const [app, tokens, needle] of rejected) {
    test(`rejects ${app} tokens ${JSON.stringify(tokens)}`, () => {
      const config = validConfig()
      config[app].tokens = tokens
      const errors = validateThemeConfig(config)
      expect(errors.some((error) => error.includes(`${app}.tokens`) && error.includes(needle))).toBe(true)
    })
  }
})

describe('contrast of the real theme.json', () => {
  const realConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'theme.json'), 'utf8'))
  const modes = [['webapp', 'light'], ['webapp', 'dark'], ['website', 'dark']]
  const pairs = [
    ['foreground', 'background', 4.5],
    ['primary-foreground', 'primary', 4.5],
    ['muted-foreground', 'muted', 4.5],
    ['destructive', 'background', 4.5],
    ['sidebar-primary-foreground', 'sidebar-primary', 4.5],
    ['ring', 'background', 3],
  ]

  for (const [app, mode] of modes) {
    test(`${app} ${mode}`, () => {
      const { brand, tokens: overrides } = realConfig[app]
      const tokens = computeAppTokens(app, mode, brand, overrides?.[mode])
      for (const [front, back, minimum] of pairs) {
        const ratio = contrastRatio(parseOklch(tokens[front]), parseOklch(tokens[back]))
        expect(ratio, `${front} on ${back}`).toBeGreaterThanOrEqual(minimum)
      }
    })
  }

  test('every webapp and website token override in theme.json is valid', () => {
    expect(validateThemeConfig(realConfig)).toEqual([])
    expect(realConfig.webapp.tokens?.light).toBeDefined()
    expect(realConfig.website.tokens?.dark).toEqual(realConfig.webapp.tokens?.dark)
  })
})

/* -------------------------------------------------------------------------------------------- */
/* Drift: the committed CSS and theme.json must already agree.                                   */
/* -------------------------------------------------------------------------------------------- */

describe('generated files match theme.json', () => {
  const themeConfig = JSON.parse(readFileSync(path.join(repositoryRoot, 'theme.json'), 'utf8'))

  test('theme.json itself is valid', () => {
    expect(validateThemeConfig(themeConfig)).toEqual([])
  })

  test('webapp/src/index.css has no drift', () => {
    const current = readFileSync(path.join(repositoryRoot, 'webapp/src/index.css'), 'utf8')
    expect(renderWebappCss(current, themeConfig)).toBe(current)
  })

  test('website/src/styles/global.css has no drift', () => {
    const current = readFileSync(path.join(repositoryRoot, 'website/src/styles/global.css'), 'utf8')
    expect(renderWebsiteCss(current, themeConfig)).toBe(current)
  })

  test('website/src/layouts/BaseLayout.astro has no drift', () => {
    const current = readFileSync(path.join(repositoryRoot, 'website/src/layouts/BaseLayout.astro'), 'utf8')
    expect(renderWebsiteFontImport(current, themeConfig)).toBe(current)
  })
})

describe('runTheme', () => {
  const themeFiles = [
    'theme.json',
    'webapp/package.json',
    'website/package.json',
    'webapp/src/index.css',
    'website/src/styles/global.css',
    'website/src/layouts/BaseLayout.astro',
  ]

  test('writes nothing when any target cannot be rendered, and reports an error instead of throwing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'theme-run-'))
    try {
      for (const file of themeFiles) {
        mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
        cpSync(path.join(repositoryRoot, file), path.join(root, file))
      }
      // A brand color changes the webapp CSS, the first target; the last target has lost its marker.
      const config = JSON.parse(readFileSync(path.join(root, 'theme.json'), 'utf8'))
      config.webapp.brand = '#16a34a'
      delete config.webapp.tokens
      writeFileSync(path.join(root, 'theme.json'), JSON.stringify(config))
      const layoutPath = path.join(root, 'website/src/layouts/BaseLayout.astro')
      writeFileSync(layoutPath, readFileSync(layoutPath, 'utf8').replace('// THEME_FONT_IMPORT_END', ''))
      const before = themeFiles.map((file) => readFileSync(path.join(root, file), 'utf8'))

      const errors = []
      const exitCode = runTheme({ root, log: () => {}, error: (message) => errors.push(message) })

      expect(exitCode).toBe(1)
      expect(errors).toHaveLength(1)
      expect(themeFiles.map((file) => readFileSync(path.join(root, file), 'utf8'))).toEqual(before)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
