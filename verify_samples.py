import os
import json

dir_path = r'C:\Users\HHeltzinger\Desktop\WaterIsLife\MetaData_Production'
prefixes_seen = set()
samples = []
def try_int(s):
    try: return int(s.split('.')[0])
    except: return s

files = sorted([f for f in os.listdir(dir_path) if f.endswith('.json')], key=try_int)

for f in files:
    with open(os.path.join(dir_path, f), 'r') as j:
        data = json.load(j)
        sym = data.get('symbol')
        if sym not in prefixes_seen:
            prefixes_seen.add(sym)
            samples.append(data)
    if len(prefixes_seen) >= 13:
        break

for s in samples:
    print(f"--- Prefix: {s.get('symbol')} ---")
    print(json.dumps(s, indent=2))
