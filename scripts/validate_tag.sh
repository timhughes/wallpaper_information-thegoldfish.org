#!/bin/bash
# Pre-push hook to validate that tags match metadata.json version
# and that version-name has been updated.

# Helper to get field from metadata.json in a specific commit
get_metadata_field() {
    local commit=$1
    local field=$2
    git show "${commit}:metadata.json" 2>/dev/null | jq -r ".${field}"
}

# Read stdin to see if any tags are being pushed
while read local_ref local_sha remote_ref remote_sha
do
    if [[ "$local_ref" == refs/tags/* ]]; then
        tag_name=${local_ref#refs/tags/}
        tag_version=${tag_name#v}
        
        echo "Validating release tag $tag_name..."

        # 1. Check version (integer) consistency
        metadata_version=$(get_metadata_field "$local_sha" "version")
        if [ "$tag_version" != "$metadata_version" ]; then
            echo -e "\033[1;31m[ERROR]\033[0m Tag version '$tag_version' does not match metadata.json version '$metadata_version' in commit $local_sha"
            exit 1
        fi

        # 2. Check that version-name has been bumped compared to the previous tag
        current_version_name=$(get_metadata_field "$local_sha" "version-name")
        
        # Find the most recent tag before this one
        previous_tag=$(git tag --sort=-v:refname | grep -v "^${tag_name}$" | head -n 1)
        
        if [ -n "$previous_tag" ]; then
            previous_sha=$(git rev-parse "$previous_tag")
            previous_version_name=$(get_metadata_field "$previous_sha" "version-name")
            
            if [ "$current_version_name" == "$previous_version_name" ]; then
                echo -e "\033[1;31m[ERROR]\033[0m The 'version-name' (\"$current_version_name\") has not been changed since the last release ($previous_tag)."
                echo "Please update 'version-name' in metadata.json before pushing."
                exit 1
            fi
        fi
        
        echo "Validation passed: version=$metadata_version, version-name=$current_version_name"
    fi
done

exit 0
