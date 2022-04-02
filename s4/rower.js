const { EventEmitter } = require('events')
const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')
const debug = require('debug')('S4:rower')

class S4 {
  constructor (config, memoryMap) {
    this.config = config
    this.memoryMap = memoryMap
    this.event = new EventEmitter()
    this.port = null
    this.pending = []
    this.writer = null
    this.connected = false
    this.reconnecting = false
    this.recording = false
    this.destroyed = false
    this.timer = new Date()
    if (config.record) {
      this.recording = config.record
    }

    this.EOL = '\r\n' // CRLF 0x0D0A
  }

  async findPort () {
    const ports = await SerialPort.list()
    for (let i = 0; i < ports.length; i++) {
      if (typeof ports[i].vendorId !== 'string' || typeof ports[i].productId !== 'string') {
        continue
      }
      // https://usb-ids.gowdy.us/read/UD/04d8/000a
      if (ports[i].vendorId.toLowerCase() === '04d8' && ports[i].productId.toLowerCase() === '000a') {
        // port is an object literal with string values
        return ports[i].path
      }
    }
    debug('USB device not detected')
    return false
  }

  start () {
    if (!this.config.port) {
      return false
    }
    const self = this
    this.port = new SerialPort({ path: this.config.port, baudRate: 19600, autoOpen: false, lock: false })
    const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
    parser.on('data', this._readAndDispatch.bind(this))
    this._open()
    this.port.on('error', function (err) {
      debug('Port errored, trying to open again in 5 seconds')
      debug(err)
      self._reconnect('Port errored, trying to open again in 5 seconds')
    })
    this.port.on('close', function () {
      debug('Port was closed, trying again in 5 seconds')
      self._reconnect('Port was closed, trying again in 5 seconds')
    })
  }

  getMemory () {
    return this.memoryMap
  }

  reset () {
    this.pending = []
    this._write('RESET')
    this._emit('state', { status: 'reset' })
    if (this.config.zeroOnReset) {
      this.memoryMap.forEach(response => {
        response.value = 0
      })
    }
  }

  destroy () {
    this._emit('state', { status: 'stopped' })
    this._write('EXIT')
    this.pending = []
    this.destroyed = true
    if (this.writer) {
      clearInterval(this.writer)
    }
    if (this.recording) {
      this.recording.end()
    }
  }

  _emit (event, details) {
    this.event.emit(event, details)
    if (this.recording) {
      const now = new Date()
      const sinceLast = now - this.timer
      this.timer = now
      this.recording.write(`["${event}",${sinceLast},${JSON.stringify(details)}]\n`)
    }
  }

  _write (string) {
    this.pending.push(string)
  }

  _flushNext () {
    if (this.pending.length === 0) {
      return
    }

    const string = this.pending.shift()
    if (this.port) {
      const buffer = Buffer.from(string + this.EOL)
      // debug('[OUT]: ' + buffer)
      this.port.write(buffer)
      if (string === 'RESET') {
        this._emit('state', { status: 'started' })
      }
    } else {
      debug(`Communication port is not open - not sending data: ${string}`)
      this._emit('state', {
        status: 'error',
        details: `Communication port is not open - not sending data: ${string}`
      })
    }
  }

  _readAndDispatch (string) {
    // debug('[IN]: ' + string)
    const c = string.charAt(0)
    switch (c) {
      case '_':
        this._wrHandler(string)
        break
      case 'I':
        this._informationHandler(string)
        break
      case 'O':
        // ignore
        break
      case 'E':
        // ignore
        break
      case 'P':
        // ignore
        break
      case 'S':
        for (let i = 0; i < this.memoryMap.length; i++) {
          this._readMemoryAddress(this.memoryMap[i].address, this.memoryMap[i].size)
        }
        break
      default:
        this._unknownHandler(string)
    }
  }

  // handlers start
  _unknownHandler (string) {
    debug(`Unrecognized packet: ${string}`)
  }

  _wrHandler (string) {
    if (string === '_WR_') {
      this._write('IV?')
    } else {
      this._unknownHandler(string)
    }
  }

  _informationHandler (string) {
    const c = string.charAt(1)
    switch (c) {
      case 'V':
        this._informationVersionHandler(string)
        break
      case 'D':
        this._memoryValueHandler(string)
        break
      default:
        this._unknownHandler(string)
    }
  }

  _readMemoryAddress (address, size) {
    const cmd = 'IR' + size + address
    this._write(cmd)
  }

  _informationVersionHandler (string) {
    // IV40210
    const model = string.charAt(2)
    const fwRevMajor = string.substring(3, 5)
    const fwRevMinor = string.substring(5, 7)
    const version = 'S' + model + ' ' + fwRevMajor + '.' + fwRevMinor
    // only log error, ignore version mismatch
    if (version !== 'S4 02.10') {
      debug(`WaterRower monitor version mismatch - expected S4 02.10 but got ${version}`)
      this._emit('state', {
        status: 'error',
        details: `WaterRower monitor version mismatch - expected S4 02.10 but got ${version}`
      })
    } else {
      debug('WaterRower ' + version)
    }
    this.reset()
  }

  _memoryValueHandler (string) {
    const size = string.charAt(2)
    const address = string.substring(3, 6)
    let l
    switch (size) {
      case 'S':
        l = 1
        break
      case 'D':
        l = 2
        break
      case 'T':
        l = 3
        break
      default:
        this._unknownHandler(string)
        return
    }
    const end = 6 + 2 * l
    const dataPoint = this.memoryMap.find(element => element.address === address)
    let value = parseInt(string.substring(6, end), 16)
    if (dataPoint.multiple) {
      value = value * dataPoint.multiple
    }
    if (dataPoint.value !== value) {
      debug(`${dataPoint.name} changed from ${dataPoint.value} to ${value}`)
      dataPoint.prevValue = dataPoint.value
      dataPoint.value = value
      this._emit('update', dataPoint)
    }
    this._readMemoryAddress(address, size)
  }

  toString () {
    return this.port.path
  }

  _reconnect (message) {
    if (!message) {
      message = ''
    } else {
      message += '  '
    }
    this.connected = false
    if (this.reconnecting) {
      debug('Already trying to reconnect')
      return
    }
    this._emit('state', {
      status: 'reconnecting',
      details: message + 'Attempting reconnect in 5s'
    })
    debug('Attempting reconnect in 5s')
    this.reconnecting = setTimeout(this._open.bind(this), 5000)
  }

  _open () {
    const self = this
    clearTimeout(this.reconnecting)
    this.reconnecting = false
    this.port.open(function (err) {
      if (err) {
        debug('Error occorred opening connection. Attempting reconnect.')
        self._reconnect('Error occorred opening connection. Attempting reconnect.')
        return
      }

      // we can only write one message every .2s
      if (self.writer) {
        clearInterval(self.writer)
        if (self.pending.length > 0) {
          self.reset()
        }
      }
      self.writer = setInterval(self._flushNext.bind(self), 200)

      debug('Connected successfully')
      self.connected = true
      self._write('USB')
    })
  }
}

module.exports = S4
