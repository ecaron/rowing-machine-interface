const Rower = require('./rower')
const RowerPlayback = require('./playback')
const memoryMap = require('./memory-map')
const debug = require('debug')('S4')
let rower

exports.rower = async function (config) {
  if (rower && !rower.destroyed) {
    return rower
  }

  if (config.record && typeof config.record !== 'object') {
    throw new Error('`record` must be a stream`')
  }

  rower = new Rower(config, memoryMap)

  config.port = false
  try {
    config.port = await rower.findPort()
  } catch (e) {
    throw new Error('Rowing machine port not found')
  }

  if (config.port !== false) {
    debug('[Init] Port is available - starting rower')
    rower.start()
    return rower
  }
  throw new Error('Rowing machine not found')
}

exports.playback = function (config) {
  if (!config.playback) {
    throw new Error('Playback stream not specified')
  }
  const rower = new RowerPlayback(config, memoryMap)
  return rower
}
