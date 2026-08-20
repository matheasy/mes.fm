import os
import glob

# Subdomain directories to inject tracking into. Add more here to roll out
# tracking to additional subdomains later, then re-run this script.
SITES = ["mes.fm"]

SNIPPET = '<script src="/main_js/track.js" defer></script>'
MARKER = "<!-- PAGEVIEW-TRACKING-INSERTED -->"

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    if MARKER in content:
        return "skipped (already applied)"

    if "</body>" not in content:
        return "skipped (no </body> found)"

    new_block = MARKER + SNIPPET + "</body>"
    content = content.replace("</body>", new_block, 1)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return "updated"

def main():
    repo_path = os.path.expanduser("~/Documents/GitHub/mes.fm")

    html_files = []
    for site in SITES:
        site_path = os.path.join(repo_path, site)
        for filepath in glob.glob(os.path.join(site_path, "**", "*.html"), recursive=True):
            if "_http_" in filepath or "_https_" in filepath:
                continue
            html_files.append(filepath)

    print(f"Found {len(html_files)} HTML files across {SITES}.\n")

    updated = 0
    skipped = 0

    for filepath in sorted(html_files):
        result = process_file(filepath)
        rel_path = os.path.relpath(filepath, repo_path)
        print(f"{rel_path}: {result}")
        if result == "updated":
            updated += 1
        else:
            skipped += 1

    print(f"\nDone. Updated: {updated}, Skipped: {skipped}")

if __name__ == "__main__":
    main()
