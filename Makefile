PYTHON := $(shell if [ -f .venv/bin/python ]; then echo .venv/bin/python; else echo python3; fi)

.PHONY: check generate test test-server test-web test-rn test-ios test-core test-e2e build build-dashboard

check:
	$(PYTHON) spec/check.py
	$(PYTHON) spec/codegen/generate.py --check

generate:
	$(PYTHON) spec/codegen/generate.py

test-server:
	npm test --prefix server

test-web:
	npm test --prefix web

test-rn:
	npm test --prefix react-native

test-ios:
	swift run --package-path ios StreamPulseTests

test-core:
	gradle :core:jvmTest

test-e2e:
	node test/e2e.test.js

build-dashboard:
	npm run build --prefix dashboard

build:
	npm run build --prefix server
	npm run build --prefix dashboard
	npm run build --prefix web
	npm run build --prefix react-native

test: check test-server test-web test-rn test-ios test-e2e
