import os
import glob

REPO_ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

def fix_content(content):
    original = content
    # Fix repeated "../" prefixes before absolute URLs (handle up to 3 levels deep)
    for _ in range(3):
        content = content.replace('../https://', 'https://')
        content = content.replace('../http://', 'http://')
    # Fix doubled protocol bug
    content = content.replace('httpshttps://', 'https://')
    content = content.replace('httphttp://', 'http://')
    return content, content != original

def main():
    html_files = glob.glob(os.path.join(REPO_ROOT, "**", "*.html"), recursive=True)

    fixed_count = 0
    for html_file in html_files:
        with open(html_file, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        new_content, changed = fix_content(content)

        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            fixed_count += 1
            rel = os.path.relpath(html_file, REPO_ROOT)
            print(f"Fixed: {rel}")

    print(f"\nDone. Fixed {fixed_count} files out of {len(html_files)} total.")

if __name__ == "__main__":
    main()
