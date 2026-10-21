import base64, json, os, sys
D = os.path.dirname(os.path.abspath(__file__))
saida = os.path.join(D, 'saida')
man = json.load(open(os.path.join(saida, 'manifesto.json')))
folhas = {}
for g, sub in (('m', 'masculino'), ('f', 'feminino')):
    for n in man['camadas']:
        p = os.path.join(saida, sub, n + '.png')
        folhas[f'{g}/{n}'] = 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
html = open(os.path.join(D, 'demo_template.html')).read().replace('__DATA__', json.dumps(dict(manifesto=man, folhas=folhas)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, 'provador-ninja.html')
open(out, 'w').write(html)
print(out, len(html))
