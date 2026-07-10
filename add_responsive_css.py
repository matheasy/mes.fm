import os
import glob

RESPONSIVE_CSS = """
@media (max-width: 768px) {
  .outer-container { width: 100% !important; margin: 0 !important; }
  .outer-page-content { width: 100% !important; display: block !important; }
  .side-bar { width: 100% !important; float: none !important; }
  .page-box { width: auto !important; display: block !important; margin: 0 auto 0.5em auto !important; }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
}
"""

MARKER = "/* RESPONSIVE-FIX-INSERTED */"

def process_file(filepath):
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    if MARKER in content:
        return "skipped (already applied)"

    if "</style>" not in content:
        return "skipped (no </style> found)"

    new_block = MARKER + RESPONSIVE_CSS + "</style>"
    content = content.replace("</style>", new_block, 1)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return "updated"

def main():
    repo_path = os.path.expanduser("~/Documents/GitHub/mes.fm")
    html_files = glob.glob(os.path.join(repo_path, "**", "*.html"), recursive=True)

    print(f"Found {len(html_files)} HTML files.\n")

    updated = 0
    skipped = 0

    for filepath in html_files:
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
