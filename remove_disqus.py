import os
import re
import glob

REPO_ROOT = os.path.expanduser("~/Documents/GitHub/mes.fm")

# Matches every observed variant of the disqusloader <script> tag, e.g.:
#   <script src="../main_js/jquery.disqusloader.min.js?v=1.0.3" async></script>
#   <script src="https://mes.fm/main_js/jquery.disqusloader.min2c70.js?v=1.0.3" async></script>
DISQUS_SCRIPT_RE = re.compile(r'<script[^>]*disqusloader[^>]*></script>')

def fix_content(content):
    new_content = DISQUS_SCRIPT_RE.sub('', content)
    return new_content, new_content != content

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
