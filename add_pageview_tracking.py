import os
import glob

# Subdomain directories to inject tracking into. Add more here to roll out
# tracking to additional subdomains later, then re-run this script.
# ai/, crypto/, and mfa/ are separate Next.js apps (not static HTML) and are
# not handled by this script -- they need the tracking script added to their
# own root layout component instead.
SITES = [
    "mes.fm",
    "bmicalculator.mes.fm",
    "chinchatcomics.mes.fm",
    "gpacalculator.mes.fm",
    "gradecalculator.mes.fm",
    "inflationcalculator.mes.fm",
    "mortgagecalculator.mes.fm",
    "percentagecalculator.mes.fm",
    "pokemongocalculator.mes.fm",
    "speedreader.mes.fm",
    "timer.mes.fm",
    "vatcalculator.mes.fm",
    "youtubemoney.mes.fm",
]

MARKER = "<!-- PAGEVIEW-TRACKING-INSERTED -->"

def snippet_for(site):
    # mes.fm serves the tracking script itself, so same-origin pages can use
    # a root-relative path. Every other subdomain is a different origin and
    # must point at mes.fm explicitly -- cross-origin <script src> execution
    # doesn't need CORS, only the sendBeacon() call inside it does, and that
    # endpoint already sends Access-Control-Allow-Origin: *.
    if site == "mes.fm":
        return '<script src="/main_js/track.js" defer></script>'
    return '<script src="https://mes.fm/main_js/track.js" defer></script>'

def process_file(filepath, snippet):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    if MARKER in content:
        return "skipped (already applied)"

    if "</body>" not in content:
        return "skipped (no </body> found)"

    new_block = MARKER + snippet + "</body>"
    content = content.replace("</body>", new_block, 1)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return "updated"

def main():
    repo_path = os.path.expanduser("~/Documents/GitHub/mes.fm")

    updated = 0
    skipped = 0

    for site in SITES:
        snippet = snippet_for(site)
        site_path = os.path.join(repo_path, site)
        html_files = [
            f for f in glob.glob(os.path.join(site_path, "**", "*.html"), recursive=True)
            if "_http_" not in f and "_https_" not in f
        ]

        print(f"--- {site}: {len(html_files)} HTML files ---")
        for filepath in sorted(html_files):
            result = process_file(filepath, snippet)
            rel_path = os.path.relpath(filepath, repo_path)
            print(f"{rel_path}: {result}")
            if result == "updated":
                updated += 1
            else:
                skipped += 1

    print(f"\nDone. Updated: {updated}, Skipped: {skipped}")

if __name__ == "__main__":
    main()
