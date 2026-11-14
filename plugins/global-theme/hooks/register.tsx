import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SAVANNAH_NIGHT } from './scene'

const PLUGIN = 'global-theme'
const SCENE = 'savannah-night'

const { theme, problems } = makeColors({
  label: 'Savannah Night',
  only: 'dark',
  roles: { accent: '#2b9be0', danger: '#e5533f', success: '#5fb88a', warning: '#e0a64a', pro: '#9a86e8' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0a1220',
        'surface-1': '#0f1a2b',
        'surface-2': '#132135',
        'surface-3': '#16263c',
        'text-primary': '#eaf1fb',
        'text-secondary': '#c3cfdf',
        'text-muted': '#97a7bc',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE, glass: { blur: 14, tint: '#0a1220', opacity: 0.5 } },
  overrideColorScheme: 'dark',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(`${PLUGIN}: ${unpainted}`)
    }
    await $.theme.set(LOOK)

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.scene !== SCENE || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={SAVANNAH_NIGHT} alt="A savannah at night: hills, acacia trees, a giraffe, stars and a crescent moon" isInteractive />
  })
}
