"""Read configured public feeds and cache current postings; never applies."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from server import discover
result=discover()
for source in result['coverage']:
    print(f"{source['name']}: {source['count']} ({source['status']})",flush=True)
print(f"Total: {len(result['jobs'])} technical internships")
