import json
import urllib.request
import re
import sys
import os

def get_latest_gnome_version():
    # Fetch tags from GNOME Shell GitLab
    url = "https://gitlab.gnome.org/api/v4/projects/GNOME%2Fgnome-shell/repository/tags?per_page=100"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            tags = json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching tags: {e}")
        return None
    
    versions = set()
    for tag in tags:
        name = tag['name'].lower()
        
        # Skip development and pre-release versions
        if any(x in name for x in ['alpha', 'beta', 'rc', 'pre']):
            continue
            
        # GNOME 40+ uses single integers for major releases (40, 41, 42...)
        # Tags can be "45.1", "49.4", etc.
        match = re.match(r'^(\d+)', name)
        if match:
            major = int(match.group(1))
            # Only consider modern GNOME versions
            if major >= 40:
                versions.add(major)
    
    return max(versions) if versions else None

def get_supported_versions():
    try:
        with open('metadata.json', 'r') as f:
            metadata = json.load(f)
        # Parse versions as integers for comparison
        versions = []
        for v in metadata.get('shell-version', []):
            try:
                # Handle cases like "45" or "45.0"
                major = int(re.match(r'^(\d+)', str(v)).group(1))
                versions.append(major)
            except (ValueError, AttributeError):
                continue
        return versions
    except Exception as e:
        print(f"Error reading metadata.json: {e}")
        return []

def main():
    latest_major = get_latest_gnome_version()
    supported = get_supported_versions()
    
    if latest_major is None:
        print("Failed to detect latest GNOME version.")
        sys.exit(1)

    highest_supported = max(supported) if supported else 0
    
    print(f"Latest GNOME major version detected: {latest_major}")
    print(f"Highest supported version in metadata.json: {highest_supported}")

    new_version_found = "false"
    if latest_major > highest_supported:
        new_version_found = "true"
        print(f"New GNOME version {latest_major} detected!")
    else:
        print("No new GNOME version detected.")

    # Write to GitHub Actions output
    if 'GITHUB_OUTPUT' in os.environ:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write("new_version_found={}\n".format(new_version_found))
            f.write("latest_version={}\n".format(latest_major))

if __name__ == "__main__":
    main()
