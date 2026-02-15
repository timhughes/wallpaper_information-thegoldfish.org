#!/bin/bash
# Pre-push hook to validate that tags match metadata.json version
# Calls the central validation logic in the Makefile

# Read stdin to see if any tags are being pushed
while read local_ref local_sha remote_ref remote_sha
# refs/tags/v3 12345 refs/tags/v3 12345
do
    if [[ "$local_ref" == refs/tags/* ]]; then
        # A tag is being pushed. Run the central validation logic.
        echo "Validating tag $local_ref..."
        make validate-version
        exit $?
    fi
done

exit 0
