const S4 = require('./s4')
const defaults = {
  zeroOnReset: false,
  record: false,
  playback: false
}

module.exports = function (given) {
  const options = { ...defaults, ...given }
  if (options.playback) {
    return S4.playback(options)
  } else {
    return S4.rower(options)
  }
}
