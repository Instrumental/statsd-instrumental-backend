# Project Setup


### Checkout the backend if needed
```
git clone git@github.com:Instrumental/statsd-instrumental-backend.git
```

### Checkout statsd next to the backend
```
git clone git@github.com:etsy/statsd.git
```

### Install the local backend in statsd
```
cd statsd
npm install --save-dev ../statsd-instrumental-backend/
```

### Update exampleConfig.js

Replace the value for `key` with `process.env.INSTRUMENTAL_TEST_TOKEN` which will let you use an environment variable to configure the token.

You may also want to set `debug: true` and `dumpMessages: true` at the top level to provide helpful output.

You can add a `host` key to the `instrumental` hash if you want to test against a non-standard collector.

### Run statsd:
```
INSTRUMENTAL_TEST_TOKEN="<my_test_token>" node stats.js ../statsd-instrumental-backend/exampleConfig.js
```

### In another terminal send a metric:
```
echo "statsd.backend.test:1|c" | nc -u -w0 127.0.0.1 8125
```

### Time fakery

If you need to test in the future, I've previously started with [how to sleep a million years]( https://idea.popcount.org/2013-07-19-how-to-sleep-a-million-years/ ) and ended up using:

```
brew install libfaketime
INSTRUMENTAL_TEST_TOKEN="<my_test_token>" faketime '2018-09-01 08:15:42' node stats.js ../statsd-instrumental-backend/exampleConfig.js
```

Be warned, this reportedly stopped working on MacOS at some point.


### Testing

If you have nodenv setup you can use something like this to test all installed node versions:
```
for i in `nodenv versions --bare`; do NODENV_VERSION=$i INSTRUMENTAL_TEST_TOKEN=<my_test_token> ./script/test &> /tmp/node_test_out_$i & done; wait; tail -n 1000 /tmp/node_test_out_*
```

# Releasing

1. Sign up for npmjs.com
2. Pull latest master
3. Merge feature branch(es) into master
4. `./script/test`
5. Increment version in `package.json`
6. Update [CHANGELOG.md](CHANGELOG.md)
7. Commit "Release version vX.Y.Z"
8. Push to GitHub
9. Tag version: `git tag 'vX.Y.Z' && git push --tags`
10. `npm publish`
11. Verify update on https://www.npmjs.com/package/statsd-instrumental-backend
