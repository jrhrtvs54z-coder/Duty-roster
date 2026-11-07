"""Build the app from src/.

    python3 src/build.py                 # index.html, manifest, sw.js at the repo root (GitHub Pages)
    python3 src/build.py --artifact OUT  # also the page body for the Claude artifact version
"""
import json, pathlib, re, sys

VERSION = '1.2.0'
SRC = pathlib.Path(__file__).resolve().parent
ROOT = SRC.parent


def body():
    page = (SRC / 'page.html').read_text()
    assert '/*@@ENGINE@@*/' in page and '/*@@APP@@*/' in page
    return page.replace('/*@@ENGINE@@*/', (SRC / 'engine.js').read_text()).replace('/*@@APP@@*/', (SRC / 'app.js').read_text())


def build_app():
    page = re.sub(r'<title>.*?</title>\s*', '', body(), count=1)
    page = page.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
    head = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Alert Duty Roster</title>
<meta name="description" content="Alert duty roster for the squadron scheduler. Everything stays on this phone.">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Duty Roster">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#141B19">
<meta name="format-detection" content="telephone=no">
<meta name="app-version" content="{VERSION}">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}html{{scroll-padding-top:env(safe-area-inset-top,0px)}}body{{margin:0;padding:0}}img{{max-width:100%}}[hidden]:not([hidden=until-found i]){{display:none!important}}</style>
</head>
<body>
'''
    (ROOT / 'index.html').write_text(head + page + '\n</body>\n</html>\n')
    manifest = {
        'name': 'Alert Duty Roster', 'short_name': 'Duty Roster',
        'description': 'Alert duty roster for the squadron scheduler. Your data stays on this phone.',
        'id': './', 'start_url': './', 'scope': './', 'display': 'standalone',
        'background_color': '#ECEFED', 'theme_color': '#FFFFFF',
        'icons': [
            {'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
            {'src': 'icons/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'}]}
    (ROOT / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2) + '\n')
    (ROOT / 'sw.js').write_text((SRC / 'sw.js').read_text().replace('@@VERSION@@', VERSION))
    (ROOT / '.nojekyll').write_text('')
    print('app built:', ROOT / 'index.html')


if __name__ == '__main__':
    build_app()
    if '--artifact' in sys.argv:
        out = pathlib.Path(sys.argv[sys.argv.index('--artifact') + 1])
        out.write_text(body())
        print('artifact page built:', out)
