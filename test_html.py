
from html.parser import HTMLParser
import os

class MyHTMLParser(HTMLParser):
    def __init__(self, filepath):
        super().__init__()
        self.stack = []
        self.void_elements = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
        self.filepath = filepath

    def handle_starttag(self, tag, attrs):
        if tag not in self.void_elements:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in self.void_elements:
            return
        # Find the last matching start tag
        for i in reversed(range(len(self.stack))):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return
        print(f'Mismatched closing tag </{tag}> at line {self.getpos()[0]} in {self.filepath}')
        
    def check_remaining(self):
        # We won't print unclosed tags because it's often noisy, but let's see.
        pass

for root, dirs, files in os.walk('.'):
    for f in files:
        if f.endswith('.html'):
            filepath = os.path.join(root, f)
            with open(filepath, 'r', encoding='utf-8') as file:
                content = file.read()
                parser = MyHTMLParser(filepath)
                try:
                    parser.feed(content)
                except Exception as e:
                    print(f'Parse error in {filepath}: {e}')

