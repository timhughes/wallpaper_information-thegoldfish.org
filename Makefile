# Makefile for Wallpaper Information GNOME Extension
# Copyright (C) 2026 Tim Hughes <thughes@thegoldfish.org>

UUID = $(shell jq -r '.uuid' metadata.json)
VERSION = $(shell jq -r '.version // "1"' metadata.json)
PACKAGE = $(UUID).v$(VERSION).zip

VENV = venv
PYTHON = $(VENV)/bin/python
PIP = $(VENV)/bin/pip
SHEXLI = $(VENV)/bin/shexli

.PHONY: all clean lint test pack install setup test-nested install-hooks bump

all: pack lint test

# Bump the version in metadata.json and stage the change
bump:
	@CURRENT_VERSION=$$(jq -r '.version // 1' metadata.json); \
	NEW_VERSION=$$(($$CURRENT_VERSION + 1)); \
	jq ".version = $$NEW_VERSION" metadata.json > metadata.json.tmp && mv metadata.json.tmp metadata.json; \
	git add metadata.json; \
	echo "Version bumped to $$NEW_VERSION and staged."; \
	echo "Run: git commit -m \"release: v$$NEW_VERSION\" && git tag v$$NEW_VERSION && git push origin master --tags"

# Set up virtual environment and install shexli
setup:
	@if [ ! -d $(VENV) ]; then \
		echo "Setting up virtual environment and installing shexli..."; \
		python3 -m venv $(VENV) && \
		$(PIP) install --quiet shexli; \
	fi

# Install git hooks for automated safety checks
install-hooks:
	@echo "Installing git hooks..."
	@pre-commit install
	@ln -sf ../../scripts/validate_tag.sh .git/hooks/pre-push
	@chmod +x scripts/validate_tag.sh
	@echo "Hooks installed: pre-commit (linting) and pre-push (tag version check)"

# Run unit tests using jasmine (GJS)
# This requires jasmine-gjs to be installed on your system.
test:
	@if [ -f "/usr/libexec/jasmine-gjs/jasmine-runner" ]; then \
		echo "Running Jasmine GJS unit tests..."; \
		GJS_PATH=$$(pwd) gjs -m /usr/libexec/jasmine-gjs/jasmine-runner --module --verbose spec/systemInfo.spec.js; \
	elif command -v jasmine-gjs >/dev/null 2>&1; then \
		echo "Running Jasmine GJS unit tests..."; \
		GJS_PATH=$$(pwd) jasmine-gjs --module --verbose spec/systemInfo.spec.js; \
	elif command -v jasmine >/dev/null 2>&1; then \
		echo "Running Jasmine GJS unit tests..."; \
		GJS_PATH=$$(pwd) jasmine --module --verbose spec/systemInfo.spec.js; \
	else \
		echo "Error: jasmine-gjs not found. See README.md for installation instructions."; \
		exit 1; \
	fi

# Run shexli static analyzer and validate version consistency
lint: setup validate-version
	@echo "Running shexli static analyzer on $(PACKAGE)..."
	@if [ -f "$(PACKAGE)" ]; then \
		$(SHEXLI) "$(PACKAGE)"; \
	else \
		echo "Error: $(PACKAGE) not found. Run 'make pack' first."; \
		exit 1; \
	fi

# Validate that the version in metadata.json matches any git tag for this commit
validate-version:
	@METADATA_VERSION=$$(jq -r '.version' metadata.json); \
	CURRENT_TAG=$$(git tag --points-at HEAD | sed 's/^v//' | head -n 1); \
	if [ -n "$$CURRENT_TAG" ] && [ "$$CURRENT_TAG" != "$$METADATA_VERSION" ]; then \
		echo "Error: Git tag v$$CURRENT_TAG does not match metadata.json version $$METADATA_VERSION"; \
		exit 1; \
	fi
	@echo "Version validation passed (metadata: $(VERSION))"
# Create the extension package for EGO/Manual installation
pack:
	@echo "Packaging extension into $(PACKAGE)..."
	@zip -r "$(PACKAGE)" . \
		-i "*.js" "*.json" "*.css" "*.xml" "*.svg" "*.png" "LICENSE" "icons/*" \
		-x "$(VENV)/*" \
...
		-x "*.git*" \
		-x "*.github*" \
		-x "scripts/*" \
		-x "spec/*" \
		-x "schemas/gschemas.compiled" \
		-x "README.md" \
		-x "Screenshot.png" \
		-x ".gitignore" \
		-x ".pre-commit-config.yaml" \
		-x "Makefile" \
		-x "*.zip"

# Install the extension locally for testing
install: pack
	@echo "Installing extension locally..."
	@gnome-extensions install --force "$(PACKAGE)"
	@echo "Extension installed. Restart GNOME Shell (Alt+F2, r) or log out/in to apply."

# Run integration tests in a nested GNOME Shell instance
test-nested: install
	@echo "Starting nested GNOME Shell for testing..."
	@echo "Tip: To view logs, run this in another terminal: journalctl -f -o cat /usr/bin/gnome-shell"
	@dbus-run-session gnome-shell --nested --wayland

# Clean up build artifacts
clean:
	@echo "Cleaning up..."
	@rm -f *.zip
	@rm -f schemas/gschemas.compiled
	@rm -rf $(VENV)
