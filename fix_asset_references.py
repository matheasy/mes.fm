import os
import re
import glob
import shutil
from urllib.parse import urlparse

REPO_ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

ASSET_EXTENSIONS = ('.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp')

# Matches src="...", href="...", data-src="..." attributes
ATTR_PATTERN = re.compile(r'(?:src|href|data-src)\s*=\s*["\']([^"\']+)["\']')

def get_asset_paths_from_html(html_content):
    paths = []
    for match in ATTR_PATTERN.finditer(html_content):
        url = match.group(1)
        # Strip query string / fragment
        clean_url = url.split('?')[0].split('#')[0]
        if clean_url.lower().endswith(ASSET_EXTENSIONS):
            paths.append(url)
    return paths

def resolve_local_path(html_filepath, url):
    """Best-effort resolution of a URL (absolute, protocol-relative, or relative) to a local repo path."""
    clean_url = url.split('?')[0].split('#')[0]

    if clean_url.startswith('//'):
        # protocol-relative, e.g. //mes.fm/main_img/foo.png
        parsed = urlparse('https:' + clean_url)
        domain = parsed.netloc
        path = parsed.path.lstrip('/')
        return os.path.join(REPO_ROOT, domain, path)
    elif clean_url.startswith('http://') or clean_url.startswith('https://'):
        parsed = urlparse(clean_url)
        domain = parsed.netloc
        path = parsed.path.lstrip('/')
        return os.path.join(REPO_ROOT, domain, path)
    elif clean_url.startswith('/'):
        # root-relative -- assume same domain as the html file's own subdomain folder
        html_dir = os.path.dirname(html_filepath)
        rel_to_repo = os.path.relpath(html_dir, REPO_ROOT)
        domain = rel_to_repo.split(os.sep)[0]
        path = clean_url.lstrip('/')
        return os.path.join(REPO_ROOT, domain, path)
    else:
        # relative path
        html_dir = os.path.dirname(html_filepath)
        return os.path.normpath(os.path.join(html_dir, clean_url))

def find_hash_renamed_candidate(expected_path):
    """Look for a HTTrack-renamed version of a missing file in the same directory."""
    directory = os.path.dirname(expected_path)
    filename = os.path.basename(expected_path)
    name, ext = os.path.splitext(filename)

    if not os.path.isdir(directory):
        return None

    candidates = []
    for f in os.listdir(directory):
        f_name, f_ext = os.path.splitext(f)
        if f_ext.lower() == ext.lower() and f_name.startswith(name) and f_name != name:
            candidates.append(f)

    if len(candidates) == 1:
        return os.path.join(directory, candidates[0])
    return None  # none found, or ambiguous (multiple candidates)

def main():
    html_files = glob.glob(os.path.join(REPO_ROOT, "**", "*.html"), recursive=True)

    all_refs = set()  # (html_file, url, resolved_expected_path)
    for html_file in html_files:
        with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        for url in get_asset_paths_from_html(content):
            expected_path = resolve_local_path(html_file, url)
            all_refs.add((html_file, url, expected_path))

    print(f"Found {len(all_refs)} unique asset references across {len(html_files)} HTML files.\n")

    fixed = []
    already_ok = 0
    unresolved = []
    ambiguous = []

    for html_file, url, expected_path in sorted(all_refs, key=lambda x: x[2]):
        if os.path.isfile(expected_path):
            already_ok += 1
            continue

        directory = os.path.dirname(expected_path)
        filename = os.path.basename(expected_path)
        name, ext = os.path.splitext(filename)

        if os.path.isdir(directory):
            candidates = [f for f in os.listdir(directory)
                          if os.path.splitext(f)[1].lower() == ext.lower()
                          and os.path.splitext(f)[0].startswith(name)
                          and os.path.splitext(f)[0] != name]
        else:
            candidates = []

        if len(candidates) == 1:
            src = os.path.join(directory, candidates[0])
            shutil.copy2(src, expected_path)
            fixed.append((url, expected_path, candidates[0]))
        elif len(candidates) > 1:
            ambiguous.append((url, expected_path, candidates))
        else:
            unresolved.append((url, expected_path))

    print(f"Already OK: {already_ok}")
    print(f"Fixed: {len(fixed)}")
    for url, expected_path, source_name in fixed:
        rel = os.path.relpath(expected_path, REPO_ROOT)
        print(f"  {rel}  <-- copied from {source_name}")

    print(f"\nAmbiguous (multiple candidates, skipped): {len(ambiguous)}")
    for url, expected_path, candidates in ambiguous:
        rel = os.path.relpath(expected_path, REPO_ROOT)
        print(f"  {rel}  <-- candidates: {candidates}")

    print(f"\nUnresolved (genuinely missing, no candidate found): {len(unresolved)}")
    for url, expected_path in unresolved:
        rel = os.path.relpath(expected_path, REPO_ROOT)
        print(f"  {rel}  (referenced as: {url})")

if __name__ == "__main__":
    main()
