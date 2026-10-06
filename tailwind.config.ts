import { colors, fonts, layout, easing } from './src/theme/tokens'

export default {
  theme: {
    extend: {
      colors,
      fontFamily: fonts,
      maxWidth: {
        container: layout.containerMax,
      },
      spacing: {
        header: layout.headerHeight,
      },
      transitionTimingFunction: {
        reveal: easing.out,
      },
    },
  },
  plugins: [],
}
