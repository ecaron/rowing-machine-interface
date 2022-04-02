# Rowing Machine Interface

This is basic module to standardize outputs from rowing machines (via either USB or Bluetooth connections).

As of this current release, it only supports the [WaterRower](https://www.waterrower.com/us/) (with the [S4 module](https://www.waterrower.com/us/shop/accessories/commodule.html)).

This is intended to power apps such as the [Home Rower Game](https://github.com/ecaron/home-rower-game), but minimize the time those apps have to spend handling the nuances of different rowing devices.

## Sample Code

Although more complicated examples are in the [demo](demo) directory, a basic application could work like this:
```
const rower = require('rowing-machine-interface')

const run = async function () {
  let rower

  try {
    rower = await app({})
    console.log('Connected, awaiting start')
  } catch (e) {
    connectionStatus(chalk.red('Connection failed'))
    return
  }
  rower.event.on('state', (state) => {
    console.log(`Received state: ${JSON.stringify(state)}`)
  })
  rower.event.on('update', (memory) => {
    console.log(`Received update: ${JSON.stringify(memory)}`)
  })
}

run()
```

## Event Emitted

The module emits one of two events, with additional information for each:
* `state`
  * `status` (either `started`, `error`, `reconnecting`, `reset`, `stopped`)
  * `details`
* `update`
  * `memory` (The metric that was modifiied)

#### Metrics tracked:
* Distance in meters (as `ms_distance`)
* Average time for a pull (as `stroke_pull`)
* Average time for a whole stroke (as `stroke_average`)
* Stroke Count (as `stroke_cnt`)
* Speed in knots (as `ms_average`)
