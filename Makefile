PYTHON := $(shell if [ -f .venv/bin/python ]; then echo .venv/bin/python; else echo python3; fi)

.PHONY: check generate test

check:
	$(PYTHON) spec/check.py
	$(PYTHON) spec/codegen/generate.py --check

generate:
	$(PYTHON) spec/codegen/generate.py

test: check
