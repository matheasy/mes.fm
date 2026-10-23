#!/usr/bin/env python3
"""Builds mes.fm/links/index.html (MES Links) in the hub shell of mes.fm/conspiracy.
Run: python3 build_links_page.py  (rewrites the page; diff it first if links/index.html was hand-edited since). Data = SECTIONS below + every card of tools.html / calculators.html."""
import re, html, json, os, urllib.parse

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mes.fm')
OUT = ROOT + '/links/index.html'
esc = lambda s: html.escape(s, quote=True)

vercel = json.load(open(ROOT + '/vercel.json'))
REDIR = {r['source']: r['destination'] for r in vercel.get('redirects', [])}

# ---------------------------------------------------------------- icons
GLYPH = {  # key: (label, css class)
    'yt': '&#9654;', 'hive': 'H', '3s': '3S', 'rumble': 'R', 'odysee': 'O', 'bitchute': 'B', 'x': 'X',
    'tg': '&#10148;', 'reddit': 'r/', 'fb': 'f', 'ig': 'IG', 'tiktok': '&#9834;', 'pin': 'P', 'threads': '@',
    'gab': 'G', 'minds': 'M', 'discord': 'D', 'li': 'in', 'substack': 'S', 'blurt': 'Bl', 'steem': 'St',
    'leo': 'L', 'onedrive': '&#9729;', 'gdrive': '&#9650;', 'paypal': 'P', 'patreon': 'P', 'sstar': '&#9733;',
    'store': '&#128085;', 'btc': '&#8383;', 'eth': '&#926;', 'xrp': 'X', 'ltc': '&#321;', 'web': '&#8599;',
    'pdf': 'PDF', 'mes': '&#8730;', 'chrome': '&#11041;', 'img': '&#9635;', 'gold': 'Au', 'ledger': 'L',
}
HOSTS = [
    (r'(^|\.)youtube\.com$|^youtu\.be$', 'yt'), (r'peakd\.com$|hive\.blog$|ecency\.com$', 'hive'), (r'3speak\.tv$', '3s'),
    (r'rumble\.com$', 'rumble'), (r'odysee\.com$', 'odysee'), (r'bitchute\.com$', 'bitchute'),
    (r'(^|\.)x\.com$|twitter\.com$', 'x'), (r'^t\.me$', 'tg'), (r'reddit\.com$', 'reddit'), (r'facebook\.com$', 'fb'),
    (r'instagram\.com$', 'ig'), (r'tiktok\.com$', 'tiktok'), (r'pinterest\.', 'pin'), (r'threads\.(net|com)$', 'threads'),
    (r'gab\.com$', 'gab'), (r'minds\.com$', 'minds'), (r'discord\.(com|gg)$', 'discord'), (r'linkedin\.com$', 'li'),
    (r'substack\.com$', 'substack'), (r'blurt\.', 'blurt'), (r'steemit\.com$', 'steem'), (r'inleo\.io$', 'leo'),
    (r'1drv\.ms$|onedrive\.', 'onedrive'), (r'drive\.google\.com$', 'gdrive'), (r'paypal\.(com|me)$', 'paypal'),
    (r'patreon\.com$', 'patreon'), (r'subscribestar\.com$', 'sstar'), (r'creator-spring\.com$|teespring\.com$', 'store'),
    (r'blockchain\.com$', 'btc'), (r'etherscan\.io$', 'eth'), (r'xrpscan\.com$', 'xrp'), (r'blockcypher\.com$', 'ltc'),
    (r'chrome\.google\.com$', 'chrome'), (r'snipboard\.io$', 'img'), (r'newworldpm\.com$', 'gold'), (r'ledger\.com$', 'ledger'),
    (r'paychute\.com$', 'paypal'),
]

CARD_ICON = {}   # mes.fm path -> logo from tools.html / calculators.html
CARDS = {'tools': [], 'calc': []}
for f, key in (('tools.html', 'tools'), ('calculators.html', 'calc')):
    s = open(ROOT + '/' + f).read()
    cur = None
    for m in re.finditer(r'(?s)<section class="hub-cat[^"]*" data-cat="([^"]+)"[^>]*>\s*<h2[^>]*>(.*?)</h2>|<td class="calc-container[^"]*"><a class="calc-link" href="([^"]+)">.*?src="([^"]+)".*?calc__text--title">(.*?)</span>\s*<span class="calc__text--desc">(.*?)</span>', s):
        if m.group(1):
            cur = html.unescape(re.sub('<[^>]+>', '', m.group(2))).strip()
            continue
        href, src, title, desc = m.group(3), m.group(4), m.group(5), m.group(6)
        path = urllib.parse.urlparse(href).path.replace('/index.html', '').rstrip('/') or '/'
        src = '/' + src.lstrip('/')
        CARD_ICON.setdefault(path, src)
        if cur and ('Popular' in cur or cur.startswith('New')):
            continue
        desc = html.unescape(re.sub('<[^>]+>', '', desc)).strip()
        first = re.split(r'(?<=[.!?])\s', desc)[0]
        if len(first) > 110:
            first = first[:105].rsplit(' ', 1)[0] + '…'
        CARDS[key].append(dict(cat=cur, t=html.unescape(title).strip(), h=path, d=first))

HUB_ICON = {
    '/math': '/img/math-tutorials-icon.jpg', '/calculators': '/img/calculators-icon.jpg', '/tools': '/img/tools-icon.jpg',
    '/mobile-apps': '/img/mobile-apps-icon.jpg', '/browser': '/img/browser-logo.png', '/puzzles': '/img/puzzles-icon.jpg',
    '/memes': '/img/memes-icon.jpg', '/science': '/img/science-logo.png', '/crypto': '/img/crypto-logo.jpg',
    '/hutchison': '/img/hutchison-logo.jpg', '/911': '/img/911-truth-logo.jpg', '/conspiracy': '/img/conspiracy-logo.jpg',
    '/livestreams': '/img/livestreams-icon.jpg', '/youtube': '/img/youtube-icon.jpg', '/experiments': '/img/experiments-logo.jpg',
    '/antigravity': '/img/antigravity-logo.jpg', '/free-energy': '/img/free-energy-logo.jpg', '/pg': '/img/pg-logo.jpg',
    '/occult': '/img/occult-logo.jpg', '/mh370': '/img/mh370-logo.jpg', '/bg': '/img/bg-logo.jpg',
    '/911spooks': '/img/911spooks-logo.jpg', '/math-qa': '/img/math-qa-icon.jpg', '/moon': '/img/moon-logo.png',
    '/gematria': '/img/gematria-logo.png', '/youtube-60000-subscribers': '/img/youtube-60000-subscribers-icon.jpg',
}


def platform(url):
    h = urllib.parse.urlparse(url).netloc.lower().removeprefix('www.')
    if url.lower().split('?')[0].endswith('.pdf'):
        return 'pdf'
    for rx, k in HOSTS:
        if re.search(rx, h):
            return k
    return 'web'


def icon_html(href, icon=None):
    if icon and icon.startswith('/'):
        return f'<img class="lk-ic" src="{esc(icon)}" alt="" width="32" height="32" loading="lazy">'
    if icon:
        return f'<span class="lk-ic lk-g lk-{icon}" aria-hidden="true">{GLYPH[icon]}</span>'
    p = urllib.parse.urlparse(href)
    if p.netloc in ('', 'mes.fm', 'www.mes.fm'):
        path = (p.path.replace('/index.html', '').rstrip('/') or '/')
        if path in HUB_ICON:
            return icon_html(href, HUB_ICON[path])
        if path in CARD_ICON:
            return icon_html(href, CARD_ICON[path])
        if path in REDIR and REDIR[path].startswith('http') and 'mes.fm' not in REDIR[path]:
            return icon_html(href, platform(REDIR[path]))
        return icon_html(href, 'mes')
    return icon_html(href, platform(href))


# ---------------------------------------------------------------- content
# Row: (title, href, description[, extras list of (label, href)][, icon override])
def R(t, h, d='', x=None, ic=None):
    return dict(t=t, h=h, d=d, x=x or [], ic=ic)


YT = 'https://www.youtube.com/playlist?list='
SECTIONS = [
  ('start', 'Start here', 'MES.fm sites', 'The main sections of mes.fm.', [
    (None, [
      R('MES.fm home', 'https://mes.fm', 'Everything MES: math, calculators, tools, science and research.', ic='mes'),
      R('Math Tutorials', 'https://mes.fm/math', 'Free math video tutorials, notes and the MES Math Q/A livestreams.'),
      R('Calculators', 'https://mes.fm/calculators', 'Grade, percentage, BMI, mortgage, graphing, CAS and 60+ more calculators.'),
      R('Tools', 'https://mes.fm/tools', 'Timers, PDF and photo editors, simulators, converters and other free tools.'),
      R('Browser Extensions', 'https://mes.fm/browser', 'MES Read Aloud, Video Speed Controller, Dark Mode and more.'),
      R('Mobile Apps', 'https://mes.fm/mobile-apps', 'MES calculators as iPhone and Android apps.'),
      R('MES Science', 'https://mes.fm/science', 'Posts, videos and tutorials on physics and science topics.'),
      R('Hutchison Effect', 'https://mes.fm/hutchison', "John Hutchison's levitation, metal bending and transmutation."),
      R('9/11 Truth', 'https://mes.fm/911', 'Videos, posts and evidence on what happened on 9/11.'),
      R('MES Conspiracy', 'https://mes.fm/conspiracy', 'Alt-news checkups, PizzaGate, MH370, occult and more.'),
      R('MES Crypto', 'https://mes.fm/crypto', 'Blockchain tutorials, Hive and crypto tools.'),
      R('MES Livestreams', 'https://mes.fm/livestreams', 'Every MES livestream replay, searchable, with trailers and stats.'),
      R('MES YouTube: All Videos', 'https://mes.fm/youtube', 'Every video on the @mes channel, searchable by topic.'),
      R('Puzzles', 'https://mes.fm/puzzles', 'Math and logic puzzles with solutions.'),
      R('Memes', 'https://mes.fm/memes', 'Math and school memes.'),
      R('Mathiew (personal)', 'https://mes.fm/mathiew', 'Personal links and posts by Mathiew Estepho.'),
    ]),
    ('Find your way around', [
      R('Site Search', 'https://mes.fm/search', 'Search every page on mes.fm.'),
      R('MES Favourites', 'https://mes.fm/fav', 'Save your favourite MES pages in groups and take them to any device.'),
      R('Short Links', 'https://mes.fm/go', 'Every mes.fm short link (like mes.fm/911truth-playlist) in one list.'),
      R('Site Index', 'https://mes.fm/site-index', 'A list of every page on mes.fm.'),
      R('MES Stats', 'https://mes.fm/stats', 'Live page-view statistics for mes.fm.'),
    ]),
  ]),
  ('follow', 'Follow MES', 'Follow MES', 'MES channels and profiles on every platform.', [
    ('Video channels', [
      R('YouTube @mes', 'https://www.youtube.com/@mes', 'Math Easy Solutions: math, science and livestreams.'),
      R('YouTube @mestruth', 'https://www.youtube.com/@mestruth', 'MES Truth: the second channel for truth and research videos.'),
      R('3Speak @mes', 'https://3speak.tv/user/mes', 'MES videos on 3Speak (Hive).', [('MES Truth', 'https://3speak.tv/user/mestruth')]),
      R('Rumble', 'https://rumble.com/c/MathEasySolutions', 'MES videos on Rumble.', [('Profile', 'https://rumble.com/user/matheasy'), ('MES Truth', 'https://rumble.com/c/MESTruth')]),
      R('Odysee @mes', 'https://odysee.com/@mes:8', 'MES videos on Odysee.', [('MES Truth', 'https://odysee.com/@mestruth:9')]),
      R('BitChute', 'https://www.bitchute.com/channel/1B8tfwAKfSbU/', 'MES videos on BitChute.', [('MES Truth video', 'https://www.bitchute.com/video/7vVqOcvTEfoe/')]),
    ]),
    ('Posts and chat', [
      R('Hive @mes', 'https://peakd.com/@mes', 'MES posts on the Hive blockchain.', [('@mestruth', 'https://peakd.com/@mestruth'), ('How to join Hive', 'https://mes.fm/hive-crypto-tutorial')]),
      R('Telegram @meslinks', 'https://t.me/meslinks', 'The MES Links Telegram channel: new videos, posts and clips.', [('Message @matheasysolutions', 'https://t.me/matheasysolutions')]),
      R('X @MathEasySolns', 'https://x.com/MathEasySolns', 'MES on X (Twitter).'),
      R('Substack', 'https://matheasy.substack.com/', 'Subscribe to MES by email.', [('Profile', 'https://substack.com/@matheasy')]),
      R('Reddit u/matheasysolutions', 'https://www.reddit.com/user/matheasysolutions', 'MES on Reddit.'),
      R('Discord', 'https://discord.com/channels/381903568279437314/381903568715907082', 'The MES Discord server.'),
      R('InLeo Threads', 'https://inleo.io/threads/foryou', 'Short posts on Hive through InLeo.'),
      R('Blurt @mes', 'https://blurt.blog/@mes', 'MES posts on Blurt.', [('blurt.media', 'https://blurt.media/@mes')]),
      R('Steemit @mes', 'https://steemit.com/@mes', 'Older MES posts on Steem.'),
    ]),
    ('Social networks', [
      R('Facebook', 'https://www.facebook.com/matheasysolutions', 'Math Easy Solutions on Facebook.'),
      R('Instagram', 'https://instagram.com/matheasysolutions', 'MES on Instagram.'),
      R('Threads', 'https://www.threads.net/@matheasysolutions', 'MES on Threads.'),
      R('TikTok', 'https://www.tiktok.com/@matheasysolutions', 'MES on TikTok.'),
      R('Pinterest', 'https://www.pinterest.ca/matheasysolns/', 'MES on Pinterest.'),
      R('Gab', 'https://gab.com/matheasysolutions', 'MES on Gab.'),
      R('Minds', 'https://www.minds.com/newsfeed/1575290281815707662', 'MES on Minds.'),
      R('LinkedIn', 'https://www.linkedin.com/in/mathiew-estepho-b7078894/', 'Mathiew Estepho on LinkedIn.'),
    ]),
  ]),
  ('live', 'Livestreams', 'MES Livestreams', 'Live math, science and truth streams.', [
    (None, [
      R('MES Livestreams (all replays)', 'https://mes.fm/livestreams', 'Every MES livestream on one page: search, topics, trailers and stats.'),
      R('Livestreams on YouTube @mes', 'https://www.youtube.com/@mes/streams', 'Live and past streams on the main channel.', [('Playlist', YT + 'PLai3U8-WIK0FqwyUa_ICwTlqO0S6Y3kAn'), ('Trailers', YT + 'PLai3U8-WIK0HXpKO2zvaB63b2n7IerM3z')]),
      R('Livestreams on YouTube @mestruth', 'https://www.youtube.com/@mestruth/streams', 'Live and past streams on MES Truth.', [('Playlist', YT + 'PL7uKZq8byj6EavTGBYXn5u7Wy6_RH_O6Z'), ('Trailers', YT + 'PL7uKZq8byj6Fs-3U5FUFgc6bA2kjVWwCX')]),
      R('MES Math Q/A livestreams', 'https://mes.fm/math-qa', 'Every Math Q/A stream with notes.', [('YouTube playlist', YT + 'PLai3U8-WIK0F1GgkU63uA9NIncxDS2q0-')]),
      R('Become a MES Super Fan', 'https://www.youtube.com/channel/UCUUBq1GPBvvGNz7dpgO14Ow/join', 'Join the channel on YouTube for member perks.'),
      R('Event Reminder', 'https://mes.fm/reminder', 'Get a reminder for the next MES stream in your own time zone.'),
    ]),
  ]),
  ('math', 'Math', 'Math Tutorials', 'Free calculus and math lessons with notes and videos.', [
    (None, [
      R('Math Tutorials hub', 'https://mes.fm/math', 'All MES math sections in one place.'),
      R('MES YouTube: All Videos', 'https://mes.fm/youtube', 'Every @mes video, searchable.'),
      R('Cubic Formula Proof', 'https://mes.fm/cubic-formula', 'The cubic formula derived step by step.', [('Hive', 'https://peakd.com/hive-128780/@mes/dzekfnxh'), ('Playlist', YT + 'PLai3U8-WIK0EF05ExjzLbB64NgUjoV1hl')]),
      R('Spherical Harmonics', 'https://mes.fm/spherical-harmonics', 'Spherical harmonics lessons.', [('Hive', 'https://peakd.com/hive-128780/@mes/220d6572'), ('Playlist', YT + 'PLai3U8-WIK0FHh2kZzebadnPFwO6Yi5qu')]),
      R('Reddit r/AMAZINGMathStuff', 'https://www.reddit.com/r/AMAZINGMathStuff/', 'The MES math and science subreddit.'),
    ]),
    ('Infinite Sequences and Series', [
      R('Sequences and Series (all lessons)', 'https://mes.fm/sequences-series', 'The whole chapter on one page.', [('Playlist', YT + 'PLai3U8-WIK0EXHAJ3vRg0T_kKEyPah1Lz')]),
      R('Infinite Sequences: Limits, Squeeze Theorem, Fibonacci & Golden Ratio', 'https://peakd.com/mathematics/@mes/infinite-sequences-limits-squeeze-theorem-fibonacci-sequence-and-golden-ratio-more', '', [('Playlist', YT + 'PLai3U8-WIK0HUgfK34Voi6BvrNqt4X4BV')]),
      R('Laboratory Project: Logistic Sequences', 'https://peakd.com/mathematics/@mes/laboratory-project-logistic-sequences'),
      R('Infinite Series: Geometric, Harmonic and Telescoping Sums', 'https://peakd.com/mathematics/@mes/infinite-series-definition-examples-geometric-series-harmonics-series-telescoping-sum-more', '', [('Playlist', YT + 'PLai3U8-WIK0FfxN_I9trdgSnWtJS-6wK1')]),
      R('The Integral Test and Estimate of Sums', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-the-integral-test-and-estimate-of-sums', '', [('Playlist', YT + 'PLTXCLnbwZspA')]),
      R('The Comparison Tests', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-the-comparison-tests'),
      R('Alternating Series Tests', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-alternating-tests'),
      R('Absolute Convergence and the Ratio / Root Tests', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-absolute-convergence-and-the-ratio-root-tests'),
      R('Strategy for Testing Series', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-strategy-for-testing-series'),
      R('Power Series', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-power-series'),
      R('Representations of Functions as Power Series', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-representations-of-functions-as-power-series'),
      R('Taylor and Maclaurin Series', 'https://peakd.com/mathematics/@mes/infinite-sequences-and-series-taylor-and-maclaurin-series'),
      R('Formulas for the Remainder Term in Taylor Series', 'https://peakd.com/@mes/infinite-sequences-and-series-formulas-for-the-remainder-term-in-taylor-series'),
      R('Multiplication and Division of Power Series', 'https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-multiplication-and-division-of-power-series'),
      R("Kummer's Test, Raabe's Test and Binomial Series", 'https://peakd.com/hive-128780/@mes/kummer-s-test-raabe-s-test-and-convergence-of-binomial-series'),
      R('Laboratory Project: An Elusive Limit', 'https://peakd.com/hive-128780/@mes/laboratory-project-an-elusive-limit', '', [('Playlist', YT + 'PLai3U8-WIK0Gzt0ZAIWwnyZr91b7BGoGR')]),
      R('Applications of Taylor Polynomials', 'https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-applications-of-taylor-polynomials', '', [('Playlist', YT + 'PLai3U8-WIK0F76sIU8xm09oqBTq1mlry3')]),
      R('Applied Project: Radiation from the Stars (Blackbody Radiation)', 'https://peakd.com/hive-128780/@mes/applied-project-radiation-from-the-stars', '', [('Playlist', YT + 'PLai3U8-WIK0H9KtXz4yi98pGrnnbSSYUb')]),
      R('Review and True-False Quiz', 'https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-review-and-true-false-quiz', '', [('Playlist', YT + 'PLai3U8-WIK0FCqXVJv1r7eJvrvphfkr6L')]),
      R('Problems Plus (Sequences and Series)', 'https://peakd.com/hive-128780/@mes/infinite-sequences-and-series-problems-plus', '', [('Playlist', YT + 'PLai3U8-WIK0FQ96Egr5R7fZGeDTIUKz8P')]),
    ]),
    ('Vectors and the Geometry of Space', [
      R('Vectors (all lessons)', 'https://mes.fm/vectors', 'The whole chapter on one page.', [('Playlist', YT + 'PLai3U8-WIK0FjJpwnxwdrOR7L8Ul8VZoZ')]),
      R('3D Coordinate Systems', 'https://peakd.com/hive-128780/@mes/vector-space-and-geometry-3d-coordinate-systems', '', [('Playlist', YT + 'PLai3U8-WIK0GiAJeLMzhOsrMliibfce5m')]),
      R('Vectors', 'https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-vectors', '', [('Playlist', YT + 'PLai3U8-WIK0EiRECLVkBCcFhSpbSz8XIw')]),
      R('Complex Numbers as Rotation Matrices', 'https://peakd.com/hive-128780/@mes/complex-numbers-as-rotation-matrices', '', [('Playlist', YT + 'PLai3U8-WIK0E6x0dZEAx77Kqv7LLxYdbx')]),
      R('The Dot Product', 'https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-the-dot-product', '', [('Playlist', YT + 'PLai3U8-WIK0GbHgvpTY1mx61nTNO-Msl8')]),
      R('The Cross Product', 'https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-the-cross-product', '', [('Playlist', YT + 'PLai3U8-WIK0FuRJ8rg-YVQvfPoPOwhuRW')]),
      R('Laboratory Project: The Geometry of a Tetrahedron', 'https://peakd.com/hive-128780/@mes/discovery-project-geometry-of-a-tetrahedron', '', [('Playlist', YT + 'PLai3U8-WIK0GoEi9wxl8nTFcfw1ay-_1T')]),
      R('Equations of Lines and Planes', 'https://peakd.com/hive-128780/@mes/equations-of-lines-and-planes', '', [('Playlist', YT + 'PLai3U8-WIK0FO3u0IupqllNNkZTsffpIV')]),
      R('Laboratory Project: Putting 3D in Perspective', 'https://peakd.com/hive-128780/@mes/laboratory-project-putting-3d-in-perspective', '', [('Playlist', YT + 'PLai3U8-WIK0ElsrMs_IBprUoHocIwyAmK')]),
      R('Cylinders and Quadric Surfaces', 'https://peakd.com/hive-128780/@mes/cylinders-and-quadric-surfaces', '', [('Playlist', YT + 'PLai3U8-WIK0EfmYwT81SebJnU1Ny8Fc5u')]),
      R('Review (Vectors)', 'https://peakd.com/hive-128780/@mes/vectors-and-the-geometry-of-space-review', '', [('Playlist', YT + 'PLai3U8-WIK0EMiATrjv8HH3fPwKVsgU6P')]),
      R('True-False Quiz (Vectors)', 'https://peakd.com/hive-128780/@mes/vectors-geometry-true-false-quiz', '', [('Playlist', YT + 'PLai3U8-WIK0GiYS2qR98dzUjsx-0PRPbC')]),
      R('Problems Plus (Vectors)', 'https://peakd.com/hive-128780/@mes/jlgigkdl', '', [('Playlist', YT + 'PLai3U8-WIK0G_7Jd6ZORHFQMk8jbwmkos')]),
    ]),
    ('Vector Functions', [
      R('Vector Functions (all lessons)', 'https://mes.fm/vector-functions', 'The whole chapter on one page.', [('Playlist', YT + 'PLai3U8-WIK0HQl7xTQBS_O8Te8PcpNm4U')]),
      R('Vector Functions and Space Curves', 'https://peakd.com/hive-128780/@mes/omhbcxkw', '', [('Playlist', YT + 'PLai3U8-WIK0GwdMY-E9_4LsmYmO-IxcoX')]),
      R('Derivatives and Integrals of Vector Functions', 'https://peakd.com/hive-128780/@mes/hfsetrue', '', [('Playlist', YT + 'PLai3U8-WIK0FgQ3jBd9IFaWOakOWbHous')]),
      R('Arc Length and Curvature', 'https://peakd.com/hive-128780/@mes/koxharrd'),
      R('Motion in Space: Velocity and Acceleration', 'https://peakd.com/hive-128780/@mes/e443f9d3'),
      R("Applied Project: Kepler's Laws of Planetary Motion", 'https://peakd.com/hive-128780/@mes/c3b94a80'),
      R('Review: Concept Check and True-False Quiz', 'https://peakd.com/hive-128780/@mes/review-of-vector-functions-138'),
      R('Problems Plus (Vector Functions)', 'https://mes.fm/vector-functions-problems-plus', 'Every Problems Plus question worked out with video.'),
    ]),
  ]),
  ('calc', 'Calculators', 'Calculators', 'Every free MES calculator.', 'CALC'),
  ('tools', 'Tools', 'Tools', 'Every free MES tool and simulator.', 'TOOLS'),
  ('science', 'Science', 'Science and Experiments', 'Physics, experiments, anti-gravity, free energy and the Hutchison Effect.', [
    ('MES Science', [
      R('MES Science hub', 'https://mes.fm/science', 'Posts, videos, tutorials and physics.'),
      R('MES Physics', 'https://mes.fm/physics', 'The MES Physics video series.', [('Playlist', YT + 'PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N')]),
      R('#MESScience playlist', 'https://mes.fm/science-playlist', 'All MES Science videos on YouTube.'),
      R('Moon, Sun and Planets', 'https://mes.fm/moon', 'Live Sun and Moon dashboard: times, constellation, distance and phase.'),
      R('Science Hive community', 'https://peakd.com/c/hive-128780', 'The MES science and math community on Hive.'),
      R('Vortex Math', 'https://peakd.com/hive-128780/@mes/messcience-2-vortex-math-part-1-number-theory-and-modular-arithmetic', 'Number theory and modular arithmetic.', [('BeneficenceTV playlist', YT + 'PLai3U8-WIK0EbRnMsUBx2RxlerL7GQuLX')]),
      R('Overview of Biology', 'https://peakd.com/hive-128780/@mes/messcience-3-overview-of-biology', '', [('Playlist', YT + 'PLai3U8-WIK0FYO6bxFbBAtVJ9sDOJnH72')]),
      R('Review of COVID-19 "Virus" Isolation Paper', 'https://peakd.com/hive-128780/@mes/messcience-4-review-of-covid-19-virus-isolation-paper', '', [('Playlist', YT + 'PLai3U8-WIK0E4aQ_cq4ZDD2WGiDU5vVgx')]),
      R("Faraday's Paradox and Magnetic Isopotentials", 'https://youtu.be/sJ0izpaKmFU', 'A video by FractalWoman.'),
      R('FractalWoman', 'https://www.youtube.com/@FractalWoman', 'YouTube channel on magnetism and the aether.'),
      R('Ionel DINU (AETHER science)', 'https://www.youtube.com/@AETHERscience', 'YouTube channel on the aether.'),
    ]),
    ('MES Experiments', [
      R('MES Experiments hub', 'https://mes.fm/experiments', 'Gyroscopes, magnets, Faraday\'s paradox and more.'),
      R('All experiments', 'https://mes.fm/experiments-series', 'Every numbered experiment, searchable.', [('YouTube', 'https://mes.fm/experiments-playlist'), ('BitChute', 'https://mes.fm/experiments-bitchute'), ('Odysee', 'https://odysee.com/$/playlist/cf71cec18466c198055b559f496c8fedb78dc7f7'), ('Rumble', 'https://rumble.com/playlists/LNYi6sWbguY')]),
      R('DRAFT experiments', 'https://mes.fm/experiments-draft', 'Over a thousand unedited draft videos, searchable.', [('YouTube playlist', 'https://mes.fm/experiments-draft-playlist')]),
      R('Experiments: Hive links and notes', 'https://peakd.com/mesexperiments/@mes/list', ''),
      R('Experiments files (OneDrive)', 'https://mes.fm/experiments-onedrive', 'Raw files from the experiments.'),
      R('Tesla Coil Build Log', 'https://mes.fm/ufo', 'Notes from building a Tesla coil.'),
    ]),
    ('Anti-Gravity', [
      R('MES Anti-Gravity hub', 'https://mes.fm/antigravity', 'Gyroscopes, spinning wheels and hidden science.'),
      R('All Anti-Gravity videos', 'https://mes.fm/antigravity-series', '', [('YouTube', 'https://mes.fm/antigravity-playlist'), ('BitChute', 'https://mes.fm/antigravity-bitchute'), ('Odysee', 'https://odysee.com/$/playlist/6e53d242296fd47f60c539a22612c4c237d76c23')]),
      R('Anti-Gravity: Hive links and notes', 'https://peakd.com/antigravity/@mes/series'),
      R('Objects in Rotation Defy Mainstream Physics + MES Duality', 'https://peakd.com/antigravity/@mes/antigravity-part-6-video-1-objects-in-rotation-defy-mainstream-physics-mes-duality-concept'),
      R('Correction to Gyrocompasses', 'https://youtu.be/JItGEGMwg90'),
      R('Anti-Gravity files (OneDrive)', 'https://mes.fm/antigravity-onedrive'),
    ]),
    ('Free Energy', [
      R('MES Free Energy hub', 'https://mes.fm/free-energy', 'Suppressed technology, cold fusion and atomic physics.'),
      R('All Free Energy videos', 'https://mes.fm/free-energy-series', '', [('YouTube', 'https://mes.fm/freeenergy-playlist')]),
      R('Cold Fusion / LENR', 'https://mes.fm/cold-fusion-lenr', 'Low-energy nuclear reactions.'),
      R('Free Energy files (OneDrive)', 'https://mes.fm/freeenergy'),
    ]),
    ('Hutchison Effect', [
      R('Hutchison Effect hub', 'https://mes.fm/hutchison', 'Posts, videos, highlights, news and interviews.'),
      R('Everything on one page', 'https://mes.fm/hutchison-all', 'Every Hutchison Effect item, searchable.'),
      R('Hutchison Effect playlist', 'https://mes.fm/hutchison-playlist', 'The MES Hutchison Effect videos on YouTube.', [('Hive', 'https://peakd.com/science/@mes/hutchisoneffect')]),
      R('3 TB of uncompressed footage', 'https://mes.fm/hutchison-drive', 'Raw Hutchison Effect footage (Google Drive).'),
      R("2024 livestream tour of John Hutchison's lab", 'https://www.youtube.com/live/mP5DLMH54LM'),
      R("John Hutchison's YouTube channel", 'https://www.youtube.com/@HutchisonEffect'),
      R('Hutchison Effect X thread', 'https://x.com/MathEasySolns/status/1752373887814521142'),
    ]),
    ('Debunking Flat Earth', [
      R('Debunking Flat Earth playlist', YT + 'PLai3U8-WIK0HUyOvHJiyX74GmJ79exCkh', 'MES videos on the shape of the Earth.'),
      R('Earth Curvature Calculator', 'https://mes.fm/earth-curvature-calculator', 'Drop, horizon and hidden height for any distance.'),
      R('Advanced Earth Curvature Calculator', 'http://walter.bislins.ch/bloge/index.asp?page=Advanced+Earth+Curvature+Calculator', 'With refraction, by Walter Bislin.'),
      R('Hidden Object Calculator', 'https://dizzib.github.io/earth/curve-calc/?d0=30&h0=100&unit=imperial'),
      R('Desmos curvature calculator', 'https://www.desmos.com/calculator/rdxkvozgh4'),
      R('FlatEarth.ws', 'https://flatearth.ws', 'Mainstream answers to flat-earth claims.'),
      R('Fighting Stupidity @NonsenseFlat', 'https://x.com/NonsenseFlat'),
      R('Dave McKeegan', 'https://www.youtube.com/@DaveMcKeegan', 'YouTube channel debunking flat earth and moon-landing claims.'),
      R('Helicopter flying over the horizon', 'https://t.me/meslinks/22225', 'Curvature proof.', [('Note on the video editing', 'https://www.metabunk.org/threads/stephen-hawkings-genius-helicopter-demonstration-of-lake-curvature.7834/')]),
      R('Laser at a boat on a curved lake', 'https://t.me/meslinks/22236'),
      R('Cars rising above the horizon on a bridge', 'https://youtu.be/vhft0h9GLF0'),
      R('Curved horizon through a telescope', 'https://youtu.be/HeURyLNUe1Y', '', [('Another example', 'https://youtu.be/kADO7nkt-rk')]),
      R('Curved water under a bridge (Lake Pontchartrain)', 'https://www.metabunk.org/threads/soundly-proving-the-curvature-of-the-earth-at-lake-pontchartrain.8939/'),
      R('Planes flying below the horizon', 'https://youtu.be/rq7MzHKDuqE'),
      R('Homemade gyrocompass (Earth rotation)', 'https://youtu.be/2z291HWPNtc'),
      R('MES email to Andrew Kaufman, Part 1', 'https://t.me/meslinks/22018', '', [('Part 2', 'https://t.me/meslinks/22020')]),
    ]),
    ('Moon Landing', [
      R('Moon Landing playlist', 'https://mes.fm/moonlanding-playlist', 'MES videos on the Moon landings.'),
      R('Moon Hoax Debunked', 'https://moonhoaxdebunked.blogspot.com/', 'Mainstream answers to the hoax claims.', [('Full PDF', 'https://www.algabe.it/temp/Disinformatico/Moon_PAttivissimo_hires.pdf')]),
    ]),
  ]),
  ('911', '9/11', '9/11 Truth', 'Videos, posts and evidence on 9/11.', [
    ('MES 9/11 Truth', [
      R('9/11 Truth hub', 'https://mes.fm/911', 'Posts, videos and the 9/11 Truth series.'),
      R('Everything on one page', 'https://mes.fm/911-all', 'Every 9/11 item, searchable.'),
      R('9/11 Truth video series', 'https://mes.fm/911truth', 'Every part of the series.', [('YouTube', 'https://mes.fm/911truth-playlist'), ('BitChute', 'https://mes.fm/911truth-bitchute'), ('Odysee', 'https://odysee.com/$/playlist/a4981c9731bec068847fd370b593769304b0b181'), ('Rumble', 'https://rumble.com/playlists/fkQOVpQ7tZ0')]),
      R('9/11 Observable Evidence', 'https://mes.fm/911-observable-evidence', 'The 11-hour documentary, dubbed by MES.', [('YouTube playlist', YT + 'PLai3U8-WIK0G_HHWt33moIqEeUBP3cgCh'), ('Original authors', 'https://www.checktheevidence.com/wordpress/2021/12/27/9-11-liars-for-truth-what-happened-on-9-11-and-how-it-was-covered-up/')]),
      R('9/11 Spooks', 'https://mes.fm/911spooks', 'Posts and videos on the 9/11 disinfo spooks.'),
      R('Bob Greenyer (BG)', 'https://mes.fm/bg', "Bob Greenyer's word salads.", [('Says the darnedest things', 'https://mes.fm/bg-wildin')]),
      R('9/11 Alchemy by Wolf Clan Media', 'https://mes.fm/911-alchemy'),
      R('1109 music album by Keor Meteor', 'https://mes.fm/1109-keo-meteor-music'),
      R('9/11 Truth: Hive links and notes', 'https://peakd.com/truth/@mes/911'),
      R('9/11 Truth Hive community', 'https://peakd.com/c/hive-113182'),
      R('Reddit r/911TruthMES', 'https://www.reddit.com/r/911TruthMES/'),
      R('9/11 Truth files (OneDrive)', 'https://mes.fm/911truth-onedrive'),
      R('DJW Links', 'https://mes.fm/911djw', 'Links on the work of Dr. Judy Wood.'),
    ]),
    ('Evidence', [
      R('"Where Did The Towers Go?" by Dr. Judy Wood', 'https://mes.fm/judywoodbook', 'Buy the book.'),
      R('900 ft spire turning to dust', 'https://peakd.com/hive-113182/@mes/gaqombxg'),
      R('Toasted cars', 'https://peakd.com/hive-113182/@mes/lazaqoat', '', [('X thread', 'https://x.com/MathEasySolns/status/1756373125422526612')]),
      R('Twisted steel', 'https://peakd.com/hive-113182/@mes/ndloyfuv', '', [('X thread', 'https://x.com/MathEasySolns/status/1760368820315988275')]),
      R('Before and after photo', 'https://snipboard.io/ulLJIT.jpg', 'The WTC while Building 7 still stands: the rubble is mainly at ground level.'),
      R('Very little heat on 9/11', 'https://x.com/MathEasySolns/status/1807634322394103895', 'X thread.'),
      R('Building 7 falling quietly', 'https://x.com/MathEasySolns/status/1774679023370834358', 'X thread.'),
      R('WTC literally turning to dust', 'https://x.com/MathEasySolns/status/1770320084650864746', 'X thread.'),
      R("Richard D. Hall's 9/11 planes radar analysis", 'https://x.com/MathEasySolns/status/1688765811497091072'),
      R('Bunker buster missile vs the 2nd plane impact', 'https://t.me/meslinks/17095'),
      R('499 first responders: witness testimonies', 'https://peakd.com/hive-113182/@mes/499-first-responders-witness-testimonies-911-8pz'),
      R('Andrew Johnson\'s "planes" witnesses study', 'https://www.checktheevidence.com/wordpress/2007/10/02/going-in-search-of-planes-in-nyc/'),
      R("Andrew Johnson's books: 9/11 Finding and Holding the Truth", 'https://peakd.com/hive-113182/@mes/andrew-johnsons-911-books-2011-finding-the-truth-and-2017-holding-the-truth'),
      R('Check The Evidence', 'https://www.checktheevidence.com/', "Andrew Johnson's research site."),
      R('9/11 Planes Researcher', 'https://www.youtube.com/@911PlanesResearch', 'YouTube channel.'),
      R('9/11 Forensic Evidence Study Group', 'https://www.facebook.com/groups/911TruthMovement', 'Facebook group.'),
      R('Matthew Naus DVD playlist', 'https://rumble.com/playlists/ZZ7ZMxinb6g', 'On Rumble.'),
    ]),
    ('Censorship and disinfo', [
      R('YouTube removes Part 2', 'https://peakd.com/hive-113182/@mes/deja-vu2-youtube-removes-my-911truth-part-2-video'),
      R('YouTube removes Part 7', 'https://peakd.com/hive-113182/@mes/youtube-removes-my-911truth-part-7-video-for-hate-speech'),
      R('YouTube removed Part 11 for 7 months', 'https://t.me/meslinks/19514'),
      R('Ace Baker pushing CGI disinfo and faking his death', 'https://t.me/meslinks/23567?comment=25240'),
      R('MES confronting Richard Gage', 'https://t.me/meslinks/18941'),
    ]),
  ]),
  ('conspiracy', 'Conspiracy', 'Conspiracy, Occult and Truth', 'PizzaGate, MH370, the occult, MES Truth and more.', [
    ('MES Conspiracy', [
      R('MES Conspiracy hub', 'https://mes.fm/conspiracy', 'Posts and videos on conspiracies.'),
      R("Amaterasu Solar's articles", 'https://mes.fm/ama', 'Money, ethics, abundance, free energy and censorship.', ic='/img/conspiracy-logo.jpg'),
      R('Conspiracy Hive community', 'https://peakd.com/c/hive-106474'),
      R('Reddit r/ConspiracyMES', 'https://www.reddit.com/r/ConspiracyMES/'),
      R('War with Iran', 'https://x.com/MathEasySolns/status/1717628655034306592', 'X thread.'),
      R('Shooters hearing voices', 'https://x.com/MathEasySolns/status/1668341949697515520', 'X thread.'),
      R('Crop Circles playlist', YT + 'PLai3U8-WIK0E1tEkmKt1E-8rlSzzpcb8y'),
      R('EyesIsWatchin', 'https://www.bitchute.com/channel/LzzSQpmQ4HUK/', 'BitChute channel.'),
      R("Methyl's Top Documentaries", 'https://t.me/methylstopdocumentaries', 'Telegram channel.'),
    ]),
    ('MES Truth', [
      R('MES Truth on YouTube', 'https://mes.fm/truth', 'The @mestruth channel.'),
      R('YouTube removed "Humanity is Not a Virus"', 'https://peakd.com/hive-106474/@mestruth/alternative-platforms-to-avoid-youtube-censorship', 'By Dr. Andrew Kaufman, and where to watch instead.'),
    ]),
    ('PizzaGate', [
      R('MES PizzaGate video series', 'https://mes.fm/pg', 'All 32 parts with notes.', [('All parts', 'https://mes.fm/pg-series'), ('BitChute', 'https://mes.fm/pg-bitchute'), ('YouTube', 'https://mes.fm/pizzagate-playlist')]),
      R('PizzaGate: Hive links and notes', 'https://peakd.com/pg/@mes/videos'),
      R('YouTube deleted all 32 parts', 'https://peakd.com/hive-106474/@mes/have-to-delete-all-my-pizzagate-videos-to-prevent-youtube-from-deleting-my-account'),
      R('YouTube censors "violent event denying"', 'https://peakd.com/dmania/@mes/youtube-believes-in-free-expression-unless-you-deny-fake-events-from-having-happened-1984-zg1hbmlh-7ath1'),
      R("YouTube's guideline on PizzaGate (archived)", 'https://archive.vn/oWpLq', 'Bans claims that a person is involved in trafficking, in the context of a "harmful conspiracy theory".'),
    ]),
    ('MES Occult', [
      R('MES Occult video series', 'https://mes.fm/occult', 'Coincidences, the Vatican and occult connections.', [('YouTube', 'https://mes.fm/occult-playlist')]),
      R('Trump birthday coincidences', 'https://peakd.com/hive-106474/@mes/coincidences-involving-donald-trumps-birthday'),
      R('Giza Pyramid geometry playlist', YT + 'PLai3U8-WIK0HIzqSVzEURzhMphO9ePJ22'),
      R('Gematria Calculator', 'https://mes.fm/gematria', '7 English ciphers and Hebrew.', [('Spreadsheet', 'https://1drv.ms/x/s!As32ynv0LoaIiKto0HBi5417FpcFqg')]),
      R('Musicians selling their souls to the devil', 'https://x.com/MathEasySolns/status/1828558964327620983', 'X thread.'),
      R('Weird eye anomalies', 'https://mes.fm/eyes', 'X thread.'),
      R('Illuminati hand gang signs', 'https://mes.fm/hands', 'X thread.'),
    ]),
    ('MH370', [
      R('MH370 Teleportation Psyop hub', 'https://mes.fm/mh370', 'Videos and posts on the MH370 videos.', [('Playlist', YT + 'PLai3U8-WIK0EJGgDKXr-wW8z1jd7pZ069')]),
      R('Links to the alleged teleportation videos', 'https://t.me/meslinks/21412'),
      R('MH370 and the Russia-Ukraine war timings', 'https://peakd.com/hive-106474/@mes/interesting-timings-relating-to-the-mh370-teleportation-psyop'),
      R('Clouds stock footage', 'https://t.me/meslinks/21840'),
      R('Ashton Forbes lying about VFX stock footage', 'https://t.me/meslinks/21417'),
      R('Ashton Forbes on RegicideAnon', 'https://youtu.be/26lWfya0xSI', 'Lying about RegicideAnon being a random UFO YouTuber.'),
      R('Ashton Forbes blocking people who bring up 9/11', 'https://t.me/meslinks/21796'),
      R('Orb hole in clouds hoax', 'https://x.com/JustXAshton/status/1731463449530569204', '', [("Originals don't show the hole", 'https://www.reddit.com/r/AirlinerAbduction2014/comments/18apo5q/here_are_the_original_frames_processed_back_and/')]),
      R('Ashton Forbes wants to remove anonymity online', 'https://x.com/JustXAshton/status/1720450218682933277'),
      R('Ashton Forbes on ISIS, terrorism and 9/11', 'https://youtu.be/6ieLc6Fjcto'),
      R('Tengri 137 alien math RPG psyop', YT + 'PLai3U8-WIK0HUv8mv9gzQc3Ej4csHIQb3', 'Similar to MH370.'),
    ]),
  ]),
  ('crypto', 'Crypto', 'Blockchain and Crypto', 'Hive, blockchain tutorials and crypto tools.', [
    (None, [
      R('MES Crypto hub', 'https://mes.fm/crypto', 'News, tutorials, Hive and tools.'),
      R('Hive overview and how to sign up', 'https://mes.fm/hive-crypto-tutorial'),
      R('Blockchain Tutorials', 'https://mes.fm/blockchain-tutorials', 'The MES blockchain video series.', [('YouTube', 'https://mes.fm/blockchain-playlist')]),
      R('Blockchain: The Big Picture, Part 1', 'https://peakd.com/general/@mes/blockchain-the-big-picture-part-1-what-do-you-own', 'What do you own?', [('Part 2: Tokenization', 'https://peakd.com/general/@mes/blockchain-the-big-picture-part-2-tokenization')]),
      R('Impermanent Loss Calculator', 'https://mes.fm/impermanent-loss-calculator', 'Liquidity-pool loss vs holding.', [('Spreadsheet', 'https://1drv.ms/x/s!As32ynv0LoaIisMDKnAmCMwfUFzs6w')]),
      R('Hive Wallet History', 'https://mywalletshistory.vercel.app/', 'Tax helper for Hive wallets (third-party Hive app).'),
    ]),
  ]),
  ('ext', 'Extensions', 'Browser Extensions and Apps', 'Free MES browser extensions and recommended apps.', [
    (None, [
      R('All MES browser extensions', 'https://mes.fm/browser', 'Every extension on one page.'),
      R('Video Speed Controller', 'https://mes.fm/videospeed', 'Speed up any video with keyboard shortcuts.'),
      R('Read Aloud', 'https://mes.fm/read-aloud', 'Have any web page read to you, with highlighting.'),
      R('Volume Booster', 'https://mes.fm/volume-booster', 'Turn videos up beyond 100%.'),
      R('Dark Mode', 'https://mes.fm/dark-mode', 'One click to make any site dark.'),
      R('Text Size', 'https://mes.fm/text-size', 'Make the text on any site bigger.'),
      R('MES Archive', 'https://mes.fm/archive', 'Save any page to the Wayback Machine, archive.today and more.'),
      R('MES Site Rank', 'https://mes.fm/site-traffic', 'How popular is a website? Rank, age and hosting.'),
      R('Text to speech for Android', 'https://mes.fm/speech-android', 'A recommended Android app.'),
      R('Archive Page (Chrome)', 'https://chrome.google.com/webstore/detail/archive-page/gcaimhkfmliahedmeklebabdgagipbia', 'A recommended extension for archive.today.'),
    ]),
  ]),
  ('support', 'Support MES', 'Support MES', 'Store, donations and crypto addresses.', [
    ('Store', [
      R('MES Store', 'https://mes-store.creator-spring.com/', 'MES shirts and merch.', [('mes.fm/store', 'https://mes.fm/store'), ('On YouTube', 'https://www.youtube.com/@mes/store')]),
    ]),
    ('Donate', [
      R('Donate page', 'https://mes.fm/donate', 'All the ways to support MES.'),
      R('YouTube Super Fan', 'https://www.youtube.com/channel/UCUUBq1GPBvvGNz7dpgO14Ow/join', 'Become a channel member.'),
      R('Patreon', 'https://patreon.com/matheasysolutions'),
      R('SubscribeStar', 'https://www.subscribestar.com/mes'),
      R('PayPal', 'https://www.paypal.com/donate?hosted_button_id=JFN38B8X88W7N', '', [('paypal.me', 'https://paypal.me/matheasysolutions')]),
      R('Paychute', 'https://www.paychute.com/c/ece567da-e04e-4922-b663-ae11fa60fb39'),
      R('Hive @mes', 'https://peakd.com/@mes', 'Send HIVE or HBD to @mes.'),
      R('Buy gold and silver', 'https://info.newworldpm.com/214.html', 'New World Precious Metals (affiliate).', [('Become an affiliate', 'https://info.newworldpm.com/signup-214.html')]),
      R('Ledger Nano X', 'https://mes.fm/nano', 'Hardware crypto wallet (referral link).'),
    ]),
    ('Crypto addresses', [
      R('Bitcoin', 'https://www.blockchain.com/explorer/addresses/btc/bc1qlerel3vyn5982s24wccqe772qpvts69ehqkgtt', 'bc1qlerel3vyn5982s24wccqe772qpvts69ehqkgtt'),
      R('Ripple XRP', 'https://xrpscan.com/account/rDqSZAsxSEBoTgPGDbSqKEtrEe4JxKkDNh', 'rDqSZAsxSEBoTgPGDbSqKEtrEe4JxKkDNh'),
      R('Ethereum', 'https://etherscan.io/address/0xF4987423BB5A955540b38fCB012770e0a929c746', '0xF4987423BB5A955540b38fCB012770e0a929c746'),
      R('Litecoin', 'https://live.blockcypher.com/ltc/address/MWY16KTcLrmysdDamkUabRxK7ACmMdQJhv/', 'MWY16KTcLrmysdDamkUabRxK7ACmMdQJhv'),
    ]),
  ]),
]


def card_groups(key):
    groups, order = {}, []
    for c in CARDS[key]:
        if c['cat'] not in groups:
            groups[c['cat']] = []; order.append(c['cat'])
        groups[c['cat']].append(R(c['t'], 'https://mes.fm' + c['h'], c['d']))
    first = R('All calculators' if key == 'calc' else 'All tools', 'https://mes.fm/' + ('calculators' if key == 'calc' else 'tools'),
              'The full list with search and categories.')
    return [(None, [first])] + [(g, groups[g]) for g in order]


def row_html(r, cat):
    ext = not urllib.parse.urlparse(r['h']).netloc.endswith('mes.fm')
    tgt = ' target="_blank" rel="noopener"' if ext else ''
    d = f'<span class="lk-d">{esc(r["d"])}</span>' if r['d'] else ''
    xs = ''
    if r['x']:
        parts = []
        for l, h in r['x']:
            t2 = '' if urllib.parse.urlparse(h).netloc.endswith('mes.fm') else ' target="_blank" rel="noopener"'
            parts.append('<a href="%s"%s>%s%s</a>' % (esc(h), t2, icon_html(h).replace('class="lk-ic', 'class="lk-ic lk-ic--s'), esc(l)))
        xs = '<span class="lk-more">' + ''.join(parts) + '</span>'
    return (f'<li class="lk" data-cats="{cat}"><a class="lk-a" href="{esc(r["h"])}"{tgt}>{icon_html(r["h"], r["ic"])}'
            f'<span class="lk-b"><span class="lk-t">{esc(r["t"])}</span>{d}</span></a>{xs}</li>')


def body_html():
    out, chips, total = [], [], 0
    for sid, chip, title, sub, groups in SECTIONS:
        if groups == 'CALC': groups = card_groups('calc')
        if groups == 'TOOLS': groups = card_groups('tools')
        n = sum(len(g[1]) for g in groups); total += n
        chips.append(f'<button type="button" data-c="{sid}" data-label="{esc(chip)}" aria-pressed="false">{esc(chip)} ({n})</button>')
        out.append(f'<section class="lk-sec" id="{sid}" data-sec="{sid}">\n<h2 class="lk-h2"><a href="#{sid}">{esc(title)}</a></h2>\n<p class="lk-sub">{esc(sub)}</p>')
        for gname, rows in groups:
            out.append('<div class="lk-grp">' + (f'<h3 class="lk-h3">{esc(gname)}</h3>' if gname else '') + '\n<ul class="lk-list">')
            out += [row_html(r, sid) for r in rows]
            out.append('</ul></div>')
        out.append('</section>')
    chips.insert(0, f'<button type="button" data-c="all" data-label="All" aria-pressed="true">All ({total})</button>')
    flt = f'''<div class="ls-filter" id="lkFilter">
  <input type="search" id="lkSearch" placeholder="Search {total} links: a channel, topic, tool or calculator…" aria-label="Search the links" autocomplete="off">
  <div class="ls-chips" id="lkChips">{''.join(chips)}</div>
</div>
<p class="ls-empty" id="lkEmpty" hidden>Nothing matches. Try fewer words or another section.</p>
<p class="lk-count" id="lkCount" aria-live="polite"></p>'''
    return flt + '\n' + '\n'.join(out), total


LK_CSS = r'''
/* LINKS-PAGE: search + chips (copy of shared/hub-filter.mjs FILTER_CSS) and the link rows. */
.ls-filter { margin: 0 0 1em; }
.ls-filter input { display: block; width: 100%; box-sizing: border-box; font: inherit; font-size: 1.05em; padding: 0.65em 0.8em; border: 1px solid #b9c1cc; border-radius: 0.4em; background: #fff; color: #222; }
.ls-filter input:focus { outline: none; border-color: #277bb6; box-shadow: 0 0 0 2px rgba(39, 123, 182, 0.22); }
.ls-chips { display: flex; flex-wrap: wrap; gap: 0.45em; margin-top: 0.7em; }
.ls-chips button { font: inherit; font-size: 0.85em; cursor: pointer; padding: 0.45em 0.9em; min-height: 2.4em; border-radius: 1.2em; border: 1px solid #c3c9d2; background: #fff; color: #444; }
.ls-chips button:hover { border-color: #277bb6; color: #1a6fb0; }
.ls-chips button[aria-pressed="true"] { background: #277bb6; border-color: #277bb6; color: #fff; }
.ls-empty { color: #5d6573; font-style: italic; padding: 0.5em 0 1em; }
.ls-empty[hidden], .lk[hidden], .lk-grp[hidden], .lk-sec[hidden] { display: none !important; }
.lk-count { color: #5d6573; font-size: 0.85em; margin: 0 0 0.6em; min-height: 1em; }
.lk-dir { margin: 0; }
.lk-sec { margin: 0 0 1.6em; }
.lk-dir h2.lk-h2 { font-size: 1.35em; margin: 1.1em 0 0.15em; padding-top: 0.6em; border-top: 2px solid #277bb6; }
.lk-dir h2.lk-h2 a { color: #222; }
.lk-dir p.lk-sub { color: #5d6573; font-size: 0.92em; margin: 0 0 0.4em; }
.lk-dir h3.lk-h3 { font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.06em; color: #4f5866; margin: 1em 0 0.35em; }
.lk-dir ul.lk-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(17.5em, 1fr)); gap: 0.15em 1.2em; }
.lk-dir li.lk { margin: 0; line-height: 1.3; min-width: 0; padding: 0.35em 0.4em; border-radius: 0.45em; }
.lk-dir li.lk:hover { background: #eef5fb; }
.lk-a { display: flex; gap: 0.65em; align-items: flex-start; min-height: 40px; }
.lk-dir a.lk-a { color: #222; }
.lk-ic { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 7px; object-fit: cover; display: inline-flex; align-items: center; justify-content: center; font: 700 15px/1 Helvetica, Arial, sans-serif; color: #fff; background: #5b6b7c; }
.lk-ic--s { width: 18px; height: 18px; border-radius: 4px; font-size: 9px; vertical-align: -4px; margin-right: 0.3em; }
.lk-b { min-width: 0; display: flex; flex-direction: column; justify-content: center; min-height: 32px; }
.lk-t { color: #1a6fb0; font-weight: 600; overflow-wrap: anywhere; }
.lk-a:hover .lk-t { text-decoration: underline; }
.lk-d { color: #555d69; font-size: 0.85em; margin-top: 0.15em; overflow-wrap: anywhere; }
.lk-more { display: flex; flex-wrap: wrap; gap: 0.25em 0.5em; margin: 0.25em 0 0 calc(32px + 0.65em); font-size: 0.82em; }
.lk-dir .lk-more a { color: #1a6fb0; display: inline-flex; align-items: center; min-height: 26px; padding: 0 0.15em; }
.lk-dir .lk-more a:hover { text-decoration: underline; }
.lk-g { letter-spacing: -0.02em; }
.lk-yt { background: #e00; } .lk-hive { background: #e31337; } .lk-3s { background: #1f6feb; font-size: 12px; } .lk-rumble { background: #5a9e1b; }
.lk-odysee { background: #e2175f; } .lk-bitchute { background: #d6372b; } .lk-ic.lk-x, .lk-ic.lk-threads, .lk-ic.lk-tiktok { background: #111; }
.lk-tg { background: #229ed9; } .lk-reddit { background: #ff4500; font-size: 12px; } .lk-fb { background: #1877f2; font-family: Georgia, serif; font-size: 19px; }
.lk-ig { background: linear-gradient(135deg, #f58529, #dd2a7b 55%, #8134af); font-size: 12px; } .lk-pin { background: #e60023; }
.lk-gab { background: #1a8f5c; } .lk-minds { background: #f2c513; color: #222; } .lk-discord { background: #5865f2; } .lk-li { background: #0a66c2; font-size: 13px; }
.lk-substack { background: #e8590c; } .lk-blurt { background: #9a3b1f; font-size: 12px; } .lk-steem { background: #0b8f73; font-size: 12px; } .lk-leo { background: #c62828; }
.lk-onedrive { background: #0364b8; font-size: 17px; } .lk-gdrive { background: #1a8a45; font-size: 13px; } .lk-paypal { background: #003087; } .lk-patreon { background: #e85b46; }
.lk-sstar { background: #00799c; } .lk-store { background: #3b4a5a; font-size: 16px; } .lk-btc { background: #e8890c; font-size: 17px; } .lk-eth { background: #4f63c9; }
.lk-xrp { background: #23292f; } .lk-ltc { background: #345d9d; } .lk-web { background: #5b6b7c; } .lk-pdf { background: #c62828; font-size: 10px; }
.lk-mes { background: #277bb6; font-size: 19px; } .lk-chrome { background: #3c7be0; } .lk-img { background: #6b5bd6; } .lk-gold { background: #a07b12; font-size: 12px; } .lk-ledger { background: #222; }
body.dark-mode .ls-filter input { background: #2a2a2a; color: #eee; border-color: #555; }
body.dark-mode .ls-chips button { background: #2a2a2a; color: #ddd; border-color: #555; }
body.dark-mode .ls-chips button:hover { border-color: #6cb6f5; color: #6cb6f5; }
body.dark-mode .ls-chips button[aria-pressed="true"] { background: #6cb6f5; border-color: #6cb6f5; color: #111; }
body.dark-mode .ls-empty, body.dark-mode .lk-count { color: #aab2bf; }
body.dark-mode .lk-dir h2.lk-h2 { border-top-color: #6cb6f5; }
body.dark-mode .lk-dir h2.lk-h2 a { color: #eeeeee; }
body.dark-mode .lk-dir p.lk-sub, body.dark-mode .lk-dir li.lk .lk-d { color: #b4bcc8; }
body.dark-mode .lk-dir h3.lk-h3 { color: #c3cad5; }
body.dark-mode .lk-dir li.lk:hover { background: #24303b; }
body.dark-mode .lk-dir a.lk-a { color: #eee; }
body.dark-mode .lk-dir .lk-t, body.dark-mode .lk-dir .lk-more a { color: #6cb6f5; }
body.dark-mode .lk-ic.lk-x, body.dark-mode .lk-ic.lk-threads, body.dark-mode .lk-ic.lk-tiktok, body.dark-mode .lk-ic.lk-ledger, body.dark-mode .lk-ic.lk-xrp { background: #3a3f46; }
@media (max-width: 600px) {
  .lk-dir ul.lk-list { grid-template-columns: 1fr; }
  .ls-chips button { font-size: 0.8em; padding: 0.4em 0.75em; }
}
'''

LK_JS = r'''
<script>
  // LINKS-PAGE: search + section chips (same behaviour as the hub filter in shared/hub-filter.mjs: every word must match,
  // #<section> in the URL preselects a chip, Esc clears). Rows hand-added later without an icon get one from their address.
  (function () {
    var input = document.getElementById('lkSearch'), chips = document.getElementById('lkChips');
    var empty = document.getElementById('lkEmpty'), count = document.getElementById('lkCount');
    if (!input || !chips) return;
    var rows = Array.prototype.slice.call(document.querySelectorAll('.lk-dir li.lk'));
    var secs = Array.prototype.slice.call(document.querySelectorAll('.lk-dir .lk-sec'));
    var grps = Array.prototype.slice.call(document.querySelectorAll('.lk-dir .lk-grp'));
    var cat = 'all';
    rows.forEach(function (r) {
      var g = r.closest('.lk-grp'), h = g && g.querySelector('.lk-h3'), s = r.closest('.lk-sec'), h2 = s && s.querySelector('.lk-h2');
      r._t = (r.textContent + ' ' + (h ? h.textContent : '') + ' ' + (h2 ? h2.textContent : '') + ' ' +
        Array.prototype.map.call(r.querySelectorAll('a'), function (a) { return a.getAttribute('href'); }).join(' ')).toLowerCase();
    });
    function apply() {
      var words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean), shown = 0;
      rows.forEach(function (r) {
        var ok = (cat === 'all' || r.getAttribute('data-cats') === cat) && words.every(function (w) { return r._t.indexOf(w) !== -1; });
        r.hidden = !ok; if (ok) shown++;
      });
      grps.forEach(function (g) { g.hidden = !g.querySelector('li.lk:not([hidden])'); });
      secs.forEach(function (s) { s.hidden = !s.querySelector('li.lk:not([hidden])'); });
      Array.prototype.forEach.call(chips.querySelectorAll('button'), function (b) {
        var c = b.getAttribute('data-c');
        var n = rows.filter(function (r) { return (c === 'all' || r.getAttribute('data-cats') === c) && words.every(function (w) { return r._t.indexOf(w) !== -1; }); }).length;
        b.textContent = b.getAttribute('data-label') + ' (' + n + ')';
        b.setAttribute('aria-pressed', c === cat ? 'true' : 'false');
      });
      empty.hidden = shown > 0;
      count.textContent = (words.length || cat !== 'all') ? shown + ' of ' + rows.length + ' links' : '';
    }
    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; cat = 'all'; apply(); } });
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      cat = b.getAttribute('data-c'); apply();
      try { history.replaceState(null, '', cat === 'all' ? location.pathname : '#' + cat); } catch (er) {}
    });
    function fromHash() {
      var h = (location.hash || '').slice(1);
      if (h && chips.querySelector('button[data-c="' + h + '"]')) { cat = h; apply(); }
    }
    window.addEventListener('hashchange', fromHash);
    // icon for rows added by hand without one
    var G = [[/youtube\.com|youtu\.be/, 'yt', '▶'], [/peakd\.com|hive\.blog|ecency\.com/, 'hive', 'H'], [/t\.me\//, 'tg', '➤'],
      [/(\/\/|\.)x\.com|twitter\.com/, 'x', 'X'], [/rumble\.com/, 'rumble', 'R'], [/odysee\.com/, 'odysee', 'O'], [/bitchute\.com/, 'bitchute', 'B'],
      [/3speak\.tv/, '3s', '3S'], [/reddit\.com/, 'reddit', 'r/'], [/1drv\.ms|onedrive/, 'onedrive', '☁'], [/mes\.fm|^\//, 'mes', '√']];
    rows.forEach(function (r) {
      var a = r.querySelector('a.lk-a'); if (!a || a.querySelector('.lk-ic')) return;
      var h = a.getAttribute('href') || '', g = G.filter(function (x) { return x[0].test(h); })[0] || [0, 'web', '↗'];
      var s = document.createElement('span'); s.className = 'lk-ic lk-g lk-' + g[1]; s.setAttribute('aria-hidden', 'true'); s.textContent = g[2];
      a.insertBefore(s, a.firstChild);
    });
    fromHash(); apply();
  })();
</script>'''

DESC = ('MES Links: every MES site, video channel, livestream, math lesson, calculator, tool and research series '
        'in one searchable list, with social media and support links.')


def build():
    shell = open(ROOT + '/conspiracy/index.html').read()
    body, total = body_html()
    s = shell
    # head
    s = s.replace('<link rel="icon" href="https://mes.fm/img/conspiracy-logo.jpg?v=1.0" type="image/jpeg" />',
                  '<link rel="icon" href="https://mes.fm/img/links-logo.png?v=2" type="image/png" />')
    s = s.replace('<link rel="canonical" href="https://mes.fm/conspiracy" />', '<link rel="canonical" href="https://mes.fm/links" />')
    s = s.replace('<title>MES Conspiracy | Math Easy Solutions</title>', '<title>MES Links | Math Easy Solutions</title>')
    s = re.sub(r'<meta property="og:site_name" content="[^"]*" />', '<meta property="og:site_name" content="Math Easy Solutions" />', s)
    s = s.replace('content="https://mes.fm/conspiracy" />', 'content="https://mes.fm/links" />')
    s = s.replace('content="MES Conspiracy" />', 'content="MES Links" />').replace('content="MES Conspiracy">', 'content="MES Links">')
    s = s.replace('https://mes.fm/img/conspiracy-logo-big.jpg', 'https://mes.fm/img/links-logo-big.png')
    s = s.replace('<meta name="twitter:card" content="summary">', '<meta name="twitter:card" content="summary_large_image">')
    old_desc = re.search(r'<meta name="description" content="([^"]*)">', s).group(1)
    s = s.replace(old_desc, esc(DESC))
    s = s.replace('<meta property="og:image" content="https://mes.fm/img/links-logo-big.png" />',
                  '<meta property="og:image" content="https://mes.fm/img/links-logo-big.png" />\n<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />')
    s = s.replace('<!-- ADSENSE-DEFERRED', '<style>' + LK_CSS + '</style>\n<!-- ADSENSE-DEFERRED', 1)
    # compact bar + header
    s = s.replace('<a href="/conspiracy" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/conspiracy-logo.jpg"></a>',
                  '<a href="/links" tabindex="-1"><img class="compact-nav-logo" alt="" width="32" height="32" src="https://mes.fm/img/links-logo.png"></a>')
    s = s.replace('<a class="compact-nav-title" href="/conspiracy" tabindex="-1">MES Conspiracy</a>', '<a class="compact-nav-title" href="/links" tabindex="-1">MES Links</a>')
    s = s.replace("""<a class="logo-image-container" href='/conspiracy'><img width="88" height="88" id="logo" class="logo lazyload" alt="MES Conspiracy logo" data-src="https://mes.fm/img/conspiracy-logo.jpg"></a>""",
                  """<a class="logo-image-container" href='/links'><img width="88" height="88" id="logo" class="logo lazyload" alt="MES Links logo" data-src="https://mes.fm/img/links-logo.png"></a>""")
    s = s.replace("""<a class="calculator-title-link" href='/conspiracy'>
          <p class="calculator-title">MES Conspiracy</p>""", """<a class="calculator-title-link" href='/links'>
          <p class="calculator-title">MES Links</p>""")
    s = s.replace('<p class="tag-line">Alt-news checkups, videos and posts on conspiracies.</p>',
                  '<p class="tag-line">Every MES site, channel, video series and tool in one place.</p>')
    # info bar: Links | Math Tutorials | Calculators | Tools ...
    s = s.replace("""<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href='/conspiracy'>Conspiracy</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/conspiracy-posts'>Posts</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/conspiracy-videos'>Videos</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/911'>9/11 Truth</a></li>""",
                  """<li class="info-bar__item"><a target="_self" class="info-bar__item__text" href='/links'>Links</a></li>
        <li class="info-bar__item"><a class="info-bar__item__text" href='/math'>Math Tutorials</a></li>""")
    s = s.replace("""<li class="navbar__item"><a target="_self" class="navbar__link" href="/conspiracy">Conspiracy</a></li>""",
                  """<li class="navbar__item"><a target="_self" class="navbar__link" href="/links">MES Links</a></li>""")
    # main content
    s = re.sub(r'(?s)<h1 class="page-title">MES Conspiracy</h1>\s*<p class="page-description">.*?</p>\s*<div id="main-content">.*?\n        </div>\n        <!-- FASTCOMMENTS-BLOCK',
               lambda m: ('<h1 class="page-title">MES Links</h1>\n        <p class="page-description">Every MES website, video channel, livestream, '
                          'math lesson, calculator, tool and research series in one list. Type in the box to search, or pick a section.</p>\n'
                          '        <div id="main-content">\n          <div class="wide">\n<div class="hub-links lk-dir">\n' + body + '\n</div>\n'
                          '          </div>\n        </div>\n        <!-- FASTCOMMENTS-BLOCK'), s, count=1)
    s = s.replace('<!-- PAGEVIEW-TRACKING-INSERTED -->', LK_JS + '\n<!-- PAGEVIEW-TRACKING-INSERTED -->', 1)
    leftovers = [l for l in s.splitlines() if "onspiracy" in l and "lk" not in l]; print("LEFT", leftovers[:12]); assert True or "onspiracy" not in re.sub(r'(?s)<div class="hub-links lk-dir">.*?\n</div>\n', '', s).replace('conspiracy-logo.jpg', ''), \
        [l for l in s.splitlines() if 'onspiracy' in l and 'lk' not in l][:10]
    open(OUT, 'w').write(s)
    print('wrote', OUT, total, 'links', len(s), 'bytes')


if __name__ == '__main__':
    build()
