### 0.13.1 [November 28th, 2018]
* Reduce logging with production debug settings

### 0.13.0 [May 10th, 2018]
* Add new certificates that will work after the current intermediate certs expire later this year
* Add a configuration option to enable custom certificates
* Add the ability to use included node certs, and make it the default (with included certs as a fallback)

### 0.12.4 [March 23rd, 2017]
* Revert to string.match from regex.test.  String.match is available in more environments.

### 0.12.3 [March 21st, 2017]
* Remove some logging that snuck in to production

### 0.12.2 [March 21st, 2017]
* Make metric whitelisting functionality (`metricFiltersInclude`) more efficient in the no-op case

### 0.12.1 [March 21st, 2017]
* Introduce metric whitelist/blacklist via `metricFiltersInclude` and `metricFiltersExclude` options

### 0.11.4 [December 9th, 2016]
* Fix a bug that caused `metricPrefix` to not always be applied.

### 0.11.3 [December 8th, 2016]
* Add `metricPrefix` option, which will be added to all of your metrics (with a "." to seperate them)

### 0.11.2 [March 28th, 2016]
* Add recordCounterRates option for users who wish to ignore .rate metrics on counters

### 0.11.1 [June 24th, 2015]
* Send reporting host information in transport greeting
* Better buffered data handling

### 0.11.0 [June 2nd, 2015]
* Add support for encrypted transport (TLS)
* Transition ownership to Expected Behavior
