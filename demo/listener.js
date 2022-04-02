const fs = require('fs')
const chalk = require('chalk')
const app = require('../app')
require('draftlog').into(console)
const connectionStatus = console.draft(chalk.yellow('Attempting connection to rower'))

const run = async function () {
  let rower
  const config = {}

  if (process.argv.length === 3) {
    config.record = fs.createWriteStream(process.argv[2], { flags: 'wx' })
  }

  try {
    rower = await app(config)
    connectionStatus(chalk.green('Connected, awaiting start'))
  } catch (e) {
    connectionStatus(chalk.red('Connection failed'))
    return
  }
  rower.event.on('state', (state) => {
    if (state.status === 'started') {
      connectionStatus(chalk.green('Connection started'))
    } else if (state.status === 'stopped') {
      connectionStatus(chalk.red('Connection stopped'))
    } else if (state.status === 'reconnecting') {
      connectionStatus(chalk.yellow('Connection stopped'))
    } else if (state.status === 'reset') {
      connectionStatus(chalk.yellow('Connection reset'))
    } else {
      connectionStatus(chalk.error(`Error: ${state.details}`))
    }
  })
  const statusLines = {}
  rower.getMemory().forEach(memory => {
    statusLines[memory.name] = {
      message: `${('[' + memory.name.padEnd(14, ' ') + ']').padEnd(47, ' ')}${' - ' + memory.desc}`,
      timer: false
    }
    statusLines[memory.name].draft = console.draft(chalk.dim(statusLines[memory.name].message))
  })
  rower.event.on('update', (memory) => {
    let lineEntry = `[${memory.name.padEnd(14, ' ')}] - `
    let memoryValue = memory.value
    if (typeof memoryValue === 'number' && Math.floor(memoryValue) !== memoryValue) {
      memoryValue = memoryValue.toFixed(3)
    }
    if (memory.prevValue) {
      let prevValue = memory.value
      if (typeof prevValue === 'number' && Math.floor(prevValue) !== prevValue) {
        prevValue = prevValue.toFixed(3)
      }
      lineEntry += `${memoryValue + ' ' + memory.unit} (was ${prevValue}) `
    } else {
      lineEntry += `${memoryValue + ' ' + memory.unit} (first data) `
    }
    clearTimeout(statusLines[memory.name].timer)
    statusLines[memory.name].message = `${lineEntry.padEnd(47, ' ')}${chalk.gray(' - ' + memory.desc)}`
    statusLines[memory.name].draft(statusLines[memory.name].message)
    statusLines[memory.name].timer = setTimeout(function () {
      statusLines[memory.name].draft(chalk.dim(statusLines[memory.name].message))
    }, 5000)
  })
}

run()
