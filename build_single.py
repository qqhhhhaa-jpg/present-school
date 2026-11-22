import re
H=''
def strip(src):
    src=re.sub(r'^import .*?;\s*$','',src,flags=re.M)
    return src
util=strip(open(H+'js/util.js').read()).replace('export ','')
store=strip(open(H+'js/store.js').read())
names=re.findall(r'^export (?:const|function|let) (\w+)',store,flags=re.M)
store=re.sub(r'^export ','',store,flags=re.M)
store='const db = (() => {\n'+store+'\nreturn { '+', '.join(names)+' };\n})();\n'
views=re.sub(r'^export ','',strip(open(H+'js/views.js').read()),flags=re.M)
app=strip(open(H+'js/app.js').read())
app=re.sub(r'^export ','',app,flags=re.M)
js='"use strict";\n(() => {\n'+util+'\n'+store+'\n'+views+'\n'+app+'\n})();\n'
css=open(H+'css/app.css').read()
import re as _re
FAV=_re.search(r'<link rel="icon" href="[^"]*">',open(H+'index.html').read()).group(0)
html=f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>حاضر · الحضور والانصراف</title>
<meta name="theme-color" content="#1E2B5C">
{FAV}
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="حاضر">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap">
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<noscript>يحتاج هذا الموقع تفعيل JavaScript.</noscript>
<script>
{js}
</script>
</body>
</html>
'''
open('حاضر.html','w').write(html)
art=f'''<title>حاضر · الحضور والانصراف</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap">
<style>
{css}
</style>
<div id="app"></div>
<script>
{js}
</script>
'''
pass
print(len(names), 'store exports')
