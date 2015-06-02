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

You have to add the following basic configuration information to your
StatsD config file.

```js
{
  instrumental: {
    key: "[application api key]"
  }
}
```

## Enabling

Add `statsd-instrumental-backend` backend to the list of StatsD
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

- [Instrumental Backend](https://github.com/collectiveidea/statsd-instrumental-backend)

Contributing:

* Fork the project
* Make your feature addition or bug fix
* Commit. Do not mess with package.json, version, or history.
* Send a pull request. Bonus points for topic branches.

[statsd]: https://github.com/etsy/statsd
