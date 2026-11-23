PYTHON := $(shell if [ -f .venv/bin/python ]; then echo .venv/bin/python; else echo python3; fi)

.PHONY: check generate test test-server test-web test-rn test-ios test-core build build-dashboard

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

build-dashboard:
	npm run build --prefix dashboard

build:
	npm run build --prefix server
	npm run build --prefix dashboard
	npm run build --prefix web
	npm run build --prefix react-native

test: check test-server test-web test-rn test-ios
