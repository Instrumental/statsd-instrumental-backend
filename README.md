# StatsD Instrumental backend

NOTE: This repository has moved from [collectiveidea](https://github.com/collectiveidea) to [expectedbehavior](https://github.com/expectedbehavior).

## Overview

This is a pluggable backend for [StatsD][statsd], which
publishes stats to [Instrumental](https://instrumentalapp.com).

## Requirements

* [StatsD][statsd] versions >= 0.3.0.
* An [Instrumental](https://instrumentalapp.com) account.

## Installation

    $ cd /path/to/statsd
    $ npm install statsd-instrumental-backend

## Configuration

See our [example config file](exampleConfig.js) for a complete StatsD configuration.

Otherwise, add the following basic configuration information to your
StatsD config file.

```js
{
  instrumental: {
    key: "[application api key]", // REQUIRED
    secure: true,                 // OPTIONAL (boolean), whether or not to use secure protocol to connect to Instrumental, default true
    verifyCert: true,            // OPTIONAL (boolean), should we attempt to verify the server certificate before allowing communication, default true
    timeout: 10000                // OPTIONAL (integer), number of milliseconds to wait for establishing a connection to Instrumental before giving up, default 10s
  }
}
```

## Enabling

This is already done if you are using our [example configuration](exampleConfig.js).

Otherwise, add `statsd-instrumental-backend` backend to the list of StatsD
backends in the StatsD configuration file:

```js
{
  backends: ["statsd-instrumental-backend"]
}
```

Start/restart the statsd daemon and your StatsD metrics should now be
pushed to your Instrumental account.

## NPM Dependencies

None

## Development

- [Instrumental Backend](https://github.com/expectedbehavior/statsd-instrumental-backend)

Contributing:

* Fork the project
* Make your feature addition or bug fix
* Commit. Do not mess with package.json, version, or history.
* Send a pull request. Bonus points for topic branches.

[statsd]: https://github.com/etsy/statsd
