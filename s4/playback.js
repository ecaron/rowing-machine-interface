const { EventEmitter } = require('events')
const debug = require('debug')('S4:playback')

class S4 {
  constructor (config, memoryMap) {
    this.config = config
    this.memoryMap = memoryMap
    this.event = new EventEmitter()
    this.timer = null
    this.data = []
  }

  load (entry) {
    this.data.push(entry)
  }

  start () {
    let part
    if (this.data.length > 0) {
      part = this.data.shift()
      this.event.emit(part[0], part[2])
      if (part[0] === 'update') {
        debug(`${part[2].name} changed from ${part[2].prevValue} to ${part[2].value}`)
        const dataPoint = this.memoryMap.find(element => element.address === part[2].address)
        dataPoint.prevValue = part[2].prevValue
        dataPoint.value = part[2].value
      }
    }
    if (this.data.length > 0) {
      this.timer = setTimeout(this.start.bind(this), part[1])
    } else {
      // Wait for more data, or a destroy to be called
      this.timer = setTimeout(this.start.bind(this), 1000)
    }
  }

  getMemory () {
    return this.memoryMap
  }

  destroy () {
    if (this.timer) {
      clearTimeout(this.timer)
    }
  }
}

module.exports = S4
