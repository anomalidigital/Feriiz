
import os
import re

for root, dirs, files in os.walk('.'):
    for f in files:
        if f.endswith('.html'):
            filepath = os.path.join(root, f)
            try:
                with open(filepath, 'r', encoding='utf-8') as file:
                    content = file.read()
                    scripts = re.findall(r'<script.*?>(.*?)</script>', content, re.DOTALL)
                    for i, script in enumerate(scripts):
                        opening = script.count('{')
                        closing = script.count('}')
                        if opening != closing:
                            print(f'Mismatched braces in {filepath} script block {i+1}: {{={opening}, }}={closing}')
            except Exception as e:
                print(f'Could not read {filepath}: {e}')

